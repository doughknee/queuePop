"""Golden-test runner for the counter engine.

Runs the assertions in data/counter_golden.seed.json against the engine and
reports pass/fail. Exits non-zero if anything fails, so it can gate changes.

    py scripts/golden_test.py

Each test asserts something that should stay true across weight tuning and flag
edits. The GUARD tests lock in lessons we've already learned (e.g. "Kassadin is
not a Zed counter") so they can never silently regress.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import counter_engine as ce  # noqa: E402

DATA = ce.ROOT / "data"
NAMED = {s["name"]: s for s in ce.load_json(DATA / "counter_scenarios.seed.json")["scenarios"]}
TESTS = ce.load_json(DATA / "counter_golden.seed.json")["tests"]


def resolve_scenario(ref):
    if isinstance(ref, str):
        if ref not in NAMED:
            raise KeyError(f"unknown scenario name: {ref}")
        return NAMED[ref]
    return ref


def results_by_champ(scn):
    results, _ = ce.evaluate_scenario(scn)
    return results, {r["champ"]: r for r in results}


def fired_ids(result):
    return [f["id"] for f in result["fired"]]


def run_one(test):
    """Return (passed: bool, detail: str)."""
    a = test["assert"]
    typ = a["type"]

    # ---- data-level guards (no scenario needed) ----
    if typ in ("has_flag", "lacks_flag"):
        flags = ce.flags_of(a["champ"])
        present = a["flag"] in flags
        ok = present if typ == "has_flag" else not present
        return ok, f"{a['champ']} has '{a['flag']}'={present}"

    # ---- scenario-based assertions ----
    scn = resolve_scenario(test["scenario"])
    results, by = results_by_champ(scn)

    if typ == "top":
        top = results[0]["champ"]
        return top == a["champ"], f"top={top} (want {a['champ']})"

    if typ == "confidence":
        conf = ce.confidence(results)
        return conf == a["expect"], f"confidence={conf} (want {a['expect']})"

    if typ == "ranks_above":
        hi, lo = by.get(a["higher"]), by.get(a["lower"])
        if hi is None or lo is None:
            return False, f"missing from pool: {a['higher']}={hi is not None}, {a['lower']}={lo is not None}"
        ok = hi["score"] > lo["score"]
        return ok, f"{a['higher']}={hi['score']:.1f} vs {a['lower']}={lo['score']:.1f}"

    if typ in ("fires", "not_fires"):
        r = by.get(a["champ"])
        if r is None:
            return False, f"{a['champ']} not in pool"
        ids = fired_ids(r)
        did = a["rule"] in ids
        ok = did if typ == "fires" else not did
        return ok, f"fired={ids}"

    if typ == "in_top":       # champ must appear in the top-k recommendations
        k = a.get("k", 5)
        topk = [r["champ"] for r in results[:k]]
        ok = a["champ"] in topk
        return ok, f"top{k}={topk}"

    if typ == "not_in_top":   # champ must NOT appear in the top-k (trap-pick guard)
        k = a.get("k", 5)
        topk = [r["champ"] for r in results[:k]]
        ok = a["champ"] not in topk
        return ok, f"top{k}={topk}"

    return False, f"unknown assertion type: {typ}"


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    passed = failed = 0
    failures = []
    for test in TESTS:
        try:
            ok, detail = run_one(test)
        except Exception as exc:  # a broken test should fail loudly, not crash the run
            ok, detail = False, f"ERROR: {exc}"
        mark = "PASS" if ok else "FAIL"
        print(f"  [{mark}] {test['name']}")
        if not ok:
            print(f"         -> {detail}")
            failures.append(test["name"])
            failed += 1
        else:
            passed += 1

    print("-" * 60)
    print(f"  {passed} passed, {failed} failed, {len(TESTS)} total")
    if failures:
        print("  FAILURES:")
        for name in failures:
            print(f"    - {name}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
