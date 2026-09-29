"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
require("./model.js");
const model = globalThis.CompactLearning;
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "model-fixture.json"), "utf8"));
const referenceSource = fs.readFileSync(path.join(__dirname, "..", fixture.source));
assert.equal(crypto.createHash("sha256").update(referenceSource).digest("hex"), fixture.sourceSha256,
  "Fixture provenance must match the bundled Python source");
let checks = 0;

function close(actual, expected, label) {
  checks += 1;
  if (expected === null || typeof expected !== "number") {
    assert.equal(actual, expected, label);
    return;
  }
  assert.ok(Number.isFinite(actual), `${label}: nonfinite result ${actual}`);
  const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-11);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: actual ${actual}, expected ${expected}, tolerance ${tolerance}`);
}

const rowFields = {
  year: "year", completed: "completed_units", cumulativeGW: "cumulative_completed_gwe",
  doublings: "cumulative_production_doublings", cost: "next_order_lcoe_per_mwh",
  orders: "actual_order_units", delivered: "commissioned_units_this_year",
  operatingUnits: "operating_units", operatingGW: "operating_capacity_gwe",
  lastDeliveredCost: "last_delivered_cohort_lcoe_per_mwh", baselineOrders: "baseline_order_units",
  expanded: "expanded_order", expansionYear: "expansion_trigger_year"
};
const cohortFields = {
  serviceYear: "commission_year", units: "units", cost: "cohort_lcoe_per_mwh",
  capacityGW: "capacity_gwe", premiumPerMWh: "positive_premium_per_mwh",
  annualGeneration: "annual_generation_mwh", annualPremium: "annual_premium_dollars",
  lifetimePremium: "lifetime_premium_dollars", windowYears: "operating_years_in_plot_window",
  windowPremium: "window_premium_dollars"
};

for (const reference of fixture.cases) {
  const actual = model.simulateAll(reference.params).find(c => c.id === reference.scenarioId);
  assert.equal(actual.rows.length, reference.rows.length, reference.name);
  assert.equal(actual.cohorts.length, reference.cohorts.length, reference.name);
  actual.rows.forEach((row, i) => {
    for (const [jsKey, pythonKey] of Object.entries(rowFields)) {
      close(row[jsKey], reference.rows[i][pythonKey], `${reference.name} year ${i} ${jsKey}`);
    }
  });
  actual.cohorts.forEach((cohort, i) => {
    const expected = reference.cohorts[i];
    for (const [jsKey, pythonKey] of Object.entries(cohortFields)) {
      close(cohort[jsKey], expected[pythonKey], `${reference.name} cohort ${i} ${jsKey}`);
    }
    close(cohort.orderYear, expected.order_year === "FOAK" ? null : expected.order_year, "order year");
    close(cohort.experienceAtOrder, expected.experience_at_order === "FOAK" ? null : expected.experience_at_order, "experience at order");
  });
  const js = actual.summary;
  const py = reference.summary;
  const qualified = py.first_next_order_at_or_below_benchmark;
  const target = py.first_next_order_at_or_below_target;
  close(js.wholesaleYear, qualified ? qualified.year : null, "wholesale year");
  close(js.wholesaleUnits, qualified ? qualified.completed_units : null, "wholesale units");
  close(js.wholesaleDeliveryYear, py.first_cohort_at_or_below_benchmark?.commission_year ?? null, "wholesale delivery year");
  close(js.targetYear, target ? target.year : null, "target year");
  close(js.targetUnits, target ? target.completed_units : null, "target units");
  close(js.targetDeliveryYear, py.first_cohort_at_or_below_target?.commission_year ?? null, "target delivery year");
  close(js.targetMinimum.units, py.target_experience_requirement.minimum_completed_units, "minimum target units");
  close(js.targetMinimum.doublings, py.target_experience_requirement.theoretical_doublings, "minimum target doublings");
  close(js.targetMinimum.gwe, py.target_experience_requirement.minimum_cumulative_manufactured_gwe, "minimum target capacity");
  close(js.wholesaleMinimum.units, py.wholesale_experience_requirement.minimum_completed_units, "minimum wholesale units");
  close(js.finalCost, py.endpoint.next_order_lcoe_per_mwh, "final cost");
  close(js.completed, py.endpoint.completed_units, "final completed units");
  close(js.lifetimePremium, py.lifetime_premium_dollars, "lifetime premium");
  close(js.windowPremium, py.window_premium_dollars, "window premium");
  close(js.premiumUnits, py.premium_units, "premium units");
  close(js.premiumPipelineUnits, py.premium_pipeline_units_at_qualification, "premium pipeline units");
}

function scenario(params, id) {
  return model.simulateAll(params).find(c => c.id === id);
}

function invariants(cases) {
  for (const c of cases) {
    const p = c.params;
    const limit = c.compact ? p.compactLimit : p.largeLimit;
    for (const row of c.rows) {
      for (const key of ["cost", "completed", "orders", "delivered", "operatingUnits", "lifetimePremium"]) {
        if (key in row) assert.ok(Number.isFinite(row[key]), `${c.id}: finite ${key}`);
      }
      const delivered = c.cohorts.filter(co => co.serviceYear <= row.year);
      assert.equal(row.completed, delivered.reduce((n, co) => n + co.units, 0));
      const active = delivered.filter(co => row.year < co.serviceYear + p.life);
      assert.equal(row.operatingUnits, active.reduce((n, co) => n + co.units, 0));
      if (c.limited) assert.ok(row.premiumCommitted <= limit, "premium cap counts all commitments including pipeline");
      if (row.year) assert.ok(row.cost <= c.rows[row.year - 1].cost, "no spontaneous cost increase");
      if (row.year && row.delivered === 0) assert.equal(row.cost, c.rows[row.year - 1].cost, "no learning without delivery");
    }
    for (const co of c.cohorts) {
      assert.ok(Number.isInteger(co.units) && co.units > 0);
      assert.ok(co.premiumPerMWh >= 0 && co.lifetimePremium >= co.windowPremium);
      assert.ok(co.serviceYear <= p.horizon, "no beyond-horizon delivery");
      if (co.orderYear !== null) {
        assert.equal(co.cost, c.rows[co.orderYear].cost, "cohort cost fixed at order");
        assert.equal(co.experienceAtOrder, c.rows[co.orderYear].completed);
        assert.ok(co.units * co.sizeMW <= p.capacityCap + 1e-7, "capacity ceiling applies to every order");
      }
    }
    close(c.summary.lifetimePremium, c.cohorts.reduce((n, co) => n + co.lifetimePremium, 0), "premium accounting");
  }
}

invariants(model.simulateAll());
const raised = scenario({ compactLimit: 237 }, "compactLimited");
assert.equal(raised.summary.wholesaleYear, 9);
assert.ok(raised.summary.completed > 237, "economic orders are not bound by the premium demand cap");
assert.equal(raised.summary.premiumUnits, 237);
const pipeline = scenario({ rate: 0, largeLimit: 3 }, "largeLimited");
assert.equal(pipeline.rows[3].completed, 1);
assert.equal(pipeline.rows[3].premiumCommitted, 3);
assert.equal(pipeline.rows[6].orders, 0, "pending commitments exhaust the early demand budget");
assert.equal(pipeline.summary.completed, 3);
const resumed = scenario({ rate: .5, largeLimit: 5 }, "largeLimited");
assert.equal(resumed.summary.wholesaleYear, 14);
assert.equal(resumed.rows[13].orders, 0);
assert.equal(resumed.rows[14].orders, 1, "qualification after an order gap seeds one economic unit");
assert.ok(resumed.summary.completed > 5);

for (const c of model.simulateAll({ rate: 0 })) {
  assert.equal(c.summary.wholesaleYear, null);
  assert.equal(c.summary.targetYear, null);
  assert.equal(c.summary.finalCost, c.compact ? 500 : 250);
  assert.equal(c.summary.targetMinimum.possible, false);
}
for (const c of model.simulateAll({ floor: 10 })) {
  assert.equal(c.summary.targetYear, null);
  assert.equal(c.summary.targetMinimum.possible, false);
}
for (const c of model.simulateAll({ floor: 60, benchmark: 60 })) {
  assert.equal(c.summary.wholesaleYear, null);
  assert.equal(c.summary.wholesaleMinimum.possible, false);
}
for (const c of model.simulateAll({ compactFoak: 30, largeFoak: 30, benchmark: 100,
  earlyScale: 0, growth: 0, compactLimit: 1, largeLimit: 1 })) {
  assert.equal(c.summary.wholesaleYear, 0);
  assert.equal(c.summary.wholesaleDeliveryYear, 0);
  assert.equal(c.rows[0].orders, 1);
  assert.equal(c.summary.premiumUnits, 0);
}
for (const c of model.simulateAll({ capacityCap: 0 })) {
  assert.equal(c.summary.completed, 1);
  assert.ok(c.rows.every(r => r.orders === 0));
}
const noScale = model.simulateAll({ earlyScale: 0 });
assert.equal(noScale.find(c => c.id === "compactSupported").summary.completed, 1);
assert.equal(noScale.find(c => c.id === "largeSupported").summary.completed, 1);
assert.equal(noScale.find(c => c.id === "compactLimited").summary.completed, 31);
const cutoff = scenario({ horizon: 41 }, "compactSupported");
assert.equal(cutoff.summary.targetYear, 41, "price available at final date");
assert.equal(cutoff.summary.targetOrderYear, null, "no invented beyond-horizon order");
assert.equal(cutoff.summary.targetDeliveryYear, null, "no invented delivery");
const delivered = scenario({ horizon: 42 }, "compactSupported");
assert.equal(delivered.summary.targetOrderYear, 41);
assert.equal(delivered.summary.targetDeliveryYear, 42);
const lateLarge = scenario({ horizon: 14, rate: .5, largeLimit: 5 }, "largeLimited");
assert.equal(lateLarge.summary.wholesaleYear, 14);
assert.equal(lateLarge.summary.wholesaleOrderYear, null);
assert.equal(lateLarge.summary.wholesaleDeliveryYear, null);

const normalized = model.normalize({ rate: NaN, floor: 1000, compactFoak: -5,
  largeFoak: Infinity, compactSize: -1, horizon: 1000, compactLead: 0, capacityFactor: -1 });
assert.equal(normalized.rate, .25);
assert.equal(normalized.floor, 80);
assert.ok(normalized.compactFoak > normalized.floor);
assert.ok(normalized.compactSize > 0);
assert.equal(normalized.horizon, 100);
assert.equal(normalized.compactLead, 1);
assert.equal(normalized.capacityFactor, 0);
assert.equal(model.normalize({ benchmark: 200 }).benchmark, 200);
assert.equal(model.minimumExperience(30, 0, 5, 60, 10).units, 1);
assert.equal(model.minimumExperience(500, .25, 10, 10, 10).possible, false);
assert.equal(model.minimumExperience(500, 0, 5, 10, 10).possible, false);
const huge = model.minimumExperience(500, .000001, 5, 10, 10);
assert.equal(huge.possible, true);
assert.equal(huge.representable, false);
assert.equal(huge.units, null);

let seed = 179;
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
}
for (let i = 0; i < 60; i += 1) {
  invariants(model.simulateAll({
    rate: random() * .5, floor: random() * 80, benchmark: 20 + random() * 130,
    horizon: 5 + random() * 95, compactFoak: random() * 700, largeFoak: random() * 350,
    compactSize: 1 + random() * 99, largeSize: 100 + random() * 1900,
    compactLead: 1 + random() * 6, largeLead: 1 + random() * 15,
    growth: random(), capacityCap: random() * 30000, compactLimit: 1 + random() * 500,
    largeLimit: 1 + random() * 100, earlyScale: random() * 3,
    life: 1 + random() * 60, capacityFactor: random()
  }));
}

console.log(`PASS: ${fixture.cases.length} Python parity paths, ${checks.toLocaleString()} numeric comparisons, causal edge cases and 60 randomized invariant runs.`);
