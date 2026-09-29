# Interactive learning model

`model.js` is a dependency-free IIFE that works in a browser or Node. It exposes:

```js
globalThis.CompactLearning = {
  DEFAULTS, SCENARIOS, normalize, simulateAll, minimumExperience
};
```

`simulateAll(overrides)` returns the four cases in `SCENARIOS` order. Each result contains `{id, name, compact, limited, params, rows, cohorts, summary}`. `params` contains the normalized values actually used. Input objects and shared defaults are not mutated.

The default results match the bundled Python model for annual production, price estimates, fixed cohort costs, retirement, milestone dates and both premium measures. These are hypothetical learning scenarios, not plant cost estimates.

## Fields for the interface

Rows contain:

```text
year, completed, cumulativeGW, doublings, cost, orders, delivered,
operatingUnits, operatingGW, lastDeliveredCost, baselineOrders,
expanded, expansionYear, premiumCommitted
```

`cost` is the estimate available to a new order at that date. It does not reprice existing cohorts. `completed` and `cumulativeGW` count all manufacturing experience, including retired units. `operatingUnits` and `operatingGW` include only units inside their assumed operating life. `delivered` includes the commissioned FOAK at year zero.

`premiumCommitted` counts every unit ordered above the wholesale benchmark, including FOAK and unfinished units. `baselineOrders` is the early order schedule after scaling, physical capacity and any remaining early-demand cap. `expanded` means an actual order was placed under the post-wholesale rule. A zero manufacturing ceiling does not create an expansion event.

Cohorts contain:

```text
orderYear, serviceYear, units, cost, experienceAtOrder, sizeMW, expanded,
capacityGW, premiumPerMWh, annualGeneration, annualPremium,
lifetimePremium, windowYears, windowPremium
```

FOAK has `orderYear: null` and `experienceAtOrder: null`. Follow-on cohorts retain their order-start cost. Premiums use `max(cost - benchmark, 0)` and never offset an early premium with later below-benchmark generation. Lifetime premium covers each delivered cohort's complete assumed life. Window premium covers only operation during `[0, horizon)`.

Summary fields are:

```text
wholesaleYear, wholesalePriceYear, wholesaleOrderYear, wholesaleDeliveryYear,
wholesaleUnits, wholesaleGW, wholesaleMinimum,
targetYear, targetPriceYear, targetOrderYear, targetDeliveryYear,
targetUnits, targetGW, targetMinimum,
finalCost, completed, doublings, cumulativeGW, operatingUnits, operatingGW,
lifetimePremium, windowPremium, premiumUnits, premiumGW,
premiumPipelineUnits, premiumPipelineGW,
expansionYear, firstExpandedDeliveryYear, endpointYear
```

`wholesaleYear` and `targetYear` mean the first date at which the price estimate is available. Their `PriceYear` aliases are identical. `OrderYear` requires an actual follow-on cohort inside the modeled horizon. `DeliveryYear` requires a commissioned cohort at that cost, including FOAK if FOAK already meets the threshold. Missing dates are `null`. A final-year estimate may therefore meet the target while its order and delivery dates remain null. The interface should preserve that distinction.

`wholesaleUnits` and `targetUnits` are actual cumulative completed counts at the first qualifying estimate. `wholesaleMinimum` and `targetMinimum` provide the separate mathematical minima. The pipeline fields count above-benchmark cohorts still unfinished when the new-order estimate first meets wholesale.

## Mathematical minimum

```js
minimumExperience(foak, rate, floor, threshold, sizeMW)
// Object form also works:
minimumExperience({foak, rate, floor, threshold, sizeMW})
```

Returns `{possible, units, doublings, gwe, integerDoublings, representable, reason}`. `doublings` is the continuous mathematical requirement and `integerDoublings` corresponds to the minimum integer unit count. `gwe` is cumulative manufactured capacity.

If FOAK already meets the threshold, one unit and zero doublings are sufficient, including with zero learning. Otherwise zero learning or a fixed contribution at or above the threshold makes finite attainment impossible. Those cases return `possible: false` and null numeric requirements. An astronomically large but mathematically finite requirement returns `possible: true`, `representable: false`, null units and GW, and a reason. It must not be displayed as an ordinary small finite number or confused with the fixed-floor impossibility.

## Interactive extensions

- The continuing-demand order pace scales only continuing cases' early schedules. The result is rounded upward. A scale of zero produces no early orders in those cases.
- Limited compact demand follows the same unscaled compact early schedule but truncates total above-benchmark commitments at `compactLimit`, including FOAK. Limited large demand orders one reactor every three years until `largeLimit` is committed. Increasing either cap can fund enough experience to qualify for the larger market.
- All four cases switch to the economic order rule when cost meets the wholesale reference. Subsequent competitive orders are not restricted by the early premium-demand cap. This extends the original stopped cases when the user changes their inputs. It does not change the default stopped paths because neither reaches wholesale under its default cap.
- After a crossing, orders are the previous year's actual orders times `1 + growth`, rounded upward and limited by manufacturing capacity. If the final early delivery qualifies after an ordering gap, the model seeds at least one competitive unit when capacity permits. An initially competitive FOAK uses the same seed. Zero growth then means a constant one-unit order stream in that edge case.
- The capacity ceiling applies to every follow-on order, including early orders. A zero ceiling permits no post-FOAK production. If a ceiling is smaller than a unit, that design cannot order a fractional reactor. These extensions leave the default Python paths unchanged.
- No order may create a delivery beyond the selected horizon. Completed experience remains after the unit's retirement. No financial or physics model is added by these controls.

## Normalization

Missing, empty or nonfinite values use defaults. Numeric strings are accepted. Rate is bounded to 0–50%, fixed contribution to $0–80/MWh, benchmark to $20–200/MWh, and horizon to 5–100 integer years. The continuing-demand multiplier is bounded to 0–3. Unit ratings and costs stay positive. If an invalid FOAK is at or below the chosen floor, it is raised to floor plus $0.01/MWh.

Leads and unit lives are 1–100 integer years. Early-demand limits are positive integer unit counts including FOAK. Growth is 0–300% annually, capacity is nonnegative, and capacity factor is 0–1. Upper numeric guards on costs, unit sizes, capacity and early limits prevent malformed inputs from overflowing ordinary model arithmetic. The interface may expose narrower ranges.

## Tests and fixture provenance

Run from this directory:

```sh
node model-test.cjs
```

`model-fixture.json` contains eight default 25%/10% paths and five compact floor/rate variants produced by the independent Python implementation bundled at `../scripts/four_case_trajectory.py`. It records that source file's SHA-256. `generate-model-fixture.py` resolves the sibling scripts directory and writes only this fixture, so it does not depend on another version directory. It does not modify the Python model or its outputs.

Tests compare every annual price, order, completion and operating count, cohort prices and premium accounting, plus milestones and mathematical minima. Additional cases cover the committed pipeline cap, a raised early-demand cap reaching wholesale, zero learning, a floor meeting the target, an initially competitive FOAK, zero production capacity, zero continuing demand, finite numeric guards and final-year price availability without an actual order or delivery. Deterministic randomized cases check production, retirement, commitment and cost-lock invariants across the control ranges.
