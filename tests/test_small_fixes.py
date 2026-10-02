"""Run: py tests/test_small_fixes.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config

config.init_console()
import main
import web_api

# Minimised stub (Brandon's 160x28) and any single sub-minimum axis are not saved.
assert not main.persistable_size(160, 28)
assert not main.persistable_size(762, 799)
assert not main.persistable_size(761, 800)
assert main.persistable_size(762, 800) and main.persistable_size(1200, 900)

# Bench delay clamps to the UI's max (3s) and floor (0); junk falls back to 0.
for raw, want in [(10, 3.0), (3, 3.0), (2, 2.0), (-1, 0.0), ("x", 0.0), (None, 0.0)]:
    assert web_api._normalize_aram({"bench_delay": raw}, "off")["bench_delay"] == want, raw

print("ok")
