"""Update failures reach the feed. Run: py tests/test_updater_failure.py"""
import os
import sys
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import events  # noqa: E402
import updater  # noqa: E402

sys.frozen = True  # apply() only runs in the packaged app
updater._ulog = lambda msg: None  # don't write the real update log


def failed_events():
    return [e for e in events.get_since(0) if e["message"].startswith("Update failed")]


def run(snapshot, label):
    before = len(failed_events())
    updater.check = lambda force=False: snapshot
    res = updater.apply()
    assert res["ok"] is False, label
    assert len(failed_events()) == before + 1, f"{label}: no 'Update failed' event"
    return res


# Thread-side {"ok": False} returns: no update, then no matching asset.
run({"available": False}, "no update")
run({"available": True, "latest": "9.9.9", "assets": []}, "no asset")

# 404 on the release lookup: _do_check caches status 404, apply() reports it.
def http_404(*a, **kw):
    raise urllib.error.HTTPError("u", 404, "Not Found", {}, None)

updater._http_get = http_404
snap = updater._do_check()
assert snap["status"] == 404, snap
res = run(snap, "404")
assert "404" in res["error"], res

print("ok")
