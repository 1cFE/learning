(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    rate: 0.25, floor: 5, benchmark: 60, target: 10, horizon: 45,
    compactFoak: 500, largeFoak: 250, compactSize: 10, largeSize: 1000,
    compactLead: 1, largeLead: 5, growth: 0.5, capacityCap: 25000,
    compactLimit: 31, largeLimit: 7, earlyScale: 1, life: 30,
    capacityFactor: 0.9
  });

  const SCENARIOS = Object.freeze([
    Object.freeze({ id: "compactSupported", name: "Compact · continuing demand", compact: true, limited: false }),
    Object.freeze({ id: "compactLimited", name: "Compact · limited early demand", compact: true, limited: true }),
    Object.freeze({ id: "largeLimited", name: "Large · limited early demand", compact: false, limited: true }),
    Object.freeze({ id: "largeSupported", name: "Large · continuing demand", compact: false, limited: false })
  ]);

  const EARLY_COMPACT = Object.freeze([
    2, 4, 8, 16, 24, 32, 40, 50, 60, 70,
    80, 90, 100, 110, 120, 130, 140, 150, 160, 170
  ]);

  function finiteNumber(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function bounded(value, fallback, low, high, integer) {
    const number = Math.max(low, Math.min(high, finiteNumber(value, fallback)));
    return integer ? Math.round(number) : number;
  }

  function normalize(input) {
    const source = input && typeof input === "object" ? input : {};
    const p = {};
    p.rate = bounded(source.rate, DEFAULTS.rate, 0, 0.5);
    p.floor = bounded(source.floor, DEFAULTS.floor, 0, 80);
    p.benchmark = bounded(source.benchmark, DEFAULTS.benchmark, 20, 200);
    p.target = bounded(source.target, DEFAULTS.target, 0, 10000);
    p.horizon = bounded(source.horizon, DEFAULTS.horizon, 5, 100, true);
    // Keep a positive learnable contribution when malformed inputs put FOAK below the floor.
    p.compactFoak = Math.max(p.floor + 0.01, bounded(source.compactFoak, DEFAULTS.compactFoak, 0.01, 1000000));
    p.largeFoak = Math.max(p.floor + 0.01, bounded(source.largeFoak, DEFAULTS.largeFoak, 0.01, 1000000));
    p.compactSize = bounded(source.compactSize, DEFAULTS.compactSize, 0.01, 1000000);
    p.largeSize = bounded(source.largeSize, DEFAULTS.largeSize, 0.01, 1000000);
    p.compactLead = bounded(source.compactLead, DEFAULTS.compactLead, 1, 100, true);
    p.largeLead = bounded(source.largeLead, DEFAULTS.largeLead, 1, 100, true);
    p.growth = bounded(source.growth, DEFAULTS.growth, 0, 3);
    p.capacityCap = bounded(source.capacityCap, DEFAULTS.capacityCap, 0, 1000000000);
    p.compactLimit = bounded(source.compactLimit, DEFAULTS.compactLimit, 1, 1000000000, true);
    p.largeLimit = bounded(source.largeLimit, DEFAULTS.largeLimit, 1, 1000000000, true);
    p.earlyScale = bounded(source.earlyScale, DEFAULTS.earlyScale, 0, 3);
    p.life = bounded(source.life, DEFAULTS.life, 1, 100, true);
    p.capacityFactor = bounded(source.capacityFactor, DEFAULTS.capacityFactor, 0, 1);
    return p;
  }

  function costAt(foak, rate, floor, completed) {
    if (rate === 0) return foak;
    return floor + (foak - floor) * Math.pow(1 - rate, Math.log2(completed));
  }

  function minimumExperience(foak, rate, floor, threshold, sizeMW) {
    // Positional signature; an object form is also accepted for standalone consumers.
    if (foak && typeof foak === "object") {
      const values = foak;
      return minimumExperience(values.foak, values.rate, values.floor,
        values.threshold === undefined ? values.target : values.threshold,
        values.sizeMW === undefined ? values.size : values.sizeMW);
    }
    const values = [foak, rate, floor, threshold, sizeMW];
    const empty = { possible: false, units: null, doublings: null, gwe: null,
      integerDoublings: null, representable: true, reason: null };
    if (!values.every(Number.isFinite) || foak < 0 || floor < 0 || sizeMW <= 0 ||
        rate < 0 || rate >= 1 || foak < floor) {
      return { ...empty, reason: "Invalid learning parameters" };
    }
    if (foak <= threshold) {
      return { ...empty, possible: true, units: 1, doublings: 0,
        integerDoublings: 0, gwe: sizeMW / 1000, reason: "FOAK already meets the threshold" };
    }
    if (threshold <= floor) {
      return { ...empty, reason: "The fixed contribution is at or above the threshold" };
    }
    if (rate === 0) return { ...empty, reason: "Zero learning cannot reduce the FOAK cost" };
    const doublings = Math.log((threshold - floor) / (foak - floor)) / Math.log1p(-rate);
    const rawUnits = Math.pow(2, doublings);
    if (!Number.isFinite(rawUnits) || rawUnits > Number.MAX_SAFE_INTEGER - 2) {
      return { ...empty, possible: true, doublings: Number.isFinite(doublings) ? doublings : null, representable: false,
        reason: "The finite mathematical unit requirement exceeds exact numeric representation" };
    }
    let units = Math.max(1, Math.ceil(rawUnits));
    // Correct a possible floating-point rounding at an exact integer threshold.
    if (costAt(foak, rate, floor, units) > threshold) units += 1;
    if (units > 1 && costAt(foak, rate, floor, units - 1) <= threshold) units -= 1;
    return { ...empty, possible: true, units, doublings, integerDoublings: Math.log2(units),
      gwe: units * sizeMW / 1000 };
  }

  function earlyOrders(scenario, year, p) {
    if (scenario.compact) {
      const raw = year < EARLY_COMPACT.length ? EARLY_COMPACT[year] : 170 + 10 * (year - 19);
      return scenario.limited ? raw : Math.ceil(raw * p.earlyScale);
    }
    if (scenario.limited) return year % 3 === 0 ? 1 : 0;
    return Math.ceil(Math.min(year + 1, 10) * p.earlyScale);
  }

  function firstWhere(items, predicate) {
    return items.find(predicate) || null;
  }

  function sum(items, key) {
    return items.reduce((total, item) => total + item[key], 0);
  }

  function simulate(scenario, p) {
    const size = scenario.compact ? p.compactSize : p.largeSize;
    const foak = scenario.compact ? p.compactFoak : p.largeFoak;
    const lead = scenario.compact ? p.compactLead : p.largeLead;
    const premiumLimit = scenario.compact ? p.compactLimit : p.largeLimit;
    const unitCap = Math.floor(p.capacityCap / size);
    const pending = Array.from({ length: p.horizon + 1 }, () => []);
    const cohorts = [{ orderYear: null, serviceYear: 0, units: 1, cost: foak,
      experienceAtOrder: null, sizeMW: size, expanded: false }];
    const rows = [];
    let completed = 1;
    let previousOrders = 0;
    let lastDeliveredCost = foak;
    let expansionYear = null;
    let premiumCommitted = foak > p.benchmark ? 1 : 0;

    for (let year = 0; year <= p.horizon; year += 1) {
      const due = pending[year];
      const delivered = sum(due, "units");
      completed += delivered;
      if (due.length) lastDeliveredCost = due[due.length - 1].cost;
      const cost = costAt(foak, p.rate, p.floor, completed);
      const canOrder = year + lead <= p.horizon;
      const qualified = cost <= p.benchmark;
      let baselineOrders = canOrder ? Math.min(earlyOrders(scenario, year, p), unitCap) : 0;
      if (scenario.limited && !qualified) {
        baselineOrders = Math.min(baselineOrders, Math.max(0, premiumLimit - premiumCommitted));
      }
      let orders = baselineOrders;
      let expanded = false;
      if (canOrder && qualified) {
        // A final early cohort can qualify after an ordering gap. Seed one competitive unit.
        orders = Math.min(Math.max(1, Math.ceil(previousOrders * (1 + p.growth))), unitCap);
        expanded = orders > 0;
        if (expanded && expansionYear === null) expansionYear = year;
      }
      if (orders > 0) {
        const cohort = { orderYear: year, serviceYear: year + lead, units: orders, cost,
          experienceAtOrder: completed, sizeMW: size, expanded };
        cohorts.push(cohort);
        pending[cohort.serviceYear].push(cohort);
        if (cost > p.benchmark) premiumCommitted += orders;
      }
      const active = cohorts.filter(c => c.serviceYear <= year && year < c.serviceYear + p.life);
      const operatingUnits = sum(active, "units");
      rows.push({ year, completed, cumulativeGW: completed * size / 1000,
        doublings: Math.log2(completed), cost, orders, delivered: delivered + (year === 0 ? 1 : 0),
        operatingUnits, operatingGW: operatingUnits * size / 1000, lastDeliveredCost,
        baselineOrders, expanded, expansionYear, premiumCommitted });
      previousOrders = orders;
    }

    for (const cohort of cohorts) {
      cohort.capacityGW = cohort.units * size / 1000;
      cohort.premiumPerMWh = Math.max(cohort.cost - p.benchmark, 0);
      cohort.annualGeneration = cohort.units * size * 8760 * p.capacityFactor;
      cohort.annualPremium = cohort.annualGeneration * cohort.premiumPerMWh;
      cohort.lifetimePremium = cohort.annualPremium * p.life;
      cohort.windowYears = Math.max(0, Math.min(p.life, p.horizon - cohort.serviceYear));
      cohort.windowPremium = cohort.annualPremium * cohort.windowYears;
    }

    const wholesaleRow = firstWhere(rows, row => row.cost <= p.benchmark);
    const targetRow = firstWhere(rows, row => row.cost <= p.target);
    const wholesaleOrder = firstWhere(cohorts, c => c.orderYear !== null && c.cost <= p.benchmark);
    const targetOrder = firstWhere(cohorts, c => c.orderYear !== null && c.cost <= p.target);
    const wholesaleDelivery = firstWhere(cohorts, c => c.cost <= p.benchmark);
    const targetDelivery = firstWhere(cohorts, c => c.cost <= p.target);
    const premiumCohorts = cohorts.filter(c => c.premiumPerMWh > 0);
    const pipeline = wholesaleRow ? premiumCohorts.filter(c => c.serviceYear > wholesaleRow.year) : [];
    const firstExpanded = firstWhere(cohorts, c => c.expanded);
    const endpoint = rows[rows.length - 1];
    const summary = {
      wholesaleYear: wholesaleRow ? wholesaleRow.year : null,
      wholesalePriceYear: wholesaleRow ? wholesaleRow.year : null,
      wholesaleOrderYear: wholesaleOrder ? wholesaleOrder.orderYear : null,
      wholesaleDeliveryYear: wholesaleDelivery ? wholesaleDelivery.serviceYear : null,
      wholesaleUnits: wholesaleRow ? wholesaleRow.completed : null,
      wholesaleGW: wholesaleRow ? wholesaleRow.cumulativeGW : null,
      wholesaleMinimum: minimumExperience(foak, p.rate, p.floor, p.benchmark, size),
      targetYear: targetRow ? targetRow.year : null,
      targetPriceYear: targetRow ? targetRow.year : null,
      targetOrderYear: targetOrder ? targetOrder.orderYear : null,
      targetDeliveryYear: targetDelivery ? targetDelivery.serviceYear : null,
      targetUnits: targetRow ? targetRow.completed : null,
      targetGW: targetRow ? targetRow.cumulativeGW : null,
      targetMinimum: minimumExperience(foak, p.rate, p.floor, p.target, size),
      finalCost: endpoint.cost, completed: endpoint.completed, doublings: endpoint.doublings,
      cumulativeGW: endpoint.cumulativeGW, operatingUnits: endpoint.operatingUnits,
      operatingGW: endpoint.operatingGW, lifetimePremium: sum(cohorts, "lifetimePremium"),
      windowPremium: sum(cohorts, "windowPremium"), premiumUnits: sum(premiumCohorts, "units"),
      premiumGW: sum(premiumCohorts, "capacityGW"), premiumPipelineUnits: sum(pipeline, "units"),
      premiumPipelineGW: sum(pipeline, "capacityGW"),
      expansionYear: firstExpanded ? firstExpanded.orderYear : null,
      firstExpandedDeliveryYear: firstExpanded ? firstExpanded.serviceYear : null,
      endpointYear: p.horizon
    };
    return { ...scenario, params: { ...p }, rows, cohorts, summary };
  }

  function simulateAll(input) {
    const p = normalize(input);
    return SCENARIOS.map(scenario => simulate(scenario, p));
  }

  root.CompactLearning = Object.freeze({ DEFAULTS, SCENARIOS, normalize, simulateAll, minimumExperience });
})(globalThis);
