"""One-off diagnostic: capture ARAM's new subset-pick window and attempt the pick.

Round 3. Established so far: the offered subset is NOT in the session,
pickable-champion-ids is the whole roster, the grid disables nothing, and
hover/lock PATCHes for a champ outside the subset return 204 but are ignored.

The real source (found via /help): the lobby-team-builder mirror exposes
  GET /lol-lobby-team-builder/champ-select/v1/subset-champion-list
returning the offered champion ids as a plain int list (404s with "no available
pickable subset champion data" outside the window). This round we poll that,
hover the highest-mastery offered champ, VERIFY the hover stuck in the session,
then lock — falling back to POST actions/{id}/complete if the PATCH lock
doesn't take.

Usage (from repo root, League client running):
    py scripts/capture_aram_pick.py            # wait for champ select, capture + attempt
    py scripts/capture_aram_pick.py --check    # connectivity test only
Output: appends to scripts/aram_pick_capture.jsonl
"""

import base64
import json
import ssl
import sys
import time
import urllib.request

LOCKFILE = r"F:\RiotLibrary\Riot Games\League of Legends\lockfile"
OUT = r"scripts\aram_pick_capture.jsonl"
MAX_WAIT_SECONDS = 2 * 60 * 60  # long-lived: catch whenever the next champ select starts

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def lcu():
    with open(LOCKFILE) as f:
        parts = f.read().split(":")
    port, token = parts[2], parts[3]
    auth = base64.b64encode(f"riot:{token}".encode()).decode()
    return port, auth


def req(method, path, body=None):
    port, auth = lcu()
    r = urllib.request.Request(
        f"https://127.0.0.1:{port}{path}", method=method,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=3) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except Exception as e:
        return -1, repr(e)


out_file = open(OUT, "a", encoding="utf-8")


def log(kind, **data):
    line = json.dumps({"t": round(time.time(), 3), "kind": kind, **data})
    out_file.write(line + "\n")
    out_file.flush()
    print(line[:240])


def my_pick_action(session):
    cell = session.get("localPlayerCellId")
    for ra in session.get("actions") or []:
        for a in ra:
            if a.get("actorCellId") == cell and a.get("type") == "pick":
                return a
    return None


def main():
    status, phase = req("GET", "/lol-gameflow/v1/gameflow-phase")
    print(f"gameflow: {status} {phase}")
    status, mastery = req("GET", "/lol-champion-mastery/v1/local-player/champion-mastery")
    if status != 200:
        print(f"mastery fetch failed: {status} {mastery}")
        return 1
    rank = {m["championId"]: m.get("championPoints", 0) for m in mastery}
    print(f"mastery loaded: {len(rank)} champs")
    if "--check" in sys.argv:
        return 0

    print("waiting for champ select... (queue an ARAM)")
    start = time.time()
    while True:
        status, _ = req("GET", "/lol-champ-select/v1/session")
        if status == 200:
            break
        if time.time() - start > MAX_WAIT_SECONDS:
            print("gave up waiting for a lobby")
            return 2
        time.sleep(1)

    log("capture_start", round=2)

    # One-shot curiosities: aw-set and the first few summoner slots.
    st, aw = req("GET", "/lol-champ-select/v1/aw-set")
    log("aw_set", status=st, body=aw)
    for slot in range(5):
        st, summ = req("GET", f"/lol-champ-select/v1/summoners/{slot}")
        log("summoner_slot", slot=slot, status=st,
            body={k: summ.get(k) for k in ("championId", "cellId", "slotId",
                                           "isSelf", "championName", "pickSnipedClass",
                                           "activeActionType", "isActingNow")} if isinstance(summ, dict) else summ)

    target = None          # champ we decided to pick
    hover_confirmed = False
    lock_sent = False
    fallback_tried = False
    last_session = None
    last_subset = None

    while True:
        status, session = req("GET", "/lol-champ-select/v1/session")
        if status != 200:
            log("session_gone", status=status)
            break

        s = json.dumps(session, sort_keys=True)
        if s != last_session:
            last_session = s
            log("session", session=session)

        phase = (session.get("timer") or {}).get("phase")
        act = my_pick_action(session)

        if phase == "BAN_PICK":
            st, subset = req("GET",
                             "/lol-lobby-team-builder/champ-select/v1/subset-champion-list")
            if json.dumps(subset) != json.dumps(last_subset):
                last_subset = subset
                log("subset_list", status=st, body=subset)

            if (target is None and st == 200 and isinstance(subset, list)
                    and subset):
                target = max(subset, key=lambda c: rank.get(c, 0))
                log("target_chosen", target=target, offered=subset,
                    mastery={c: rank.get(c, 0) for c in subset})

            if target and act and not act.get("completed"):
                aid = act.get("id")
                if act.get("championId") != target:
                    st, body = req("PATCH",
                                   f"/lol-champ-select/v1/session/actions/{aid}",
                                   {"championId": target, "completed": False})
                    log("hover_attempt", action=aid, champ=target, status=st, body=body)
                elif not lock_sent:
                    # Hover visibly stuck in the session -> lock it in.
                    hover_confirmed = True
                    st, body = req("PATCH",
                                   f"/lol-champ-select/v1/session/actions/{aid}",
                                   {"championId": target, "completed": True})
                    log("lock_attempt", action=aid, champ=target, status=st, body=body)
                    lock_sent = True
                elif not fallback_tried:
                    # PATCH lock didn't take -> try the dedicated complete route.
                    fallback_tried = True
                    st, body = req("POST",
                                   f"/lol-champ-select/v1/session/actions/{aid}/complete",
                                   {"championId": target})
                    log("complete_fallback", action=aid, champ=target, status=st, body=body)

        if act and act.get("completed"):
            log_once = getattr(main, "_done_logged", False)
            if not log_once:
                main._done_logged = True
                log("pick_completed", champ=act.get("championId"),
                    hover_confirmed=hover_confirmed)

        time.sleep(0.2)

    log("capture_end")
    return 0


if __name__ == "__main__":
    sys.exit(main())
