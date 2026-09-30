# Conditions for a hypothetical compact path to $10/MWh

The main illustration reaches a compact next-order cost of $9.99/MWh in year 41 and delivers the first cohort at that cost in year 42. This requires an assumed $5/MWh fixed cost contribution, 25% learning per doubling on the remaining cost, extensive customer support and decades of production. The $5/MWh contribution has no validated plant or component cost budget behind it. The curve identifies conditions that would have to hold, not evidence that a fusion plant can meet them.

## Shared assumptions and timing

The calculation does not specify a fuel or confinement method and does not derive its electricity prices from a reactor or magnet model. Compact units are 10 MWe and start at $500/MWh. Large units are 1 GWe and start at $250/MWh. All hypothetical electricity costs and premium totals use constant 2025 US dollars. Both FOAKs enter service in year 0. Compact orders take one year to enter service and large orders take five. Every cohort uses only completed-unit experience available at order time and retains that lifetime LCOE. Existing units are not repriced.

`next-order LCOE = F + (FOAK LCOE − F) × (1 − r)^log2(completed units)`

In the main comparison, `F = $5/MWh` and `r = 25%` for all four cases. The calendar horizon is 45 years. Each individual unit operates for 30 years at the chosen 90% capacity factor. Completed manufacturing experience persists after retirement, so cumulative manufactured capacity and operating capacity differ.

The sufficient-support programs increase accepted orders by 50% each year once next-order cost reaches the chosen $60/MWh wholesale reference. Orders are rounded upward and capped at 25 GWe annually: 2,500 compact units or 25 large reactors. Demand, funded factories, finance and service capacity are assumed to permit those volumes. The final compact order year is 44 and the final large order year is 40.

## Deployment cases

| Case | First order below $60/MWh | First such delivery | Year-45 next-order cost | Completed units / cumulative GWe |
|---|---:|---:|---:|---:|
| Compact, sufficient support | Year 9, $56.17/MWh | Year 10 | $9.70/MWh | 74,514 / 745.14 |
| Compact, support ends | None | None | $124.02/MWh | 31 / 0.31 |
| Large, limited support | None | None | $114.25/MWh | 7 / 7 |
| Large, sufficient support | Year 12, $59.74/MWh | Year 17 | $20.37/MWh | 789 / 789 |

The successful compact case follows the stated early orders until year 9. At that point it has completed 237 units, or 2.37 GWe. Orders increase from 60 in year 8 to 90 in year 9. The first expanded cohort arrives in year 10. The annual delivery ceiling is reached in year 19.

The successful large program orders one through ten reactors per year in years 0 through 9, then ten annually until qualification. In year 12 it has completed 37 reactors. Orders increase to 15 in year 12, 23 in year 13 and the 25-unit ceiling in year 14. Those cohorts arrive in years 17, 18 and 19.

Compact support ends after 31 completed units in the second case. The limited large program orders its six follow-ons in years 0, 3, 6, 9, 12 and 15, finishing the seventh reactor in year 20. Their plotted next-order estimates remain flat afterward even when existing units eventually retire.

## What reaching $10/MWh requires

For the main compact assumptions, the mathematical minimum is 64,317 completed units, equivalent to 643.17 GWe manufactured and about 15.973 production doublings from FOAK. The delivery schedule passes this threshold in a cohort rather than landing exactly on it. In year 41 there are 64,514 completed units and the next-order cost is $9.993654/MWh. That year orders 2,500 units at this modeled cost for delivery in year 42.

Cumulative manufactured capacity is 645.14 GWe at that crossing, while operating capacity is 640.52 GWe because some earlier units have retired. At year 45 these quantities are 745.14 GWe and 723.99 GWe. The corresponding large sufficient-support totals are 789 GWe manufactured and 723 GWe operating.

The same learning law would require 11,814 completed large reactors, or 11,814 GWe of cumulative manufacturing, to reach $10/MWh. That is about 13.528 doublings from its lower-cost FOAK. The specified large program completes 789 reactors within 45 years and therefore does not reach the target.

A compact sensitivity table varies only the fixed contribution and learning rate, retaining the starting cost, order-to-service lead, early order schedule, wholesale trigger, growth rule and annual production ceiling:

| Fixed contribution | Learning per doubling | Minimum completed units | Minimum cumulative GWe | Required doublings | First $10/MWh order / delivery within 45 years |
|---|---:|---:|---:|---:|---|
| $5/MWh | 20% | 1,581,282 | 15,812.82 | 20.593 | Not reached |
| $5/MWh | 25% | 64,317 | 643.17 | 15.973 | Years 41 / 42 |
| $5/MWh | 30% | 7,555 | 75.55 | 12.883 | Years 17 / 18 |
| $2/MWh | 25% | 21,030 | 210.30 | 14.360 | Years 24 / 25 |
| $8/MWh | 25% | 576,460 | 5,764.60 | 19.137 | Not reached |

These are mathematical minimum counts, not the exact counts delivered by the annual cohorts. The 30% case first crosses with 8,038 completed units at $9.84/MWh. The $2/MWh contribution case first crosses with 22,014 units at $9.85/MWh. No calendar timing beyond the 45-year horizon is claimed. A fixed contribution at or above $10/MWh makes reaching $10/MWh impossible at any finite production count under this law when FOAK starts above the target.

Fewer past doublings do not create a larger future saving at the same current cost. With the shared $5/MWh contribution and 25% rate, another doubling always yields `5 + 0.75 × (current cost − 5)`. A doubling at $10/MWh would therefore reduce the next-order estimate to $8.75/MWh for either design.

## Above-wholesale premium

The primary premium is the positive gap above $60/MWh over each delivered cohort's full 30-year life:

`premium = Σ max(cohort LCOE − 60, 0) × cohort units × MWe per unit × 8,760 × 0.90 × 30`

It includes FOAK, all cohorts commissioned within the 45-year horizon, and orders still being built when later orders become competitive. Later below-benchmark generation does not offset earlier premiums. The result is an undiscounted, constant-dollar lifetime revenue gap, not upfront capital, a present value or an estimate of fiscal subsidies. Customers, procurement or other support might cover it.

| Case | Above-benchmark units / GWe | Full-life premium, $bn | Premium within years 0–45, $bn |
|---|---:|---:|---:|
| Compact, sufficient support | 237 / 2.37 | 23.146 | 23.146 |
| Compact, support ends | 31 / 0.31 | 12.712 | 12.712 |
| Large, limited support | 7 / 7 | 225.279 | 221.190 |
| Large, sufficient support | 76 / 76 | 1,314.177 | 1,313.738 |

The large program's 76 premium reactors include 37 completed before qualification and 39 still in its construction pipeline. The first below-benchmark cohort arrives five years after its order, in year 17. The secondary window measure counts only generation during `[0, 45)` and allows each unit no more than its 30-year life. The yearly cashflow file reconciles both measures.

At 10% learning, neither sufficient-support program reaches the wholesale trigger within 45 years. Their next-order estimates end at $128.92/MWh for compact and $104.89/MWh for large. Those paths retain the specified prequalification orders, so their support requirements remain conditional assumptions.

## Reproduction and validation

Use the [source repository](https://github.com/1cFE/learning), which includes the calculation in `scripts/four_case_trajectory.py`. Alternatively, create a working folder with a `scripts/` subfolder and save the downloadable [trajectory script](./four_case_trajectory.py) there. Run the following command from that working folder or the repository root:

```sh
python3 scripts/four_case_trajectory.py --no-plot
```

This creates `results/` and `figures/` alongside `scripts/` and reproduces the numerical files in `results/` using the Python standard library. Omit `--no-plot` to render the PNG, SVG and PDF figure in `figures/`, which additionally requires matplotlib:

```sh
python3 scripts/four_case_trajectory.py
```

The results include annual trajectories, fixed cohort costs and premiums, cashflows, assumptions, milestones, premium totals and `target-envelope.csv` / `target-envelope.json`. Endpoint fields use the actual horizon. Annual rows separately report completed units, production doublings and units still operating.

Checks cover fixed cohort pricing, completed experience, delivery leads, learning, growth caps, retirements, exact threshold minima, finite unattainability when the floor meets or exceeds the target, and premium reconciliation. The numerical outputs were reproduced without matplotlib, and the final single-axis figure was visually inspected.
