import asyncio
import logging
import os
import random
import time

import config
import events

# When instant-lock is off, the default number of seconds left in the pick
# window at which we force a lock-in if the user hasn't done it manually.
DEFAULT_LOCK_SECONDS = 1

# Assumed champ-select pick window (seconds) when the client doesn't report a
# usable totalTimeInPhase. The Rift pick timer is ~30s; we run our own countdown
# from this rather than trusting the client's (non-live) phase timer.
DEFAULT_PICK_WINDOW = 30.0

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
# ARAM is intentionally NOT here, `assignedPosition` is never "aram", so adding
# it would break position resolution in _process. It's a virtual editor tab only.
ROLES = ["top", "jungle", "middle", "bottom", "utility"]
ROLE_LABELS = {
    "top": "Top",
    "jungle": "Jungle",
    "middle": "Middle",
    "bottom": "Bottom (ADC)",
    "utility": "Support",
    "aram": "ARAM",
}

# Virtual key for the ARAM preference list. Its picks double as the bench-swap +
# trade priority order; it gets its own tab in the champ-select grid editor.
ARAM_ROLE = "aram"

# Roles offered as tabs in the champ-select editor (the 5 positions + ARAM). Used
# for config normalization and the get_roles() UI list. ROLES stays position-only.
EDITOR_ROLES = ROLES + [ARAM_ROLE]

# ARAM champ-priority modes (champ_select.aram.mode): what the subset pick,
# bench grabs, and trades all chase.
#   "list"     the hand-built Champ Select → ARAM list
#   "highest"  highest mastery first (the classic auto_mastery behavior)
#   "lowest"   lowest mastery first, never-played champs at the very front,
#              for players grinding new champs
#   "random"   one per-session shuffle of every champ, chased consistently
ARAM_MODES = ("list", "highest", "lowest", "random")

# Per-champ skin preference (loadout.skin):
#   "off"            don't change the skin
#   <skinId int>     pick this exact skin
#   [skinId, …]      "random favorite", pick one of these at random (from the
#                    ones actually owned) when the champ locks in.

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
    {"id": 32, "name": "Mark/Dash"},  # Snowball, ARAM only
]
SPELL_IDS = {s["id"] for s in SUMMONER_SPELLS}
SPELL_NAMES = {s["id"]: s["name"] for s in SUMMONER_SPELLS}

# Name of the single rune page queuePop manages when auto-runes is on. We
# delete + recreate this one page each game so pages never pile up and the
# user's own pages are never touched.
RUNE_PAGE_NAME = "queuePop (auto)"


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
        self._spells_for = None    # championId we last set summoner spells for
        self._runes_for = None     # championId we last applied runes for
        self._skin_for = None      # championId we last auto-selected a skin for
        self._rune_try_for = None  # championId we're currently retrying recommended runes for
        self._rune_tries = 0       # recommended-pages 404s briefly post-lock; bounded retry
        self._rune_cap_warned = False  # notified once per session that pages are full
        self._trade_state = {}     # (kind, tradeId) -> 'accepted'|'notified'|'declined'
        self._trade_out = None     # our live outgoing request: {'id', 'cell'} or None
        self._trade_last = {}      # tradeId -> monotonic time of our last action (cooldown)
        self._bench_target = None  # championId we last tried to grab off the bench
        self._mastery_pts = None  # championId -> mastery points, cached per session
        self._mastery_ids = None  # championIds sorted by mastery (desc), cached per session
        self._random_ids = None   # per-session shuffle for the "random" ARAM mode
        # monotonic time our pick turn was first detected (isInProgress). The
        # client's phase timer runs ahead of the per-pick sub-timer, so we anchor
        # our lock countdown to detection and assume a ~30s pick window instead.
        self._pick_open = None

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

    @staticmethod
    def _loadout(cs, role_key, champion_id):
        """The per-(role, champ) loadout dict, or {} if none. A loadout holds
        {spells:[id,id], rune:"off"|"recommended"|pageId,
        skin:"off"|skinId|[skinId, …]}."""
        if not role_key or not champion_id:
            return {}
        role = (cs.get("roles") or {}).get(role_key) or {}
        return (role.get("loadouts") or {}).get(str(champion_id)) or {}

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

    def _any_automation(self, cs):
        """True if any champ-select automation is on, auto pick/ban, runes,
        trades, ARAM bench, or skins. Used to decide whether the loop runs (the
        individual features are still gated separately inside _process)."""
        aram = cs.get("aram") or {}
        if (cs.get("enabled")
                or (cs.get("trades") or {}).get("enabled")
                or aram.get("enabled")
                or aram.get("auto_mastery")):
            return True
        # Any per-champ loadout (spells/rune/skin) also needs the loop running.
        for role in (cs.get("roles") or {}).values():
            if (role or {}).get("loadouts"):
                return True
        return False

    def on_session_event(self, connection):
        """
        Called from the websocket handler whenever the champ select session
        changes. Spins up the management loop if it isn't already running.
        """
        cs = self._settings()
        if not self._any_automation(cs):
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
        self._spells_for = None
        self._runes_for = None
        self._skin_for = None
        self._rune_try_for = None
        self._rune_tries = 0
        self._rune_cap_warned = False
        self._trade_state = {}
        self._trade_out = None
        self._trade_last = {}
        self._bench_target = None
        self._mastery_pts = None
        self._mastery_ids = None
        self._random_ids = None
        self._pick_open = None
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

        roles_cfg = cs.get('roles', {}) or {}
        role_cfg = roles_cfg.get(position)
        aram_cfg = roles_cfg.get(ARAM_ROLE, {}) or {}
        # ARAM is signalled by the reroll bench; it has no assigned position.
        is_aram = bool(session.get('benchEnabled'))

        # The active pick-priority list for trades + skins context: the assigned
        # role's picks on the Rift, or the ARAM list in ARAM, else nothing.
        if role_cfg:
            active_picks = role_cfg.get('picks') or []
        elif is_aram:
            active_picks = aram_cfg.get('picks') or []
        else:
            active_picks = []

        # The champion we're committed to: our hovered/locked pick on the Rift,
        # or our assigned champ in ARAM. Drives runes + skins.
        my_champ = self._my_champion(session, local_cell)

        # Cheap, no-network reads: champs to avoid, the phase, and our own
        # incomplete ban/pick actions.
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

        # The champ-priority order driving the ARAM subset pick, trades, and
        # the bench, as resolved championIds. In ARAM the priority mode picks
        # the ranking (hand list, highest/lowest mastery, or random); on the
        # Rift it's always the assigned role's picks list. Computed before the
        # pick logic because ARAM's subset pick needs it (on the Rift this is
        # list-only, no LCU call, so it can't delay picks).
        aram_toggle = cs.get('aram') or {}
        aram_on = is_aram and bool(aram_toggle.get('enabled')
                                   or aram_toggle.get('auto_mastery'))
        aram_mode = self._aram_mode(aram_toggle)
        if aram_on and aram_mode != 'list':
            pri = await self._aram_priority(connection, aram_mode, active_picks)
        else:
            pri = self._priority_ids(active_picks)

        # === Time-critical: BAN + PICK first ============================
        # These run before any cosmetic handler (spells/trades/skins/runes) so a
        # slow LCU call, e.g. fetching recommended runes, can never delay a
        # lock-in and risk a dodge. Gated on an assigned-role preference.
        if role_cfg:
            # --- Ban: hover then commit, ONLY during the real ban phase. The
            # ban action can briefly report isInProgress during PLANNING; gating
            # to BAN_PICK avoids burning our state on a ban that won't count.
            if phase == 'BAN_PICK' and my_ban is not None and my_ban.get('isInProgress'):
                chosen = self._select(role_cfg.get('bans', []), unavailable)
                if chosen:
                    await self._commit(connection, my_ban, chosen, 'ban', action_state, lock=True)

            # --- Pick: declare intent early; on our turn lock instantly (default)
            # or hold the hover and lock `lock_in_at_seconds` before the buzzer on
            # our client-synced local countdown. ---
            if my_pick is not None:
                chosen = self._select(role_cfg.get('picks', []), unavailable)
                if chosen:
                    if my_pick.get('isInProgress'):
                        if self._pick_open is None:
                            self._pick_open = time.monotonic()
                            self._log("pick turn detected; lock countdown started")
                        lock = self._ready_to_lock(cs)
                        if lock:
                            self._log(f"locking pick {chosen} "
                                      f"(+{time.monotonic() - self._pick_open:.2f}s)")
                        await self._commit(connection, my_pick, chosen, 'pick',
                                           action_state, lock=lock)
                    else:
                        await self._commit(connection, my_pick, chosen, 'pick',
                                           action_state, lock=False, intent=True)
        elif (aram_on and my_pick is not None and phase == 'BAN_PICK'
                and my_pick.get('isInProgress')):
            # ARAM's opening pick: the client offers a 2-3 champ subset for
            # ~10s, then random-assigns one at the buzzer (benching the rest).
            # The offered ids are only exposed by the lobby-team-builder
            # mirror, NOT the session; picking a champ outside the subset
            # returns 204 but is silently ignored, which is why this looked
            # impossible before. Hover-then-lock the best offered champ.
            subset = await self._subset_champions(connection)
            if subset:
                chosen = await self._best_subset_pick(connection, subset, pri)
                if chosen:
                    await self._commit(connection, my_pick, chosen, 'pick',
                                       action_state, lock=True)
        else:
            # No assigned-role pick/ban here (Blind, unconfigured, or ARAM
            # automation off). The cosmetic handlers still run. Log once.
            sig2 = ("no-role", position)
            if sig2 != self._last_sig:
                self._last_sig = sig2
                self._log(f"no role config for position={position!r}; team positions="
                          f"{[(p.get('cellId'), p.get('assignedPosition')) for p in my_team]}")

        # === Non-urgent automation (may make several LCU calls) =========
        # Order matters: bench first (instant, free, unilateral), then trades
        # (slow, consensual — decided against our post-bench champ), then the
        # cosmetics (spells/runes/skin), which just re-key off whatever champ
        # we end the poll holding.
        role_key = position if role_cfg else (ARAM_ROLE if is_aram else None)

        # --- ARAM bench: grab a higher-priority champ off the reroll bench. ---
        swapped = False
        if aram_on:
            swapped = await self._handle_bench(connection, session, local_cell, pri)

        # --- Trades: request/accept/cancel toward upgrades (Rift or ARAM).
        # Skipped on a swap tick: the session snapshot still shows our old
        # champ, so any trade decision would be made against stale data. ---
        if not swapped and (cs.get('trades') or {}).get('enabled'):
            await self._handle_trades(connection, session, local_cell, pri)

        # --- Cosmetics, driven by the per-(role, champ) loadout. ---
        loadout = self._loadout(cs, role_key, my_champ)

        # --- Summoner spells: set once per champ from its loadout. ---
        spells = (loadout.get('spells') or [])[:2]
        if my_champ and self._spells_for != my_champ and len(spells) >= 2:
            self._spells_for = my_champ
            await self._apply_spells(connection, spells)

        locked_champ = self._my_champion(session, local_cell, locked_only=True)

        # --- Runes: a specific saved page selects on hover; the client's
        # recommended page is fetched once LOCKED, with a bounded retry because
        # /recommended-pages 404s for a beat right after lock before the client
        # computes it. ---
        rune = loadout.get('rune', 'off')
        if rune == 'recommended':
            if locked_champ and self._runes_for != locked_champ:
                if self._rune_try_for != locked_champ:
                    self._rune_try_for = locked_champ
                    self._rune_tries = 0
                self._rune_tries += 1
                done = await self._apply_runes(
                    connection, locked_champ, position, 12 if is_aram else 11
                )
                if done or self._rune_tries >= 24:  # ~6s of polls, then give up
                    self._runes_for = locked_champ
        elif rune != 'off' and my_champ and self._runes_for != my_champ:
            self._runes_for = my_champ
            await self._select_rune_page(connection, rune)

        # --- Skins: from the LOCKED champ's loadout (carousel isn't available
        # while only hovering, so we wait for lock). ---
        if locked_champ and self._skin_for != locked_champ:
            skin = self._loadout(cs, role_key, locked_champ).get('skin', 'off')
            if skin != 'off':
                await self._handle_skins(connection, locked_champ, skin)

    def _ready_to_lock(self, cs):
        """Whether it's time to lock our pick. Instant by default; otherwise lock
        once `lock_in_at_seconds` would remain in an assumed ~30s pick window,
        measured from when our turn was detected. We don't trust the client's
        phase timer here, it runs ahead of the per-pick sub-timer, which made us
        lock seconds late."""
        if cs.get('instant_lock', True):
            return True
        try:
            lock_at = float(cs.get('lock_in_at_seconds', DEFAULT_LOCK_SECONDS))
        except (TypeError, ValueError):
            lock_at = DEFAULT_LOCK_SECONDS
        if self._pick_open is None:
            return False  # not detected yet, wait for the next poll
        elapsed = time.monotonic() - self._pick_open
        return elapsed >= max(0.0, DEFAULT_PICK_WINDOW - lock_at)

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
        # hovered. So we always hover first, then lock on a subsequent poll, 
        # this is what made picks work and bans (which we used to lock in one
        # shot) silently fail.
        if state != ('hover', champion_id):
            ok = await self._patch(connection, action_id, champion_id, complete=False)
            action_state[action_id] = ('hover', champion_id)
            label = "Declaring intent" if intent else "Hovering"
            config.console.print(f"[info]{label} {kind}: {display}[/]")
            events.push(f"{label} {kind}: {display}", "info", kind="champ")
            self._log(f"{label} {kind}: {display} (action {action_id}) -> ok={ok}")
            return

        if lock:
            ok = await self._patch(connection, action_id, champion_id, complete=True)
            action_state[action_id] = ('locked', champion_id)
            config.console.print(f"[success]🔒 Locked {kind}: {display}[/]")
            events.push(f"Locked {kind}: {display}", "success", kind="champ")
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
        `spells` is [spell1Id, spell2Id]. Best-effort, logs and moves on."""
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
            events.push(f"Set summoner spells: {n1} + {n2}", "info", kind="champ")
            self._log(f"spells set -> {s1},{s2}")
        else:
            self._log(f"spells PATCH -> HTTP {resp.status}")

    async def _apply_runes(self, connection, champion_id, position="", map_id=11):
        """Apply the League client's own recommended rune page for `champion_id`.

        Reuses a single managed page (editing it in place when possible) so we
        never accumulate pages or touch the user's own. Returns True when done
        (applied, or a non-retryable failure like the rune-page cap) and False
        when the caller should retry, the recommendation endpoint 404s for a
        beat right after lock before the client computes it."""
        try:
            # Try the position/map-qualified endpoint first (computes on demand),
            # then the bare one (reads the client's cached recommendation).
            pos = (position or "").upper()
            endpoints = []
            if pos:
                endpoints.append(
                    f"/lol-perks/v1/recommended-pages/champion/{champion_id}"
                    f"/position/{pos}/map/{map_id}"
                )
            endpoints.append("/lol-perks/v1/recommended-pages")

            pages = None
            for ep in endpoints:
                rec = await connection.request('get', ep)
                if rec.status == 200:
                    data = await rec.json()
                    if isinstance(data, list) and data:
                        pages = data
                        self._log(f"recommended via {ep} ({len(data)} pages)")
                        break
                    self._log(f"{ep} -> 200 but empty")
                else:
                    self._log(f"{ep} -> HTTP {rec.status}")
            if not pages:
                return False  # retry, not computed yet

            # Prefer a recommendation for the champ we're locking; else first.
            page = next((p for p in pages if p.get('championId') == champion_id), None)
            page = page or pages[0]
            self._log(f"recommended page keys: {sorted(page.keys())}")
            primary = (page.get('primaryPerkStyleId') or page.get('primaryStyleId')
                       or page.get('primaryStyle'))
            sub = (page.get('secondaryPerkStyleId') or page.get('subStyleId')
                   or page.get('secondaryStyle') or page.get('subStyle'))
            # `perks` may be a list of ints or of dicts (extract the id from each).
            raw_perks = (page.get('perks') or page.get('selectedPerkIds')
                         or page.get('perkIds') or [])
            perks = []
            for p in raw_perks:
                if isinstance(p, dict):
                    pid = p.get('id') or p.get('perkId')
                    if pid:
                        perks.append(pid)
                elif isinstance(p, int):
                    perks.append(p)
            if not (primary and sub and perks):
                self._log(f"recommended page incomplete: primary={primary} sub={sub} "
                          f"perks={len(perks)} raw={page!r} (retrying)")
                return False

            body = {
                'name': RUNE_PAGE_NAME,
                'primaryStyleId': primary,
                'subStyleId': sub,
                'selectedPerkIds': list(perks),
                'current': True,
            }
            display = self.id_to_name.get(champion_id, champion_id)

            # Reuse our managed page in place if it already exists: editing it
            # (PUT) needs no free slot, which is what made create fail when the
            # user was at their rune-page cap. Only create as a fallback.
            existing_id = None
            try:
                cur = await connection.request('get', '/lol-perks/v1/pages')
                if cur.status == 200:
                    for pg in await cur.json():
                        if pg.get('name') == RUNE_PAGE_NAME:
                            existing_id = pg.get('id')
                            break
            except Exception as e:
                self._log(f"rune page lookup failed: {e!r}")

            new_id = existing_id
            if existing_id is not None:
                # Our managed page exists, edit it in place (no slot needed).
                resp = await connection.request(
                    'put', f'/lol-perks/v1/pages/{existing_id}', data=body
                )
            else:
                # No managed page yet, try to create one (needs a free slot).
                resp = await connection.request('post', '/lol-perks/v1/pages', data=body)
                if resp.status >= 400:
                    detail = await self._safe_text(resp)
                    self._log(f"rune POST -> HTTP {resp.status} {detail}")
                    # At the rune-page cap (League gives 2 by default) we can't
                    # add a page, and we never overwrite the user's own pages
                    # without consent, they pick a page for queuePop in
                    # Settings → Recommended Runes. Notify once per session.
                    if not self._rune_cap_warned:
                        self._rune_cap_warned = True
                        events.push(
                            "Rune pages are full, choose a page for queuePop in "
                            "Settings → Recommended Runes to enable auto runes.",
                            "warning", kind="runes_full",
                        )
                    return True  # non-retryable until the user frees/picks a page

            if resp.status >= 400:
                self._log(f"rune PUT -> HTTP {resp.status} {await self._safe_text(resp)}")
                return True
            if new_id is None:
                try:
                    new_id = (await resp.json()).get('id')
                except Exception as e:
                    self._log(f"rune create: couldn't read new page id: {e!r}")

            # `current: true` in the body usually selects it, but set it
            # explicitly too, some client versions ignore the create flag.
            if new_id is not None:
                try:
                    await connection.request('put', '/lol-perks/v1/currentpage', data=new_id)
                except Exception as e:
                    self._log(f"set currentpage failed: {e!r}")
            config.console.print(f"[success]🪶 Applied recommended runes for {display}[/]")
            events.push(f"Applied recommended runes for {display}", "success", kind="runes")
            self._log(f"runes applied for {display} (champ {champion_id}, page {new_id})")
            return True
        except Exception as e:
            self._log(f"_apply_runes error: {e!r}")
            return False

    @staticmethod
    async def _safe_text(resp):
        try:
            return await resp.text()
        except Exception:
            return ""

    async def _select_rune_page(self, connection, page_id):
        """Make one of the user's existing rune pages the current/active page.
        No page creation, just selects what they built in the client."""
        try:
            page_id = int(page_id)
        except (TypeError, ValueError):
            return
        try:
            resp = await connection.request(
                'put', '/lol-perks/v1/currentpage', data=page_id
            )
        except Exception as e:
            self._log(f"select rune page raised: {e!r}")
            return
        if resp.status < 400:
            config.console.print(f"[success]🪶 Applied your rune page (#{page_id})[/]")
            events.push("Applied your rune page", "success", kind="runes")
            self._log(f"selected rune page {page_id}")
        else:
            self._log(f"select rune page {page_id} -> HTTP {resp.status}")

    # --- Priority helpers (shared by trades + bench) -------------------

    def _my_champion(self, session, local_cell, locked_only=False):
        """The championId we're committed to: our pick action on the Rift, or our
        assigned champ in ARAM. With `locked_only`, only counts a *completed*
        (locked) pick, used for skins, which can't be set until lock-in. 0 until
        a champ qualifies."""
        for round_actions in session.get('actions', []) or []:
            for action in round_actions:
                if (action.get('actorCellId') == local_cell
                        and action.get('type') == 'pick'):
                    cid = action.get('championId') or 0
                    if cid > 0:
                        if action.get('completed'):
                            return cid
                        if not locked_only and action.get('isInProgress'):
                            return cid
        # ARAM (and other modes without pick actions): the assigned champ in
        # myTeam is effectively locked, so it counts for both cases.
        for p in session.get('myTeam', []) or []:
            if p.get('cellId') == local_cell:
                return p.get('championId') or 0
        return 0

    def _priority_ids(self, names):
        """Resolve a configured name list to an ordered, de-duped id list."""
        ids = []
        for nm in names or []:
            cid = self._resolve(nm)
            if cid and cid not in ids:
                ids.append(cid)
        return ids

    @staticmethod
    def _rank(cid, pri_ids):
        """Priority rank of a champ (lower = better). Absent → effectively last."""
        try:
            return pri_ids.index(cid)
        except ValueError:
            return 10 ** 6

    async def _mastery_points(self, connection):
        """championId -> mastery points, cached for the session. None while the
        client hasn't produced mastery data yet (callers retry next poll)."""
        if self._mastery_pts is not None:
            return self._mastery_pts
        try:
            resp = await connection.request(
                'get', '/lol-champion-mastery/v1/local-player/champion-mastery'
            )
        except Exception as e:
            self._log(f"mastery fetch raised: {e!r}")
            return None
        if resp.status != 200:
            self._log(f"mastery fetch -> HTTP {resp.status}")
            return None  # leave cache unset so we retry once it's available
        try:
            data = await resp.json()
        except Exception as e:
            self._log(f"mastery decode raised: {e!r}")
            return None
        if isinstance(data, dict):
            data = data.get('championMasteryList') or []
        pts = {}
        for m in data or []:
            cid = m.get('championId')
            if cid:
                pts[cid] = m.get('championPoints', 0) or 0
        self._mastery_pts = pts
        self._log(f"mastery loaded ({len(pts)} champs)")
        return pts

    async def _mastery_ranked(self, connection):
        """The player's championIds ordered by mastery points (highest first),
        cached for the session. Returns [] until mastery data is available."""
        if self._mastery_ids is None:
            pts = await self._mastery_points(connection)
            if pts is None:
                return []
            self._mastery_ids = sorted(pts, key=pts.get, reverse=True)
        return self._mastery_ids

    def _aram_mode(self, aram_toggle):
        """The active ARAM priority mode, honoring the legacy auto_mastery
        flag from configs written before `mode` existed."""
        mode = aram_toggle.get('mode')
        if mode not in ARAM_MODES:
            mode = 'highest' if aram_toggle.get('auto_mastery') else 'list'
        return mode

    async def _aram_priority(self, connection, mode, active_picks):
        """The resolved championId priority order for an ARAM mode (see
        ARAM_MODES). 'lowest' covers every known champ with never-played ones
        first; 'random' shuffles once per session so the subset pick, bench,
        and trades all chase the same surprise target."""
        if mode == 'highest':
            return await self._mastery_ranked(connection)
        if mode == 'lowest':
            pts = await self._mastery_points(connection)
            if pts is None:
                return []
            return sorted(self.id_to_name, key=lambda c: (pts.get(c, 0), c))
        if mode == 'random':
            if self._random_ids is None and self.id_to_name:
                ids = list(self.id_to_name)
                random.shuffle(ids)
                self._random_ids = ids
                self._log(f"random priority shuffled ({len(ids)} champs)")
            return self._random_ids or []
        return self._priority_ids(active_picks)

    # --- ARAM subset pick ----------------------------------------------

    async def _subset_champions(self, connection):
        """The 2-3 championIds ARAM offers us to pick from at the start of
        champ select, or [] when no subset is up. Only the lobby-team-builder
        mirror exposes this list (404s outside the pick window)."""
        try:
            resp = await connection.request(
                'get', '/lol-lobby-team-builder/champ-select/v1/subset-champion-list'
            )
        except Exception as e:
            self._log(f"subset list raised: {e!r}")
            return []
        if resp.status != 200:
            return []
        try:
            data = await resp.json()
        except Exception as e:
            self._log(f"subset list decode raised: {e!r}")
            return []
        if not isinstance(data, list):
            return []
        return [c for c in data if isinstance(c, int) and c > 0]

    async def _best_subset_pick(self, connection, subset, pri):
        """The offered champ to pick: best by the active priority order, then
        by mastery when none of the offered champs are ranked (so a hand-built
        list that misses all three still picks sensibly), else the first."""
        best = min(subset, key=lambda c: self._rank(c, pri))
        if self._rank(best, pri) < 10 ** 6:
            return best
        mastery = await self._mastery_ranked(connection)
        if mastery:
            return min(subset, key=lambda c: self._rank(c, mastery))
        return subset[0]

    # --- Trades --------------------------------------------------------

    # Seconds to sit out after cancelling/requesting a trade before touching
    # the same trade again, so a flapping rank (e.g. mid-swap lobby churn)
    # can't spam a teammate with request/cancel cycles.
    TRADE_COOLDOWN = 3.0

    async def _handle_trades(self, connection, session, local_cell, pri):
        """Auto-trade toward a higher-priority pick. A trade is a standing
        offer, not an action, so this reconciles rather than fire-and-forgets:
          * accept an incoming trade when the offered champ out-ranks ours,
            re-verified at the moment we act (otherwise just notify once), and
          * keep at most ONE live outgoing request, always aimed at the best
            upgrade a teammate is holding, cancelling it the moment it goes
            stale (we out-grew it via a bench swap, or a better target appeared)
            so a late accept can never downgrade us.
        `pri` is the resolved championId priority order (lower index = better)."""
        my_team = session.get('myTeam', []) or []
        cell_champ = {}
        my_champ = 0
        for p in my_team:
            c = p.get('championId') or 0
            cell_champ[p.get('cellId')] = c
            if p.get('cellId') == local_cell:
                my_champ = c
        if not my_champ:
            return
        my_rank = self._rank(my_champ, pri)
        # Newer clients renamed champ trades to "championSwaps"; the legacy
        # `trades` array still mirrors it for now, so read whichever is present.
        trades = session.get('trades') or session.get('championSwaps') or []

        # Incoming offers: accept upgrades (the upgrade check runs right here,
        # against our CURRENT champ), otherwise notify (each once).
        for t in trades:
            if t.get('state') != 'RECEIVED':
                continue
            tid = t.get('id')
            their = cell_champ.get(t.get('cellId'), 0)
            their_name = self.id_to_name.get(their, their) if their else f"cell {t.get('cellId')}"
            if their and self._rank(their, pri) < my_rank:
                if self._trade_state.get(('recv', tid)) != 'accepted':
                    self._trade_state[('recv', tid)] = 'accepted'
                    ok = await self._post_trade(connection, tid, 'accept')
                    if ok:
                        config.console.print(f"[success]🔁 Accepted trade for {their_name}[/]")
                        events.push(f"Accepted trade for {their_name}", "success", kind="trade")
                    else:
                        events.push(f"Trade accept failed for {their_name}", "warning", kind="trade")
                    self._log(f"trade {tid} accept -> {their_name} ok={ok}")
            elif self._trade_state.get(('recv', tid)) != 'notified':
                self._trade_state[('recv', tid)] = 'notified'
                events.push(f"Trade requested by {their_name}", "info", kind="trade")
                self._log(f"trade {tid} received (no upgrade): {their_name}")

        # The single best upgrade a teammate is holding right now.
        best_cell, best_rank = None, my_rank
        for p in my_team:
            cell = p.get('cellId')
            if cell == local_cell:
                continue
            c = p.get('championId') or 0
            if not c:
                continue
            r = self._rank(c, pri)
            if r < best_rank:
                best_rank, best_cell = r, cell

        now = time.monotonic()

        # Reconcile our outstanding request before anything else: forget it if
        # it resolved (accepted/declined/expired), cancel it if it no longer
        # points at the best upgrade.
        out = self._trade_out
        if out:
            t = next((x for x in trades if x.get('id') == out['id']), None)
            state = (t or {}).get('state')
            if state == 'DECLINED':
                # They said no to this pairing; don't pester them again.
                self._trade_state[('req', out['id'])] = 'declined'
            if state not in ('SENT', 'BUSY'):
                self._trade_out = None
            elif out['cell'] != best_cell:
                ok = await self._post_trade(connection, out['id'], 'cancel')
                name = self.id_to_name.get(cell_champ.get(out['cell'], 0), 'champ')
                events.push(f"Cancelled trade request for {name} (no longer an upgrade)",
                            "info", kind="trade")
                self._log(f"trade {out['id']} cancel -> {name} ok={ok}")
                self._trade_last[out['id']] = now
                self._trade_out = None
                return  # re-evaluate next poll against fresh trade state

        # Request the best upgrade (one live request at a time).
        if best_cell is None or self._trade_out:
            return
        t = next((x for x in trades if x.get('cellId') == best_cell), None)
        if not t or t.get('state') != 'AVAILABLE':
            return
        tid = t.get('id')
        if self._trade_state.get(('req', tid)) == 'declined':
            return
        if now - self._trade_last.get(tid, -self.TRADE_COOLDOWN) < self.TRADE_COOLDOWN:
            return
        self._trade_last[tid] = now
        their_name = self.id_to_name.get(cell_champ.get(best_cell, 0), 'champ')
        ok = await self._post_trade(connection, tid, 'request')
        if ok:
            self._trade_out = {'id': tid, 'cell': best_cell}
            config.console.print(f"[info]🔁 Requesting trade for {their_name}[/]")
            events.push(f"Requesting trade for {their_name}", "info", kind="trade")
        else:
            events.push(f"Trade request failed for {their_name}", "warning", kind="trade")
        self._log(f"trade {tid} request -> {their_name} ok={ok}")

    async def _post_trade(self, connection, trade_id, action):
        """POST a trade action (request/accept/decline). True on success.
        Champ trades moved to /champion-swaps (the /trades routes 404 on
        current clients), so try the new path first and fall back to the
        legacy one for older clients."""
        for ep in (
            f'/lol-champ-select/v1/session/champion-swaps/{trade_id}/{action}',
            f'/lol-champ-select/v1/session/trades/{trade_id}/{action}',
        ):
            try:
                resp = await connection.request('post', ep)
            except Exception as e:
                self._log(f"trade {trade_id} {action} raised: {e!r}")
                return False
            if resp.status < 400:
                return True
            self._log(f"trade {trade_id} {action} {ep} -> HTTP {resp.status}")
            if resp.status != 404:
                return False
        return False

    # --- ARAM bench ----------------------------------------------------

    async def _handle_bench(self, connection, session, local_cell, pri):
        """Grab a higher-priority champ off the ARAM reroll bench. Re-evaluates
        each poll so a later, better roll is taken too; a per-target guard (plus
        the client's own swap cooldown) keeps us from spamming the endpoint.
        `pri` is the resolved championId priority order (lower index = better).
        Returns True when a swap was made (our champ changed under this poll's
        session snapshot, so the caller skips trade decisions this tick)."""
        if not pri:
            return False
        my_champ = 0
        for p in session.get('myTeam', []) or []:
            if p.get('cellId') == local_cell:
                my_champ = p.get('championId') or 0
                break
        if not my_champ:
            return False

        bench = []
        for b in session.get('benchChampions') or []:
            bid = b.get('championId') if isinstance(b, dict) else b
            if bid:
                bench.append(bid)
        if not bench:
            bench = [b for b in (session.get('benchChampionIds') or []) if b]
        if not bench:
            return False

        my_rank = self._rank(my_champ, pri)
        best, best_rank = None, my_rank
        for cid in bench:
            r = self._rank(cid, pri)
            if r < best_rank:
                best_rank, best = r, cid
        if best is None or self._bench_target == best:
            return False

        # Set the guard before the request so a rejected swap (cooldown) doesn't
        # re-fire every poll; it clears naturally when a better target appears.
        self._bench_target = best
        name = self.id_to_name.get(best, best)
        try:
            resp = await connection.request(
                'post', f'/lol-champ-select/v1/session/bench/swap/{best}'
            )
        except Exception as e:
            self._log(f"bench swap raised: {e!r}")
            return False
        if resp.status < 400:
            config.console.print(f"[success]🔀 Grabbed {name} off the bench[/]")
            events.push(f"Grabbed {name} off the bench", "success", kind="bench_swap")
            self._log(f"bench swap -> {name} ({best})")
            return True
        self._log(f"bench swap {best} -> HTTP {resp.status}")
        return False

    # --- Skins ---------------------------------------------------------

    async def _handle_skins(self, connection, my_champ, skin_pref):
        """Select a skin for our locked champ from its loadout preference, once
        per champ per session. `skin_pref` is a specific skinId (int) or a list
        of skinIds (a "random favorite", one is chosen at random from those
        actually owned). The skin carousel (/skin-carousel-skins) only returns
        data once a champ is locked, so this no-ops (without marking done) until
        then."""
        if not my_champ or self._skin_for == my_champ or skin_pref in (None, 'off'):
            return
        try:
            r = await connection.request(
                'get', '/lol-champ-select/v1/skin-carousel-skins'
            )
            if r.status != 200:
                self._log(f"skin-carousel-skins -> HTTP {r.status}")
                return
            skins = await r.json()
        except Exception as e:
            self._log(f"skins fetch raised: {e!r}")
            return
        # Empty/unavailable carousel means we're not locked yet, retry later
        # rather than marking this champ handled.
        if not isinstance(skins, list) or not skins:
            return

        def selectable(s):
            own = s.get('ownership') or {}
            rented = (own.get('rental') or {}).get('rented')
            return bool(s.get('unlocked') or own.get('owned') or rented) and not s.get('disabled')

        owned = [s for s in skins if selectable(s)]
        # We have the carousel, commit to handling this champ once now, whatever
        # we pick, so random/best don't churn a new skin on every poll.
        self._skin_for = my_champ
        if not owned:
            return

        def skin_id_of(s):
            return s.get('id') or s.get('skinId')

        chosen = None
        if isinstance(skin_pref, list):
            # Random favorite: pick at random among the favorites we actually own.
            favs = [s for s in owned if skin_id_of(s) in skin_pref]
            if favs:
                chosen = random.choice(favs)
        elif isinstance(skin_pref, int):
            chosen = next((s for s in owned if skin_id_of(s) == skin_pref), None)
        if not chosen:
            return
        skin_id = chosen.get('id') or chosen.get('skinId')
        await self._apply_skin(connection, skin_id, chosen.get('name') or skin_id)

    async def _apply_skin(self, connection, skin_id, name):
        """Set selectedSkinId on our champ-select selection. Best-effort."""
        try:
            resp = await connection.request(
                'patch', '/lol-champ-select/v1/session/my-selection',
                data={'selectedSkinId': int(skin_id)},
            )
        except Exception as e:
            self._log(f"skin PATCH raised: {e!r}")
            return
        if resp.status < 400:
            config.console.print(f"[info]🎨 Selected skin: {name}[/]")
            events.push(f"Selected skin: {name}", "info", kind="skin")
            self._log(f"skin set -> {skin_id} ({name})")
        else:
            self._log(f"skin PATCH -> HTTP {resp.status}")
