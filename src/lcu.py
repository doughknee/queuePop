import asyncio
from lcu_driver import Connector
import lcu_driver.connector as _lcu_connector
from psutil import process_iter as _process_iter
from rich.panel import Panel

import config
import events
from champ_select import ChampSelect
from notifications import (send_discord_ping, send_desktop_notification,
                           send_discord_event, send_desktop_event)
import stats

# --- Cheap client discovery (perf fix) -------------------------------------
# lcu_driver's stock _return_ux_process scans EVERY process's command line
# (psutil.process_iter(attrs=["cmdline"])) and does so on a near-tight loop
# while the League client is closed (Connector.start: scan → sleep 0.5s →
# scan). On Windows, reading a process's cmdline opens the process and walks
# its PEB, so a full scan of 300+ processes takes ~3s, and the pure-Python
# iteration holds the GIL almost the whole time. That starves pywebview's
# main-thread Win32 message pump, so dragging our frameless window stutters
# badly — but ONLY while the client is offline (once connected the connector
# sits idle on the websocket and never scans). Matching on process *name*
# alone is ~400x cheaper (~7ms) and is all we need to find the client; the one
# matched process still has its cmdline read lazily in Connection.__init__ to
# pull the port/auth token. Patch the name the connector module resolved.
_UX_PROCESS_NAMES = ("LeagueClientUx.exe", "LeagueClientUx")


def _cheap_ux_process():
    for proc in _process_iter(["name"]):
        if proc.info.get("name") in _UX_PROCESS_NAMES:
            yield proc


_lcu_connector._return_ux_process = _cheap_ux_process

# Gameflow phase -> (activity message, UI level, event kind). Drives the
# general activity feed (desktop + phone) so users see match progress even with
# auto pick/ban off. ReadyCheck is intentionally omitted, the queue-pop event
# from ready_check_changed already covers it (and alarms the phone).
PHASE_EVENTS = {
    "Lobby": ("In lobby", "info", "lobby"),
    "Matchmaking": ("Searching for a match…", "info", "searching"),
    "ChampSelect": ("Champ select started", "info", "champ_select"),
    "InProgress": ("Game started, good luck!", "success", "game_start"),
    "EndOfGame": ("Game over", "info", "game_end"),
}


class LCU:
    def __init__(self, config):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.connector = Connector(loop=self.loop)
        self.config = config
        self.accepting_match = False
        self.paused = False
        self.connected = False
        self.gameflow_phase = None
        # Live connection handle, kept so the web UI can make on-demand requests
        # (summoner info, quick-queue, etc.) outside the event handlers.
        self._connection = None
        self.champ_select = ChampSelect(self)

        # Register event handlers
        self.connector.ready(self.connect)
        self.connector.close(self.disconnect)
        self.connector.ws.register('/lol-matchmaking/v1/ready-check', event_types=('UPDATE',))(self.ready_check_changed)
        self.connector.ws.register('/lol-champ-select/v1/session', event_types=('CREATE', 'UPDATE'))(self.champ_select_changed)
        self.connector.ws.register('/lol-gameflow/v1/gameflow-phase', event_types=('CREATE', 'UPDATE'))(self.gameflow_phase_changed)

    async def connect(self, connection):
        config.console.print("[success]✅ League Client Connected![/]")
        events.push("League client connected", "success")
        self.connected = True
        self._connection = connection

        # Preload champion data so auto pick/ban (and the live champ-select view,
        # trades, bench, skins) can resolve names -> IDs without a first-poll stall.
        if self.champ_select._any_automation(self.config.get("champ_select", {}) or {}):
            await self.champ_select.load_champion_data(connection)
        webhook_status = 'Configured' if self.config.get("webhook_url") else 'Disabled'
        user_id_status = self.config.get("user_id", "None")
        
        config.console.print(Panel(
            f"[bold]Monitoring Queue...[/]\n"
            f"Webhook: [dim]{webhook_status}[/]\n"
            f"User ID: [dim]{user_id_status}[/]",
            title="Status", border_style="green"
        ))

    def _alert_on(self, key):
        """Is this alert event enabled? Queue pop defaults on (it's the whole
        product); the rest default off. Missing block = pre-matrix config."""
        ev = self.config.get("alert_events") or {}
        return bool(ev.get(key, key == "queue_pop"))

    async def _alert(self, key, title, body, what):
        """Fan an event out to the desktop + Discord channels that are both
        enabled and subscribed to it. (The phone companion alarms off the
        events feed on queue pops only — by design; an alarm per gameflow
        transition would be obnoxious.)"""
        if not self._alert_on(key):
            return
        if self.config.get("desktop_notifications"):
            send_desktop_event(title, body, what=what)
        if self.config.get("discord_enabled", True):
            await send_discord_event(
                self.config.get("webhook_url"), self.config.get("user_id"),
                title=title, description=body, what=what,
            )

    async def disconnect(self, connection):
        config.console.print("[warning]⚠️  League Client Disconnected. Waiting...[/]")
        events.push("League client disconnected", "warning")
        self.connected = False
        self._connection = None
        self.gameflow_phase = None
        await self._alert("disconnect", "🔌 Client disconnected",
                          "The League client closed or lost its connection.",
                          what="Client disconnected")

    def call(self, coro_factory, timeout=5.0):
        """Run a one-off async LCU request from another thread (e.g. the web UI
        bridge, which is synchronous). `coro_factory` is an async callable that
        takes the live connection and returns a JSON-serialisable result.

        Returns None if the client isn't connected, or the request fails/times
        out, callers treat None as "no data / not available".
        """
        conn = self._connection
        if not self.connected or conn is None or not self.loop.is_running():
            return None
        try:
            fut = asyncio.run_coroutine_threadsafe(coro_factory(conn), self.loop)
            return fut.result(timeout)
        except Exception as e:
            config.console.log(f"[warning]LCU call failed: {e}[/]")
            return None

    async def get_queue_info(self, connection):
        """
        Retrieves the queue name and ID from the current lobby.
        Returns a tuple of (queue_name, queue_id).
        """
        try:
            lobby = await connection.request('get', '/lol-lobby/v2/lobby')
            if lobby.status == 200:
                data = await lobby.json()
                queue_id = data.get('gameConfig', {}).get('queueId')
                queue_name = await self._resolve_queue_name(connection, queue_id)
                return queue_name, queue_id
        except Exception as e:
            config.console.log(f"[danger]Could not retrieve queue info: {e}[/]")
        return "Unknown Mode", None

    async def _resolve_queue_name(self, connection, queue_id):
        """Human name for a queue id. Static map first (nice short names), then
        the client's live queue list so rotating modes (e.g. ARAM Mayhem)
        resolve without being hardcoded."""
        if queue_id is None:
            return "Unknown Mode"
        name = config.QUEUE_ID_MAP.get(queue_id)
        if name:
            return name
        try:
            r = await connection.request('get', f'/lol-game-queues/v1/queues/{queue_id}')
            if r.status == 200:
                q = await r.json()
                live = (q.get('name') or q.get('shortName') or '').strip()
                if live:
                    return live
        except Exception as e:
            config.console.log(f"[warning]Queue name lookup failed: {e}[/]")
        return f"Unknown (ID: {queue_id})"

    async def ready_check_changed(self, connection, event):
        if self.paused:
            return

        data = event.data
        
        if data['state'] != 'InProgress':
            self.accepting_match = False
            return

        if data['state'] == 'InProgress' and data['playerResponse'] == 'None':
            if self.accepting_match:
                return
            self.accepting_match = True
            
            game_mode, queue_id = await self.get_queue_info(connection)
            
            # --- Selective Accept Logic ---
            allowed_queues = self.config.get("allowed_queue_ids", [])
            if allowed_queues and queue_id not in allowed_queues:
                config.console.log(f"[yellow]Skipping queue '{game_mode}' as it's not in your allowed list.[/]")
                events.push(f"Skipped queue '{game_mode}' (not in allowed list)", "warning", kind="match")
                self.accepting_match = False # Reset for the next real pop
                return
            
            config.console.print(Panel(
                f"[bold white]Mode: {game_mode}[/]\n[dim]Accepting match...[/]",
                title="⚡ QUEUE POPPED ⚡",
                style="danger",
                padding=(1, 2)
            ))
            events.push(f"Queue popped: {game_mode}, accepting…", "danger", kind="queue_pop")
            
            # --- Actions ---
            # 1+2. Desktop notification + Discord ping (both behind their
            # channel toggles AND the queue-pop alert event, which defaults on;
            # missing discord_enabled means a pre-toggle config — webhook set
            # used to mean "on", and an empty one no-ops anyway).
            if self._alert_on("queue_pop"):
                if self.config.get("desktop_notifications"):
                    send_desktop_notification(game_mode)
                if self.config.get("discord_enabled", True):
                    await send_discord_ping(
                        webhook_url=self.config.get("webhook_url"),
                        user_id=self.config.get("user_id"),
                        game_mode=game_mode
                    )

            # 3. Optional grace window before accepting (alerts already fired,
            # so the wait is reaction time). Re-check the ready check after the
            # sleep — a teammate may have declined, or the user answered by
            # hand — and accept nothing if it's no longer live.
            try:
                delay = min(10.0, max(0.0, float(
                    self.config.get("accept_delay_seconds") or 0)))
            except (TypeError, ValueError):
                delay = 0.0
            if delay:
                events.push(f"Accepting in {delay:.0f}s…", "info", kind="match")
                await asyncio.sleep(delay)
                try:
                    rc = await connection.request(
                        'get', '/lol-matchmaking/v1/ready-check')
                    rc_data = await rc.json() if rc.status == 200 else {}
                except Exception:
                    rc_data = {}
                if (rc_data.get('state') != 'InProgress'
                        or rc_data.get('playerResponse') != 'None'):
                    config.console.log("[yellow]Ready check ended during the "
                                       "accept delay; standing down.[/]")
                    events.push("Ready check ended during the wait — not accepted",
                                "warning", kind="match")
                    self.accepting_match = False
                    return

            # 4. Accept Match
            await connection.request('post', '/lol-matchmaking/v1/ready-check/accept')
            config.console.print("[success]✅ Match Accepted![/]")
            events.push(f"Match accepted ({game_mode})", "success", kind="match")
            stats.inc("ready_checks")

    async def champ_select_changed(self, connection, event):
        """Delegates champ select updates to the auto pick/ban handler."""
        if self.paused:
            return
        self.champ_select.on_session_event(connection)

    async def gameflow_phase_changed(self, connection, event):
        """Push a general activity event on each gameflow phase transition, so
        the feed (and phone) reflect match progress regardless of auto pick/ban.
        Fires independently of `paused`, it's informational only."""
        phase = event.data
        if not isinstance(phase, str) or phase == self.gameflow_phase:
            return
        self.gameflow_phase = phase
        info = PHASE_EVENTS.get(phase)
        if info:
            message, level, kind = info
            config.console.log(f"[dim]Gameflow → {phase}[/]")
            events.push(message, level, kind=kind)
        if phase == 'ChampSelect':
            stats.inc("champ_selects")
            await self._alert("champ_select", "⚔️ Champ select started",
                              "Your match is forming — champ select has begun.",
                              what="Champ select")
        elif phase == 'InProgress':
            stats.inc("games")
            await self._alert("game_start", "🎮 Game starting",
                              "The loading screen is up — your game is starting.",
                              what="Game start")

    def start(self):
        """Starts the LCU connector. This is a blocking call."""
        config.console.print("[info]Searching for League Client...[/]")
        self.connector.start()

    def stop(self):
        """Safely stops the LCU connector from another thread."""
        config.console.print("[warning]Stopping LCU connector...[/]")
        if self.loop.is_running():
            # Schedule the stop on the LCU's own event loop
            self.loop.call_soon_threadsafe(self.connector.stop)
            # Give it a moment to process the stop command
            self.loop.call_soon_threadsafe(self.loop.stop)
