import asyncio
from lcu_driver import Connector
from rich.panel import Panel

import config
import events
from champ_select import ChampSelect
from notifications import send_discord_ping, send_desktop_notification

class LCU:
    def __init__(self, config):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.connector = Connector(loop=self.loop)
        self.config = config
        self.accepting_match = False
        self.paused = False
        self.connected = False
        self.champ_select = ChampSelect(self)

        # Register event handlers
        self.connector.ready(self.connect)
        self.connector.close(self.disconnect)
        self.connector.ws.register('/lol-matchmaking/v1/ready-check', event_types=('UPDATE',))(self.ready_check_changed)
        self.connector.ws.register('/lol-champ-select/v1/session', event_types=('CREATE', 'UPDATE'))(self.champ_select_changed)

    async def connect(self, connection):
        config.console.print("[success]✅ League Client Connected![/]")
        events.push("League client connected", "success")
        self.connected = True

        # Preload champion data so auto pick/ban can resolve names -> IDs.
        if self.config.get("champ_select", {}).get("enabled"):
            await self.champ_select.load_champion_data(connection)
        webhook_status = 'Configured' if self.config.get("webhook_url") else 'Disabled'
        user_id_status = self.config.get("user_id", "None")
        
        config.console.print(Panel(
            f"[bold]Monitoring Queue...[/]\n"
            f"Webhook: [dim]{webhook_status}[/]\n"
            f"User ID: [dim]{user_id_status}[/]",
            title="Status", border_style="green"
        ))

    async def disconnect(self, connection):
        config.console.print("[warning]⚠️  League Client Disconnected. Waiting...[/]")
        events.push("League client disconnected", "warning")
        self.connected = False

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
                queue_name = config.QUEUE_ID_MAP.get(queue_id, f"Unknown (ID: {queue_id})")
                return queue_name, queue_id
        except Exception as e:
            config.console.log(f"[danger]Could not retrieve queue info: {e}[/]")
        return "Unknown Mode", None

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
                events.push(f"Skipped queue '{game_mode}' (not in allowed list)", "warning")
                self.accepting_match = False # Reset for the next real pop
                return
            
            config.console.print(Panel(
                f"[bold white]Mode: {game_mode}[/]\n[dim]Accepting match...[/]",
                title="⚡ QUEUE POPPED ⚡",
                style="danger",
                padding=(1, 2)
            ))
            events.push(f"Queue popped: {game_mode} — accepting…", "danger")
            
            # --- Actions ---
            # 1. Send Desktop Notification
            if self.config.get("desktop_notifications"):
                send_desktop_notification(game_mode)

            # 2. Send Discord Ping
            await send_discord_ping(
                webhook_url=self.config.get("webhook_url"),
                user_id=self.config.get("user_id"),
                game_mode=game_mode
            )
            
            # 3. Accept Match
            await connection.request('post', '/lol-matchmaking/v1/ready-check/accept')
            config.console.print("[success]✅ Match Accepted![/]")
            events.push(f"Match accepted ({game_mode})", "success")

    async def champ_select_changed(self, connection, event):
        """Delegates champ select updates to the auto pick/ban handler."""
        if self.paused:
            return
        self.champ_select.on_session_event(connection)

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
