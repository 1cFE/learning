#!/usr/bin/env python3
"""Four hypothetical fusion deployment cases with explicit cost-premium accounting.

Numerical reproduction uses only the standard library. Plotting needs matplotlib.
Costs, production, support and the market expansion rule are chosen assumptions.
No fuel, confinement or component power balance is specified.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HORIZON = 45
LIFE_YEARS = 30
CAPACITY_FACTOR = .90
FLOOR = 5.0
BENCHMARK = 60.0
TARGET = 10.0
PRIMARY_RATE = .25
SENSITIVITY_RATE = .10
ORDER_GROWTH = .50
ANNUAL_CAPACITY_CEILING_MWE = 25000
COMPACT_PRE_ORDERS = [2, 4, 8, 16, 24, 32, 40, 50, 60, 70,
                      80, 90, 100, 110, 120, 130, 140, 150, 160, 170]


@dataclass(frozen=True)
class Scenario:
    name: str
    size_mwe: int
    foak_lcoe: float
    lead_years: int
    schedule: str
    expands: bool


SCENARIOS = [
    Scenario("Compact, sufficient support", 10, 500., 1, "compact_original", True),
    Scenario("Compact, support ends", 10, 500., 1, "compact_31", False),
    Scenario("Large, limited support", 1000, 250., 5, "large_7", False),
    Scenario("Large, sufficient support", 1000, 250., 5, "large_ramp", True),
]


def baseline_order(s: Scenario, year: int) -> int:
    if year + s.lead_years > HORIZON:
        return 0
    if s.schedule == "compact_original":
        return COMPACT_PRE_ORDERS[year] if year < 20 else 170 + 10 * (year - 19)
    if s.schedule == "compact_31":
        return COMPACT_PRE_ORDERS[year] if year < 4 else 0
    if s.schedule == "large_7":
        return int(year in [0, 3, 6, 9, 12, 15])
    if s.schedule == "large_ramp":
        return min(year + 1, 10)
    raise ValueError(s.schedule)


def lcoe(s: Scenario, completed: int, rate: float, floor: float = FLOOR) -> float:
    return floor + (s.foak_lcoe - floor) * (1 - rate) ** math.log2(completed)


def simulate(s: Scenario, rate: float, floor: float = FLOOR) -> tuple[list[dict], list[dict]]:
    completed, previous_order = 1, 0
    pending = {}
    trigger = None
    annual = []
    cohorts = [{"scenario": s.name, "learning_rate": rate, "floor_per_mwh": floor, "order_year": "FOAK",
                "commission_year": 0, "units": 1, "experience_at_order": "FOAK",
                "unit_mwe": s.size_mwe, "cohort_lcoe_per_mwh": s.foak_lcoe}]
    last_delivered_cost = s.foak_lcoe
    for year in range(HORIZON + 1):
        due = pending.pop(year, [])
        new_units = sum(c["units"] for c in due)
        completed += new_units
        if due:
            last_delivered_cost = due[-1]["cohort_lcoe_per_mwh"]
        new_cost = lcoe(s, completed, rate, floor)
        base_order = baseline_order(s, year)
        order = base_order
        expanded = False
        if s.expands and year + s.lead_years <= HORIZON:
            if trigger is None and new_cost <= BENCHMARK:
                trigger = year
            if trigger is not None:
                order = min(math.ceil(previous_order * (1 + ORDER_GROWTH)),
                            ANNUAL_CAPACITY_CEILING_MWE // s.size_mwe)
                expanded = True
        if order:
            cohort = {"scenario": s.name, "learning_rate": rate, "floor_per_mwh": floor, "order_year": year,
                      "commission_year": year + s.lead_years, "units": order,
                      "experience_at_order": completed, "unit_mwe": s.size_mwe,
                      "cohort_lcoe_per_mwh": new_cost}
            cohorts.append(cohort)
            pending.setdefault(cohort["commission_year"], []).append(cohort)
        operating = sum(c["units"] for c in cohorts if c["commission_year"] <= year < c["commission_year"] + LIFE_YEARS)
        annual.append({"scenario": s.name, "learning_rate": rate, "floor_per_mwh": floor, "year": year,
                       "baseline_order_units": base_order, "actual_order_units": order,
                       "expanded_order": expanded, "expansion_trigger_year": trigger,
                       "commissioned_units_this_year": new_units + int(year == 0),
                       "completed_units": completed, "cumulative_completed_gwe": completed * s.size_mwe / 1000,
                       "cumulative_production_doublings": math.log2(completed),
                       "operating_units": operating, "operating_capacity_gwe": operating * s.size_mwe / 1000,
                       "next_order_lcoe_per_mwh": new_cost,
                       "last_delivered_cohort_lcoe_per_mwh": last_delivered_cost})
        previous_order = order
    assert not pending
    for cohort in cohorts:
        gap = max(cohort["cohort_lcoe_per_mwh"] - BENCHMARK, 0.)
        annual_energy = cohort["units"] * s.size_mwe * 8760 * CAPACITY_FACTOR
        observed_years = max(0, min(LIFE_YEARS, HORIZON - cohort["commission_year"]))
        cohort.update({"capacity_gwe": cohort["units"] * s.size_mwe / 1000,
                       "positive_premium_per_mwh": gap,
                       "annual_generation_mwh": annual_energy,
                       "annual_premium_dollars": annual_energy * gap,
                       "lifetime_premium_dollars": annual_energy * gap * LIFE_YEARS,
                       "operating_years_in_plot_window": observed_years,
                       "window_premium_dollars": annual_energy * gap * observed_years})
    validate(s, rate, annual, cohorts, floor)
    return annual, cohorts


def validate(s: Scenario, rate: float, annual: list[dict], cohorts: list[dict], floor: float = FLOOR) -> None:
    assert annual[0]["next_order_lcoe_per_mwh"] == s.foak_lcoe
    assert math.isclose((lcoe(s, 2, rate, floor) - floor) / (s.foak_lcoe - floor), 1 - rate)
    for row in annual:
        completed = sum(c["units"] for c in cohorts if c["commission_year"] <= row["year"])
        assert completed == row["completed_units"]
        assert math.isclose(row["cumulative_completed_gwe"], completed * s.size_mwe / 1000)
        assert row["next_order_lcoe_per_mwh"] > floor
        active = sum(c["units"] for c in cohorts if c["commission_year"] <= row["year"] < c["commission_year"] + LIFE_YEARS)
        assert row["operating_units"] == active
        if row["expanded_order"]:
            previous = annual[row["year"] - 1]
            expected = min(math.ceil(previous["actual_order_units"] * (1 + ORDER_GROWTH)),
                           ANNUAL_CAPACITY_CEILING_MWE // s.size_mwe)
            assert row["actual_order_units"] == expected
            assert row["next_order_lcoe_per_mwh"] <= BENCHMARK
        else:
            assert row["actual_order_units"] == row["baseline_order_units"]
    for c in cohorts[1:]:
        available = sum(other["units"] for other in cohorts if other["commission_year"] <= c["order_year"])
        assert available == c["experience_at_order"]
        assert c["commission_year"] - c["order_year"] == s.lead_years
        assert math.isclose(c["cohort_lcoe_per_mwh"], lcoe(s, available, rate, floor))
    for prior, current in zip(annual, annual[1:]):
        assert current["next_order_lcoe_per_mwh"] <= prior["next_order_lcoe_per_mwh"]
        if current["commissioned_units_this_year"] == 0:
            assert current["next_order_lcoe_per_mwh"] == prior["next_order_lcoe_per_mwh"]
    assert all(c["lifetime_premium_dollars"] >= 0 for c in cohorts)
    assert annual[-1]["actual_order_units"] == 0
    if s.schedule == "compact_31":
        assert annual[4]["completed_units"] == annual[-1]["completed_units"] == 31
    if s.schedule == "large_7":
        assert annual[20]["completed_units"] == annual[-1]["completed_units"] == 7


def minimum_experience(s: Scenario, rate: float, cost_limit: float, floor: float = FLOOR) -> dict:
    if cost_limit <= floor:
        return {"finite_attainment_possible": False, "minimum_completed_units": None,
                "minimum_cumulative_manufactured_gwe": None, "theoretical_doublings": None}
    doublings = math.log((cost_limit - floor) / (s.foak_lcoe - floor)) / math.log(1 - rate)
    threshold = math.ceil(2 ** doublings)
    assert lcoe(s, threshold, rate, floor) <= cost_limit < lcoe(s, threshold - 1, rate, floor)
    return {"finite_attainment_possible": True, "minimum_completed_units": threshold,
            "minimum_cumulative_manufactured_gwe": threshold * s.size_mwe / 1000,
            "theoretical_doublings": doublings,
            "doublings_at_minimum_integer_units": math.log2(threshold)}


def summarize(s: Scenario, rate: float, annual: list[dict], cohorts: list[dict], floor: float = FLOOR) -> dict:
    qualified = next((r for r in annual if r["next_order_lcoe_per_mwh"] <= BENCHMARK), None)
    first_cohort = next((c for c in cohorts if c["cohort_lcoe_per_mwh"] <= BENCHMARK), None)
    premium_cohorts = [c for c in cohorts if c["positive_premium_per_mwh"] > 0]
    threshold = minimum_experience(s, rate, BENCHMARK, floor)
    target_threshold = minimum_experience(s, rate, TARGET, floor)
    target_order = next((r for r in annual if r["next_order_lcoe_per_mwh"] <= TARGET), None)
    target_cohort = next((c for c in cohorts if c["cohort_lcoe_per_mwh"] <= TARGET), None)
    pipeline = [] if qualified is None else [c for c in premium_cohorts
                if c["commission_year"] > qualified["year"]]
    return {"scenario": s.name, "learning_rate": rate, "floor_per_mwh": floor,
            "first_next_order_at_or_below_benchmark": qualified,
            "first_cohort_at_or_below_benchmark": first_cohort,
            "first_expanded_order": next((r for r in annual if r["expanded_order"]), None),
            "analytic_completed_unit_threshold": threshold["minimum_completed_units"],
            "wholesale_experience_requirement": threshold,
            "target_experience_requirement": target_threshold,
            "first_next_order_at_or_below_target": target_order,
            "first_cohort_at_or_below_target": target_cohort,
            "endpoint": annual[-1],
            "premium_units": sum(c["units"] for c in premium_cohorts),
            "premium_capacity_gwe": sum(c["capacity_gwe"] for c in premium_cohorts),
            "premium_pipeline_units_at_qualification": sum(c["units"] for c in pipeline),
            "premium_pipeline_gwe_at_qualification": sum(c["capacity_gwe"] for c in pipeline),
            "lifetime_premium_dollars": sum(c["lifetime_premium_dollars"] for c in cohorts),
            "window_premium_dollars": sum(c["window_premium_dollars"] for c in cohorts)}


def cashflows(s: Scenario, rate: float, cohorts: list[dict]) -> list[dict]:
    cumulative, rows = 0., []
    for year in range(HORIZON + LIFE_YEARS):
        premium = sum(c["annual_premium_dollars"] for c in cohorts
                      if c["commission_year"] <= year < c["commission_year"] + LIFE_YEARS)
        cumulative += premium
        rows.append({"scenario": s.name, "learning_rate": rate,
                     "operating_year_start": year, "operating_year_end": year + 1,
                     "premium_dollars": premium, "cumulative_premium_dollars": cumulative})
    assert math.isclose(cumulative, sum(c["lifetime_premium_dollars"] for c in cohorts))
    assert math.isclose(sum(r["premium_dollars"] for r in rows if r["operating_year_start"] < HORIZON),
                        sum(c["window_premium_dollars"] for c in cohorts))
    return rows


def target_envelope() -> dict:
    rows = []
    scenario = SCENARIOS[0]
    for floor, rate in [(5., .20), (5., .25), (5., .30), (2., .25), (8., .25)]:
        annual, cohorts = simulate(scenario, rate, floor)
        summary = summarize(scenario, rate, annual, cohorts, floor)
        minimum = summary["target_experience_requirement"]
        target_order = summary["first_next_order_at_or_below_target"]
        target_delivery = summary["first_cohort_at_or_below_target"]
        wholesale_order = summary["first_next_order_at_or_below_benchmark"]
        rows.append({"floor_per_mwh": floor, "learning_rate": rate,
                     "foak_lcoe_per_mwh": scenario.foak_lcoe, "unit_mwe": scenario.size_mwe,
                     "target_per_mwh": TARGET, "calendar_horizon_years": HORIZON,
                     **minimum,
                     "first_target_order_year_within_horizon": target_order["year"] if target_order else None,
                     "actual_completed_units_at_first_target_order": target_order["completed_units"] if target_order else None,
                     "actual_cumulative_manufactured_gwe_at_first_target_order": target_order["cumulative_completed_gwe"] if target_order else None,
                     "actual_operating_capacity_gwe_at_first_target_order": target_order["operating_capacity_gwe"] if target_order else None,
                     "first_target_order_lcoe_per_mwh": target_order["next_order_lcoe_per_mwh"] if target_order else None,
                     "first_target_delivery_year_within_horizon": target_delivery["commission_year"] if target_delivery else None,
                     "first_target_cohort_units": target_delivery["units"] if target_delivery else None,
                     "first_wholesale_order_year_within_horizon": wholesale_order["year"] if wholesale_order else None,
                     "endpoint_next_order_lcoe_per_mwh": summary["endpoint"]["next_order_lcoe_per_mwh"],
                     "endpoint_completed_units": summary["endpoint"]["completed_units"]})
    assert not minimum_experience(scenario, PRIMARY_RATE, TARGET, floor=TARGET)["finite_attainment_possible"]
    assert not minimum_experience(scenario, PRIMARY_RATE, TARGET, floor=20)["finite_attainment_possible"]
    return {"target_per_mwh": TARGET,
            "scope": "Compact sufficient-support case only. Identical starting cost, delivery lead, baseline orders, wholesale trigger, growth rule and capacity ceiling; only the stated floor and rate change",
            "calendar_scope": f"Report target order and delivery only within the {HORIZON}-year modeled horizon; no calendar extrapolation beyond that horizon",
            "fixed_floor_condition": "For FOAK cost above the target, any fixed floor at or above $10/MWh prevents reaching $10/MWh at any finite completed-unit count under this learning law",
            "capacity_interpretation": "Minimum GW is cumulative manufacturing experience, not operating capacity. Units retire after 30 years while completed-unit experience is retained",
            "evidence_grade": "All fixed floors and learning rates are chosen assumptions; no plant cost budget validates them",
            "cases": rows}


def write_csv(name: str, rows: list[dict]) -> None:
    with (ROOT / "results" / name).open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def make_plot(annual: list[dict], summaries: list[dict]) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FixedLocator, StrMethodFormatter
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "text.parse_math": False,
                         "axes.spines.top": False, "axes.spines.right": False})
    fig, ax = plt.subplots(figsize=(11, 7.5))
    for s in SCENARIOS:
        color = "#176a90" if s.size_mwe == 10 else "#bd6227"
        style = "-" if s.expands else "--"
        rows = [r for r in annual if r["scenario"] == s.name and r["learning_rate"] == PRIMARY_RATE]
        summary = next(r for r in summaries if r["scenario"] == s.name and r["learning_rate"] == PRIMARY_RATE)
        premium = summary["lifetime_premium_dollars"] / 1e9
        ax.step([r["year"] for r in rows], [r["next_order_lcoe_per_mwh"] for r in rows],
                where="post", color=color, linestyle=style, lw=2.2,
                label=f"{s.name}  |  ${premium:,.1f}bn lifetime premium")
        last = rows[-1]
        offset = 5 if s.schedule == "compact_31" else (-7 if s.schedule == "large_7" else 0)
        cost_label = (f"${last['next_order_lcoe_per_mwh']:,.2f}/MWh" if last["next_order_lcoe_per_mwh"] < BENCHMARK
                      else f"${last['next_order_lcoe_per_mwh']:,.0f}/MWh")
        ax.annotate(cost_label,
                    xy=(HORIZON, last["next_order_lcoe_per_mwh"]), xytext=(7, offset),
                    textcoords="offset points", color=color, fontsize=10, clip_on=False)
        first = summary["first_next_order_at_or_below_benchmark"]
        if first:
            cohort = summary["first_cohort_at_or_below_benchmark"]
            ax.plot(first["year"], first["next_order_lcoe_per_mwh"], "o", color=color, ms=5)
            label = f"Year {first['year']}: ${first['next_order_lcoe_per_mwh']:.2f}/MWh\nOrders accelerate\nFirst delivery: year {cohort['commission_year']}"
            anchor = (1.5, 32) if s.size_mwe == 10 else (15, 78)
            ax.annotate(label, xy=(first["year"], first["next_order_lcoe_per_mwh"]),
                        xytext=anchor, fontsize=9, color=color,
                        arrowprops={"arrowstyle": "->", "color": color, "lw": 1})
        target_order = summary["first_next_order_at_or_below_target"]
        if target_order:
            target_cohort = summary["first_cohort_at_or_below_target"]
            ax.plot(target_order["year"], target_order["next_order_lcoe_per_mwh"], "o", color=color, ms=5)
            ax.annotate(f"Year {target_order['year']}: ${target_order['next_order_lcoe_per_mwh']:.2f}/MWh\n"
                        f"First delivery below $10/MWh: year {target_cohort['commission_year']}",
                        xy=(target_order["year"], target_order["next_order_lcoe_per_mwh"]),
                        xytext=(28, 14), color=color, fontsize=9,
                        arrowprops={"arrowstyle": "->", "color": color, "lw": 1})
    ax.set_yscale("log")
    ax.set_ylim(8, 620)
    ax.set_xlim(0, HORIZON)
    ax.set_xticks(range(0, HORIZON + 1, 5))
    ax.yaxis.set_major_locator(FixedLocator([10, 20, 60, 100, 250, 500]))
    ax.yaxis.set_major_formatter(StrMethodFormatter("${x:,.0f}/MWh"))
    ax.minorticks_off()
    ax.axhspan(8, BENCHMARK, color="#eef5ef", zorder=0)
    ax.axhline(BENCHMARK, color="#638168", linestyle=":", lw=1)
    ax.text(HORIZON * .55, 62, "Chosen wholesale reference: $60/MWh", color="#52705a", fontsize=9)
    ax.axhline(TARGET, color="#786886", linestyle="--", lw=1)
    ax.text(.4, 10.3, "Long-term target: $10/MWh", color="#786886", fontsize=9)
    ax.grid(axis="y", alpha=.18)
    ax.set_ylabel("Next-order electricity cost ($/MWh)\nLog scale")
    ax.set_xlabel("Years after both first units enter service")
    ax.legend(loc="upper right", frameon=False, fontsize=9)
    fig.suptitle("Compact and large fusion costs over 45 years", x=.13, y=.97, ha="left",
                 fontsize=16, fontweight="bold")
    fig.text(.13, .925, "Conditional example: same 25% per doubling on cost above an assumed $5/MWh fixed contribution.", fontsize=10)
    fig.text(.13, .055,
             "Premium = positive cohort LCOE gap above $60/MWh × lifetime generation. All delivered units, including FOAK and pipeline.\n"
             "30-year unit life, 90% capacity factor, constant dollars, undiscounted. No offset from later cheaper units.\n"
             "Customer premiums or subsidies could cover this gap; it is not an upfront capital or fiscal-cost estimate.\n"
             "Compact: 10 MWe, 1-year lead. Large: 1 GWe, 5-year lead. Orders grow 50%/year after qualification, capped at 25 GWe/year.",
             fontsize=8.7, linespacing=1.5)
    fig.subplots_adjust(left=.13, right=.89, top=.875, bottom=.23)
    for ext in ["png", "svg", "pdf"]:
        fig.savefig(ROOT / "figures" / f"four-case-cost-trajectories.{ext}", dpi=180, facecolor="white")
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-plot", action="store_true")
    args = parser.parse_args()
    (ROOT / "results").mkdir(exist_ok=True)
    (ROOT / "figures").mkdir(exist_ok=True)
    annual, cohorts, summaries, payments = [], [], [], []
    for rate in [PRIMARY_RATE, SENSITIVITY_RATE]:
        for scenario in SCENARIOS:
            a, c = simulate(scenario, rate)
            annual.extend(a)
            cohorts.extend(c)
            summaries.append(summarize(scenario, rate, a, c))
            payments.extend(cashflows(scenario, rate, c))
    write_csv("annual_trajectory.csv", annual)
    write_csv("cohort_costs_and_premiums.csv", cohorts)
    write_csv("yearly_premium_cashflows.csv", payments)
    write_csv("selected_years.csv", [r for r in annual if r["year"] in [0, 5, 9, 10, 12, 13, 15, 17, 20, 25, 30, 35, 40, 41, 42, 45]])
    premium_fields = ["scenario", "learning_rate", "floor_per_mwh", "premium_units", "premium_capacity_gwe",
                      "premium_pipeline_units_at_qualification", "premium_pipeline_gwe_at_qualification",
                      "lifetime_premium_dollars", "window_premium_dollars"]
    write_csv("premiums.csv", [{k: r[k] for k in premium_fields} for r in summaries])
    envelope = target_envelope()
    write_csv("target-envelope.csv", envelope["cases"])
    (ROOT / "results" / "target-envelope.json").write_text(json.dumps(envelope, indent=2) + "\n")
    assumptions = {"evidence_grade": "Chosen assumptions and arithmetic only",
                   "horizon_years": HORIZON, "unit_life_years": LIFE_YEARS,
                   "capacity_factor": CAPACITY_FACTOR, "floor_per_mwh": FLOOR,
                   "wholesale_benchmark_per_mwh": BENCHMARK,
                   "long_term_target_per_mwh": TARGET,
                   "fixed_floor_evidence": "The $5/MWh fixed contribution is a hypothetical budget assumption with no validated plant or component cost budget behind it",
                   "primary_learning_rate": PRIMARY_RATE, "sensitivity_learning_rate": SENSITIVITY_RATE,
                   "learning_boundary": "Cost above the fixed contribution; experience is completed identical units within each design",
                   "fuel_and_confinement": "Unspecified; the assumed electricity products do not use a reactor, plasma or magnet cost model",
                   "annual_post_qualification_order_growth": ORDER_GROWTH,
                   "annual_capacity_ceiling_mwe": ANNUAL_CAPACITY_CEILING_MWE,
                   "timing": "Due completions occur before new orders; every cohort retains its order-start LCOE",
                   "premium_formula": "sum(max(cohort_LCOE - benchmark, 0) * units * MWe_per_unit * 8760 * CF * unit_life)",
                   "premium_basis": "Full 30-year lives of every delivered cohort; constant dollars, undiscounted; no netting later below-benchmark generation",
                   "window_premium_basis": f"Payments during [0, {HORIZON}), with commissioning at integer-year start; a year-{HORIZON} delivery contributes zero within-window years",
                   "cashflow_interpretation": "Illustrative recovery of an LCOE gap, not actual contracts, upfront funding, capital requirements or a fiscal subsidy estimate",
                   "scenarios": [asdict(s) for s in SCENARIOS],
                   "compact_original_orders_years_0_to_19": COMPACT_PRE_ORDERS,
                   "compact_original_orders_after_year_19": f"Increase by 10 units per order year until the qualification rule overrides; final compact order year is {HORIZON - SCENARIOS[0].lead_years}",
                   "large_supported_initial_orders": f"1 through 10 units in years 0 through 9, then 10 per year until qualification; final large order year is {HORIZON - SCENARIOS[3].lead_years}",
                   "target_envelope": "Five compact floor/rate combinations; exact mathematical minimum experience and timing only within the main 45-year horizon",
                   "scope_limits": ["Demand, factories, finance and service are assumed to support scheduled orders",
                                    "No operating or financing build-up validates the chosen LCOEs",
                                    "No within-cohort learning, learning before completion or retroactive cost reduction",
                                    "No automatic learning transfer between unit sizes",
                                    "Completed-unit experience persists after a unit retires"]}
    (ROOT / "results" / "assumptions.json").write_text(json.dumps(assumptions, indent=2) + "\n")
    (ROOT / "results" / "premiums.json").write_text(json.dumps({"basis": assumptions["premium_basis"],
        "cases": [{k: r[k] for k in premium_fields} for r in summaries]}, indent=2) + "\n")
    result = {"validation": "Timing, learning, cost-lock, cumulative/operating capacity, growth-cap, target-threshold and premium-accounting invariants passed",
              "horizon_years": HORIZON, "unit_life_years": LIFE_YEARS,
              "cases": summaries, "target_envelope": envelope}
    (ROOT / "results" / "milestones-and-summary.json").write_text(json.dumps(result, indent=2) + "\n")
    if not args.no_plot:
        make_plot(annual, summaries)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
