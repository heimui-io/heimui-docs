"""
Runs the published hydration corpus against this implementation.

Every case is a screen, a payload, the document a device should receive, and the expressions that
should have been reported as unresolved. If all of them pass, this implementation agrees with every
other one -- which is the only definition of correct that means anything here.

    python3 run_corpus.py [path/to/corpus]
"""
import json
import pathlib
import sys

from heimui_hydration import UnresolvedPolicy, hydrate_with_report

corpus = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "../../corpus")
cases = sorted(corpus.glob("*.json"))
if not cases:
    sys.exit(f"no cases found in {corpus}")

failures = []
for path in cases:
    case = json.loads(path.read_text())
    policy = UnresolvedPolicy.BLANK if case.get("options", {}).get("onUnresolved") == "blank" else UnresolvedPolicy.KEEP
    result = hydrate_with_report(case["screen"], case["data"], policy)

    if result.document != case["expected"]:
        failures.append(
            f"{path.name}: document\n  expected {json.dumps(case['expected'], sort_keys=True)}\n"
            f"  but was  {json.dumps(result.document, sort_keys=True)}"
        )

    wanted = [(u["nodeId"], u["property"], u["expression"]) for u in case.get("expectedUnresolved", [])]
    got = [(u.node_id, u.property, u.expression) for u in result.unresolved]
    if wanted != got:
        failures.append(f"{path.name}: unresolved\n  expected {wanted}\n  but was  {got}")

    print(("  ok   " if not failures or failures[-1].split(':')[0] != path.name else "  FAIL ") + path.name)

print()
if failures:
    print("\n".join(failures))
    sys.exit(f"{len(failures)} failure(s) across {len(cases)} cases")
print(f"{len(cases)}/{len(cases)} cases pass.")
