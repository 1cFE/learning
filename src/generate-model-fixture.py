#!/usr/bin/env python3
"""Read the bundled Python model and write independent browser-model parity fixtures.

Does not modify the Python source or results. No plotting dependencies are imported.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "scripts" / "four_case_trajectory.py"
spec = importlib.util.spec_from_file_location("compact_python_reference", SOURCE)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

scenario_ids = ["compactSupported", "compactLimited", "largeLimited", "largeSupported"]
cases = []
for rate in [.25, .10]:
    for scenario_id, scenario in zip(scenario_ids, module.SCENARIOS):
        rows, cohorts = module.simulate(scenario, rate)
        cases.append({"name": f"default rate={rate} {scenario_id}",
                      "params": {"rate": rate}, "scenarioId": scenario_id,
                      "rows": rows, "cohorts": cohorts,
                      "summary": module.summarize(scenario, rate, rows, cohorts)})
for floor, rate in [(5., .20), (5., .25), (5., .30), (2., .25), (8., .25)]:
    scenario = module.SCENARIOS[0]
    rows, cohorts = module.simulate(scenario, rate, floor)
    cases.append({"name": f"target sensitivity floor={floor} rate={rate}",
                  "params": {"rate": rate, "floor": floor}, "scenarioId": scenario_ids[0],
                  "rows": rows, "cohorts": cohorts,
                  "summary": module.summarize(scenario, rate, rows, cohorts, floor)})

fixture = {"source": "scripts/four_case_trajectory.py",
           "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
           "description": "Eight default rate/scenario paths and five compact floor/rate sensitivities generated directly by the independent bundled Python implementation",
           "cases": cases}
path = HERE / "model-fixture.json"
path.write_text(json.dumps(fixture, separators=(",", ":")) + "\n")
print(f"Wrote {len(cases)} Python reference cases to {path.name}")
