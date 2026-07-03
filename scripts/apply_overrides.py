"""Apply data/flag_overrides.json add/remove maps onto data/champion_flags.json offline.

The full ingest (ingest_flags.py) re-fetches Data Dragon + wiki; this helper just re-applies
the curated add/remove overlay in place so new archetype flags land without a network round-trip.
Idempotent: add = set union, remove = set diff, applied add-then-remove (matching the ingest order).

Run:  py scripts/apply_overrides.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
flags = json.loads((DATA / "champion_flags.json").read_text(encoding="utf-8"))
ov = json.loads((DATA / "flag_overrides.json").read_text(encoding="utf-8"))
add_map, rem_map = ov.get("add", {}), ov.get("remove", {})

changed = 0
for name, entry in flags.items():
    if name.startswith("_") or not isinstance(entry, dict):
        continue
    before = set(entry.get("flags", []))
    s = set(before)
    for f in add_map.get(name, []):
        s.add(f)
    for f in rem_map.get(name, []):
        s.discard(f)
    if s != before:
        entry["flags"] = sorted(s)
        changed += 1

(DATA / "champion_flags.json").write_text(
    json.dumps(flags, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"applied overrides onto champion_flags.json — {changed} champs changed")
