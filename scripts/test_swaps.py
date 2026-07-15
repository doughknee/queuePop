"""Smoke check for the shared swap reconciler (champ_select._reconcile_swaps).

Drives both swap kinds (pick-order + role) through a fake connection and
asserts the behaviors that matter: request the best available upgrade, fall
down the line after a decline, cancel a stale outgoing request, and accept an
incoming upgrade exactly once. Run from the repo root:

    py scripts/test_swaps.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import config

config.init_console()

from champ_select import ChampSelect  # noqa: E402


class FakeConn:
    """Records POSTs; every request succeeds."""

    def __init__(self):
        self.posts = []

    async def request(self, method, url, **kw):
        if method == "post":
            self.posts.append(url)

        class R:
            status = 204

        return R()


class FakeLCU:
    config = {}
    paused = False


def pick_session(swaps):
    """5-man team, cell N holds pick position N+1 (actions in cell order)."""
    return {
        "myTeam": [{"cellId": c, "championId": 0} for c in range(5)],
        "actions": [[{"type": "pick", "actorCellId": c} for c in range(5)]],
        "pickOrderSwaps": swaps,
    }


def run(coro):
    asyncio.get_event_loop().run_until_complete(coro)


def main():
    asyncio.set_event_loop(asyncio.new_event_loop())
    cs = ChampSelect(FakeLCU())
    conn = FakeConn()
    me = 4  # last pick; wants the 1st spot, then the 2nd
    wants = [1, 2]

    # 1. Requests the best available upgrade (spot 1, held by cell 0).
    swaps = [{"id": 10, "cellId": 0, "state": "AVAILABLE"},
             {"id": 11, "cellId": 1, "state": "AVAILABLE"}]
    run(cs._handle_pick_order(conn, pick_session(swaps), me, wants))
    assert conn.posts == [
        "/lol-champ-select/v1/session/pick-order-swaps/10/request"
    ], conn.posts
    assert cs._swapctl["pick"]["out"] == {"id": 10, "cell": 0}

    # 2. Decline falls down the line: spot 1 said no -> ask spot 2 instead.
    conn.posts.clear()
    swaps[0]["state"] = "DECLINED"
    run(cs._handle_pick_order(conn, pick_session(swaps), me, wants))
    assert conn.posts == [
        "/lol-champ-select/v1/session/pick-order-swaps/11/request"
    ], conn.posts

    # 3. Cancels a stale request when a better ask appears (fresh swap id for
    #    spot 1 — the declined id never gets re-asked, but a new offer does).
    conn.posts.clear()
    swaps = [{"id": 12, "cellId": 0, "state": "AVAILABLE"},
             {"id": 11, "cellId": 1, "state": "SENT"}]
    run(cs._handle_pick_order(conn, pick_session(swaps), me, wants))
    assert conn.posts == [
        "/lol-champ-select/v1/session/pick-order-swaps/11/cancel"
    ], conn.posts
    assert cs._swapctl["pick"]["out"] is None

    # 4. Accepts an incoming upgrade exactly once (role swaps, same machine).
    cs2 = ChampSelect(FakeLCU())
    conn2 = FakeConn()
    roles = ["middle", "top", "jungle", "utility", "bottom"]
    sess = {
        "myTeam": [{"cellId": c, "assignedPosition": r, "championId": 0}
                   for c, r in enumerate(roles)],
        "positionSwaps": [{"id": 20, "cellId": 0, "state": "RECEIVED"}],
    }
    run(cs2._handle_position_swap(conn2, sess, 4, ["middle", "bottom"]))
    run(cs2._handle_position_swap(conn2, sess, 4, ["middle", "bottom"]))
    assert conn2.posts == [
        "/lol-champ-select/v1/session/position-swaps/20/accept"
    ], conn2.posts

    # 5. An incoming offer that is NOT an upgrade is never accepted.
    cs3 = ChampSelect(FakeLCU())
    conn3 = FakeConn()
    sess["positionSwaps"] = [{"id": 21, "cellId": 1, "state": "RECEIVED"}]
    run(cs3._handle_position_swap(conn3, sess, 4, ["middle", "bottom"]))
    assert conn3.posts == [], conn3.posts

    print("test_swaps: all 5 checks passed")


if __name__ == "__main__":
    main()
