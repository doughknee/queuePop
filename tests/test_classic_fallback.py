"""League Classic (positionless, benchless draft) checks. Run: py tests/test_classic_fallback.py"""
import asyncio
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import config  # noqa: E402
from champ_select import ChampSelect, fallback_role  # noqa: E402

config.init_console()


class FakeConn:
    def __init__(self, status):
        self.status = status

    async def request(self, *a, **kw):
        return SimpleNamespace(status=self.status)


def make(cs):
    c = ChampSelect(SimpleNamespace(config={"champ_select": cs}, paused=False))
    c.champion_map = {"ahri": 103, "zed": 238}
    c.id_to_name = {103: "Ahri", 238: "Zed"}
    c.logs = []
    c._log = c.logs.append
    return c


def session(pick_in_progress=True):
    return {"localPlayerCellId": 0, "benchEnabled": False, "timer": {"phase": "BAN_PICK"},
            "myTeam": [{"cellId": 0, "assignedPosition": ""}],
            "actions": [[{"id": 1, "type": "pick", "actorCellId": 0, "completed": False,
                          "isInProgress": pick_in_progress, "championId": 0}]]}


roles = {"top": {"picks": []}, "middle": {"picks": ["Ahri", "Zed"]}, "utility": {"picks": ["Zed"]}}

# (a) role_priority order wins, else first configured role with picks
assert fallback_role({"roles": roles, "role_priority": ["top", "utility", "middle"]}) == "utility"
assert fallback_role({"roles": roles}) == "middle"
assert fallback_role({"roles": {}}) is None

# (b) failed commit: not marked hovered/locked, champ skipped, next champ tried
async def failed_commit():
    c, state = make({}), {}
    await c._commit(FakeConn(500), {"id": 1}, 103, "pick", state, lock=True)
    assert state == {} and ("pick", 103) in c._skip
    pri = await c._pick_candidate(FakeConn(200), [103, 238], set())
    assert pri == 238
    c2, state2 = make({}), {}
    await c2._commit(FakeConn(204), {"id": 1}, 103, "pick", state2, lock=True)
    assert state2 == {1: ("hover", 103)} and not c2._skip

asyncio.run(failed_commit())

# (a, end to end) positionless session logs the fallback once and hovers the pick
async def end_to_end():
    c, state = make({"roles": roles}), {}
    await c._process(FakeConn(204), session(), state)
    await c._process(FakeConn(204), session(), state)
    assert sum("using role 'middle'" in m for m in c.logs) == 1
    assert state.get(1) == ("locked", 103), state  # hover, then instant lock

asyncio.run(end_to_end())

# (c) no usable role config: the "no role config" line logs once for identical sessions
async def norole_once():
    c = make({"roles": {}})
    for _ in range(2):
        await c._process(FakeConn(204), session(), {})
    assert sum("no role config" in m for m in c.logs) == 1, c.logs

asyncio.run(norole_once())
print("ok")
