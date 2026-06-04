import asyncio
import logging
import os

import config
import events

# Default number of seconds left in the phase at which we force a lock-in
# if the action hasn't been completed manually yet.
DEFAULT_LOCK_SECONDS = 1

# How often (seconds) we poll the champ select session.
POLL_INTERVAL = 0.25

# --- File logging ---------------------------------------------------------
# The app runs in the tray with a hidden console, so we also write champ-select
# activity to a log file next to config.json for debugging.
LOG_FILE = os.path.join(config.BASE_DIR, "champ_select.log")
logger = logging.getLogger("champ_select")
if not logger.handlers:
    logger.setLevel(logging.DEBUG)
    try:
        _handler = logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8")
        _handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s"))
        logger.addHandler(_handler)
    except Exception:
        pass
    logger.propagate = False

# Roles as reported by the LCU `assignedPosition` field, in display order.
ROLES = ["top", "jungle", "middle", "bottom", "utility"]
ROLE_LABELS = {
    "top": "Top",
    "jungle": "Jungle",
    "middle": "Middle",
    "bottom": "Bottom (ADC)",
    "utility": "Support",
}

# Summoner spells offered in the per-role picker (LCU spell ids → name), in
# dropdown display order. Set on our champ via my-selection (spell1Id/spell2Id).
SUMMONER_SPELLS = [
    {"id": 4, "name": "Flash"},
    {"id": 14, "name": "Ignite"},
    {"id": 12, "name": "Teleport"},
    {"id": 11, "name": "Smite"},
    {"id": 7, "name": "Heal"},
    {"id": 3, "name": "Exhaust"},
    {"id": 21, "name": "Barrier"},
    {"id": 6, "name": "Ghost"},
    {"id": 1, "name": "Cleanse"},
    {"id": 13, "name": "Clarity"},
]
SPELL_IDS = {s["id"] for s in SUMMONER_SPELLS}
SPELL_NAMES = {s["id"]: s["name"] for s in SUMMONER_SPELLS}

# Name of the single rune page queueBot manages when auto-runes is on. We
# delete + recreate this one page each game so pages never pile up and the
# user's own pages are never touched.
RUNE_PAGE_NAME = "queueBot (auto)"


class ChampSelect:
    """
    Handles automatic banning and picking during champ select.

    Strategy:
      * Declare intent (hover) on the highest-priority available pick during
        the planning/ban phases so teammates see what we want to play.
      * Ban as soon as the ban phase opens, and insta-lock the pick as soon as
        it's our turn.
      * Walk down the configured list so a banned/taken champ falls through to
        the next backup automatically.
    """

    def __init__(self, lcu):
        self.lcu = lcu
        self.champion_map = {}   # lowercased name/alias -> championId
        self.id_to_name = {}     # championId -> display name
        self._task = None
        self._running = False
        self._last_sig = None    # last logged champ-select state signature
        self._spells_done = False  # summoner spells set once per session
        self._runes_for = None     # championId we last applied recommended runes for

    def _log(self, message):
        """Write a line to the champ-select debug log file."""
        try:
            logger.info(message)
        except Exception:
            pass

    @property
    def config(self):
        return self.lcu.config

    def _settings(self):
        return self.config.get("champ_select", {}) or {}

    # --- Champion data --------------------------------------------------

    async def load_champion_data(self, connection):
        """Fetches the champion list from the client so we can map names -> IDs."""
        try:
            resp = await connection.request(
                'get', '/lol-game-data/assets/v1/champion-summary.json'
            )
            if resp.status != 200:
                config.console.log(
                    f"[warning]Could not load champion data (status {resp.status}).[/]"
                )
                return

            data = await resp.json()
            cmap = {}
            id_to_name = {}
            for champ in data:
                cid = champ.get('id')
                if not cid or cid < 0:
                    continue  # -1 is the "None" placeholder entry
                name = champ.get('name', '') or ''
                alias = champ.get('alias', '') or ''
                if name:
                    cmap[name.lower()] = cid
                if alias:
                    cmap[alias.lower()] = cid
                id_to_name[cid] = name or alias

            self.champion_map = cmap
            self.id_to_name = id_to_name
            config.console.print(
                f"[info]Loaded {len(id_to_name)} champions for auto pick/ban.[/]"
            )
        except Exception as e:
            config.console.log(f"[danger]Failed to load champion data: {e}[/]")

    def _resolve(self, name):
        """Resolve a champion name (or alias) to its ID, or None."""
        if not name:
            return None
        return self.champion_map.get(name.strip().lower())

    # --- Event entry point ---------------------------------------------

    def on_session_event(self, connection):
        """
        Called from the websocket handler whenever the champ select session
        changes. Spins up the management loop if it isn't already running.
        """
        cs = self._settings()
        if not cs.get("enabled"):
            return
        if self.lcu.paused:
            return
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._manage(connection))

    # --- Management loop -----------------------------------------------

    async def _manage(self, connection):
        if self._running:
            return
        self._running = True
        self._last_sig = None
        self._spells_done = False
        self._runes_for = None
        # action_id -> ('hover'|'locked', championId) so we don't spam the API
        action_state = {}
        self._log("=== champ select session started ===")
        try:
            # Lazy-load champion data in case auto pick/ban was enabled after
            # the client already connected (no reconnect required).
            if not self.champion_map:
                await self.load_champion_data(connection)
            self._log(f"champions loaded: {len(self.id_to_name)}")

            while True:
                if self.lcu.paused:
                    break

                resp = await connection.request(
                    'get', '/lol-champ-select/v1/session'
                )
                if resp.status != 200:
                    break  # champ select ended (404) or not available

                session = await resp.json()
                try:
                    await self._process(connection, session, action_state)
                except Exception as e:
                    config.console.log(f"[danger]Champ select handling error: {e}[/]")
                    self._log(f"ERROR in _process: {e!r}")

                await asyncio.sleep(POLL_INTERVAL)
        finally:
            self._running = False
            self._log("=== champ select session ended ===")

    async def _process(self, connection, session, action_state):
        cs = self._settings()
        local_cell = session.get('localPlayerCellId')
        my_team = session.get('myTeam', []) or []

        # Determine our assigned role.
        position = ""
        for player in my_team:
            if player.get('cellId') == local_cell:
                position = (player.get('assignedPosition') or "").lower()
                break

        role_cfg = (cs.get('roles', {}) or {}).get(position)
        if not role_cfg:
            # No preference for this role, or a mode without assigned roles
            # (blind/ARAM). Nothing to do.
            sig = ("no-role", position)
            if sig != self._last_sig:
                self._last_sig = sig
                self._log(f"no role config for position={position!r}; team positions="
                          f"{[(p.get('cellId'), p.get('assignedPosition')) for p in my_team]}")
            return

        # --- Summoner spells: set once, as soon as we know our role. ---
        # my-selection accepts spells any time in champ select, so we don't wait
        # for our pick turn — set them early so the user (and team) see them.
        spells = (role_cfg.get('spells') or [])[:2]
        if not self._spells_done and len(spells) >= 2:
            await self._apply_spells(connection, spells)
            self._spells_done = True

        # Champs we must avoid: completed bans, completed picks, and the champs
        # teammates are currently hovering.
        unavailable = set()
        for round_actions in session.get('actions', []) or []:
            for action in round_actions:
                cid = action.get('championId') or 0
                if cid > 0 and action.get('completed') and action.get('type') in ('ban', 'pick'):
                    unavailable.add(cid)
        for player in my_team:
            if player.get('cellId') == local_cell:
                continue
            intent = player.get('championPickIntent') or 0
            if intent > 0:
                unavailable.add(intent)

        timer = session.get('timer', {}) or {}
        phase = timer.get('phase')

        # Seconds left in the current phase, used to defer our pick lock-in so
        # the user has a window to override the hover manually. None means the
        # client didn't report a usable timer (treat as "lock now").
        seconds_left = None
        if not timer.get('isInfinite'):
            ms_left = timer.get('adjustedTimeLeftInPhase')
            if isinstance(ms_left, (int, float)) and ms_left >= 0:
                seconds_left = ms_left / 1000.0

        # Locate our ban and pick actions (at most one incomplete of each).
        my_ban = None
        my_pick = None
        for round_actions in session.get('actions', []) or []:
            for action in round_actions:
                if action.get('actorCellId') != local_cell or action.get('completed'):
                    continue
                if action.get('type') == 'ban' and my_ban is None:
                    my_ban = action
                elif action.get('type') == 'pick' and my_pick is None:
                    my_pick = action

        # Log a snapshot whenever the state meaningfully changes (not every poll).
        def _brief(a):
            if a is None:
                return None
            return {k: a.get(k) for k in ('id', 'type', 'championId', 'isInProgress', 'completed')}
        sig = (phase, position, _brief(my_ban) and tuple(_brief(my_ban).items()),
               _brief(my_pick) and tuple(_brief(my_pick).items()))
        if sig != self._last_sig:
            self._last_sig = sig
            self._log(f"phase={phase} pos={position} ban={_brief(my_ban)} "
                      f"pick={_brief(my_pick)} unavailable={sorted(unavailable)}")

        # --- Ban: hover then commit, but ONLY during the real ban phase. ---
        # The ban action can briefly report isInProgress during PLANNING; acting
        # then marks it 'locked' in our state, and if the action id carries over
        # into BAN_PICK we'd skip the ban that actually counts. So we gate bans
        # to phase == 'BAN_PICK'. The client doesn't auto-lock a hovered ban, so
        # we commit promptly; teammate intents are in `unavailable` so we won't
        # ban an ally's champ.
        if phase == 'BAN_PICK' and my_ban is not None and my_ban.get('isInProgress'):
            chosen = self._select(role_cfg.get('bans', []), unavailable)
            if chosen:
                await self._commit(connection, my_ban, chosen, 'ban', action_state, lock=True)

        # --- Pick: declare intent early, hover on our turn, lock near the buzzer. ---
        # During the planning/ban phases our pick action exists but isn't in
        # progress yet — hovering it broadcasts what we want to play to the team.
        # Once it's our turn we keep it hovered (so the user can still swap to
        # something else) and only force the lock once the phase timer drops to
        # `lock_in_at_seconds`. If the client reports no timer we lock right away
        # rather than risk missing the turn.
        if my_pick is not None:
            chosen = self._select(role_cfg.get('picks', []), unavailable)
            if chosen:
                if my_pick.get('isInProgress'):
                    try:
                        lock_at = float(cs.get('lock_in_at_seconds', DEFAULT_LOCK_SECONDS))
                    except (TypeError, ValueError):
                        lock_at = DEFAULT_LOCK_SECONDS
                    ready_to_lock = seconds_left is None or seconds_left <= lock_at
                    if ready_to_lock:
                        await self._commit(connection, my_pick, chosen, 'pick', action_state, lock=True)
                    else:
                        await self._commit(connection, my_pick, chosen, 'pick', action_state, lock=False)
                else:
                    await self._commit(connection, my_pick, chosen, 'pick', action_state, lock=False, intent=True)

        # --- Auto runes: apply the client's recommended page for the champ we're
        # actually going to play — once it's hovered on our turn or locked in.
        # We hold off during the planning/intent phase (the pick can still change
        # as backups fall through) so we don't churn rune pages.
        if cs.get('auto_runes'):
            my_champ = 0
            for round_actions in session.get('actions', []) or []:
                for action in round_actions:
                    if (action.get('actorCellId') == local_cell
                            and action.get('type') == 'pick'):
                        cid = action.get('championId') or 0
                        if cid > 0 and (action.get('isInProgress') or action.get('completed')):
                            my_champ = cid
            if my_champ and self._runes_for != my_champ:
                self._runes_for = my_champ
                await self._apply_runes(connection, my_champ)

    def _select(self, names, unavailable):
        """Return the first configured champ that's still available (backups)."""
        for nm in names or []:
            cid = self._resolve(nm)
            if cid and cid not in unavailable:
                return cid
        return None

    async def _commit(self, connection, action, champion_id, kind, action_state, lock, intent=False):
        action_id = action.get('id')
        state = action_state.get(action_id)
        if state and state[0] == 'locked':
            return  # already committed; awaiting server confirmation

        display = self.id_to_name.get(champion_id, champion_id)

        # The client only lets us *complete* an action whose champion is already
        # hovered. So we always hover first, then lock on a subsequent poll —
        # this is what made picks work and bans (which we used to lock in one
        # shot) silently fail.
        if state != ('hover', champion_id):
            ok = await self._patch(connection, action_id, champion_id, complete=False)
            action_state[action_id] = ('hover', champion_id)
            label = "Declaring intent" if intent else "Hovering"
            config.console.print(f"[info]{label} {kind}: {display}[/]")
            events.push(f"{label} {kind}: {display}", "info")
            self._log(f"{label} {kind}: {display} (action {action_id}) -> ok={ok}")
            return

        if lock:
            ok = await self._patch(connection, action_id, champion_id, complete=True)
            action_state[action_id] = ('locked', champion_id)
            config.console.print(f"[success]🔒 Locked {kind}: {display}[/]")
            events.push(f"Locked {kind}: {display}", "success")
            self._log(f"LOCK {kind}: {display} (action {action_id}) -> ok={ok}")

    async def _patch(self, connection, action_id, champion_id, complete):
        """PATCH a champ-select action. Returns True on success, False otherwise."""
        try:
            resp = await connection.request(
                'patch',
                f'/lol-champ-select/v1/session/actions/{action_id}',
                data={'championId': champion_id, 'completed': complete}
            )
        except Exception as e:
            self._log(f"PATCH action {action_id} raised: {e!r}")
            return False

        if resp.status >= 400:
            body = ""
            try:
                body = await resp.text()
            except Exception:
                pass
            config.console.log(
                f"[warning]Champ select action {action_id} update failed "
                f"(status {resp.status}).[/]"
            )
            self._log(f"PATCH action {action_id} championId={champion_id} "
                      f"completed={complete} -> HTTP {resp.status} {body}")
            return False
        return True

    # --- Summoner spells + runes ---------------------------------------

    async def _apply_spells(self, connection, spells):
        """Set our summoner spells for the current champ select via my-selection.
        `spells` is [spell1Id, spell2Id]. Best-effort — logs and moves on."""
        s1, s2 = spells[0], spells[1]
        n1 = SPELL_NAMES.get(s1, s1)
        n2 = SPELL_NAMES.get(s2, s2)
        try:
            resp = await connection.request(
                'patch', '/lol-champ-select/v1/session/my-selection',
                data={'spell1Id': s1, 'spell2Id': s2},
            )
        except Exception as e:
            self._log(f"spells PATCH raised: {e!r}")
            return
        if resp.status < 400:
            config.console.print(f"[info]Set summoner spells: {n1} + {n2}[/]")
            events.push(f"Set summoner spells: {n1} + {n2}", "info")
            self._log(f"spells set -> {s1},{s2}")
        else:
            self._log(f"spells PATCH -> HTTP {resp.status}")

    async def _apply_runes(self, connection, champion_id):
        """Apply the League client's own recommended rune page for `champion_id`.

        Best-effort: reads /lol-perks/v1/recommended-pages, then reuses a single
        managed page (delete + recreate) so we never accumulate pages or touch
        the user's own. Silently no-ops if no recommendation is available or the
        page can't be created (e.g. the user is at their rune-page cap)."""
        try:
            rec = await connection.request('get', '/lol-perks/v1/recommended-pages')
            if rec.status != 200:
                self._log(f"recommended-pages -> HTTP {rec.status}")
                return
            pages = await rec.json()
            if not isinstance(pages, list) or not pages:
                self._log("recommended-pages returned nothing")
                return

            # Prefer a recommendation for the champ we're locking; else first.
            page = next((p for p in pages if p.get('championId') == champion_id), None)
            page = page or pages[0]
            primary = page.get('primaryPerkStyleId') or page.get('primaryStyleId')
            sub = page.get('secondaryPerkStyleId') or page.get('subStyleId')
            perks = page.get('perks') or page.get('selectedPerkIds') or []
            if not (primary and sub and perks):
                self._log(f"recommended page incomplete: {page!r}")
                return

            body = {
                'name': RUNE_PAGE_NAME,
                'primaryStyleId': primary,
                'subStyleId': sub,
                'selectedPerkIds': list(perks),
                'current': True,
            }

            # Delete our previous managed page (if any) before recreating, so we
            # free its slot and never stack duplicates. Never delete user pages.
            try:
                cur = await connection.request('get', '/lol-perks/v1/pages')
                if cur.status == 200:
                    for pg in await cur.json():
                        if pg.get('name') == RUNE_PAGE_NAME and pg.get('isDeletable', True):
                            await connection.request(
                                'delete', f"/lol-perks/v1/pages/{pg.get('id')}"
                            )
            except Exception as e:
                self._log(f"rune page cleanup failed: {e!r}")

            resp = await connection.request('post', '/lol-perks/v1/pages', data=body)
            display = self.id_to_name.get(champion_id, champion_id)
            if resp.status < 400:
                # `current: true` on create usually selects the page, but set it
                # explicitly too — some client versions ignore the create flag.
                try:
                    new_id = (await resp.json()).get('id')
                    if new_id:
                        await connection.request(
                            'put', '/lol-perks/v1/currentpage', data=new_id
                        )
                except Exception as e:
                    self._log(f"set currentpage failed: {e!r}")
                config.console.print(f"[success]🪶 Applied recommended runes for {display}[/]")
                events.push(f"Applied recommended runes for {display}", "success")
                self._log(f"runes applied for {display} (champ {champion_id})")
            else:
                self._log(f"rune POST -> HTTP {resp.status}")
        except Exception as e:
            self._log(f"_apply_runes error: {e!r}")
