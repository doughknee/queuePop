import time
import asyncio
import aiohttp
from plyer import notification
import config
import events
from config import resource_path

# Hextech gold, as a decimal int for Discord embed `color`.
_EMBED_GOLD = 0xC8AA6E

# channel -> {"ts": epoch seconds, "what": short label}; the Alerts page shows
# a "last sent" line per channel from this (via get_status).
last_sent = {}


def _mark(channel, what):
    last_sent[channel] = {"ts": time.time(), "what": what}


def _fail(channel, what, err):
    """A real alert failed: surface it on the Alerts page (`last_sent` gets an
    `error`), in the activity feed, and in the console."""
    last_sent[channel] = {"ts": time.time(), "what": what, "error": str(err)}
    events.push(f"{channel.capitalize()} alert failed: {err}", "warning")
    config.console.log(f"[yellow]{channel.capitalize()} alert failed: {err}[/]")


def send_desktop_event(title, message, what="alert"):
    """Send a native desktop notification. Returns True when it went out."""
    try:
        icon_path = resource_path("assets/queuepop.ico")
        notification.notify(
            title=title,
            message=message,
            app_name="queuePop",
            app_icon=icon_path,
            timeout=10  # Notification will disappear after 10 seconds
        )
        _mark("desktop", what)
        config.console.log("[cyan]Desktop notification sent.[/]")
        return True
    except Exception as e:
        _fail("desktop", what, e)
        return False


def send_desktop_notification(game_mode):
    """The queue-pop desktop notification."""
    send_desktop_event("Queue Popped!", f"Accepting match for {game_mode}.",
                       what="Queue pop")


# kind -> (embed title, colour). `what` labels in last_sent stay separate.
_KINDS = {
    "queue_pop": ("⚡ Queue Popped", _EMBED_GOLD),
    "champ_select": ("⚔️ Champ select started", 0x3498DB),
    "locked_pick": ("🔒 Pick locked", 0x2ECC71),
    "game_start": ("🎮 Game starting", 0x9B59B6),
    "game_end": ("🏁 Game over", 0x95A5A6),
    "disconnect": ("🔌 Client disconnected", 0xE74C3C),
    "test": ("✅ queuePop test", _EMBED_GOLD),
}

DDRAGON = "https://ddragon.leagueoflegends.com"
# Filled lazily by _load_ddragon: Data Dragon wants the champion's alias
# ("MonkeyKing" for Wukong), not its display name, plus the current version.
_ddragon = {"version": None, "by_id": {}, "by_name": {}}


async def _load_ddragon(session):
    """Fetch Data Dragon's version + champion list once. A failure only means
    no thumbnail; the alert still goes out."""
    if _ddragon["version"]:
        return
    try:
        t = aiohttp.ClientTimeout(total=8)
        async with session.get(f"{DDRAGON}/api/versions.json", timeout=t) as r:
            version = (await r.json())[0]
        async with session.get(
                f"{DDRAGON}/cdn/{version}/data/en_US/champion.json", timeout=t) as r:
            data = list((await r.json())["data"].values())
        _ddragon["by_id"] = {int(c["key"]): c["id"] for c in data}
        _ddragon["by_name"] = {c["name"].lower(): c["id"] for c in data}
        _ddragon["version"] = version
    except Exception as e:
        config.console.log(f"[yellow]Data Dragon lookup failed: {e}[/]")


def build_discord_payload(kind, text, *, queue=None, champion=None,
                          champion_id=None, mention=None):
    """Webhook JSON: the @mention alone in `content` (so the push fires on the
    phone) plus one embed. An unknown kind falls back to plain text."""
    content = f"<@{mention}>" if mention else ""
    if kind not in _KINDS:
        return {"content": f"{content} {text}".strip()}
    title, color = _KINDS[kind]
    embed = {"title": title, "description": text, "color": color,
             "footer": {"text": "queuePop • auto-accepting"}}
    fields = []
    if queue:
        fields.append({"name": "Queue", "value": queue, "inline": True})
    if champion:
        fields.append({"name": "Champion", "value": champion, "inline": True})
    if fields:
        embed["fields"] = fields
    alias = (_ddragon["by_id"].get(champion_id)
             or _ddragon["by_name"].get((champion or "").lower()))
    if alias:
        embed["thumbnail"] = {
            "url": f"{DDRAGON}/cdn/{_ddragon['version']}/img/champion/{alias}.png"}
    return {"content": content, "embeds": [embed]}


async def _post(session, webhook_url, kind, text, mention, queue=None,
                champion=None, champion_id=None, verbose=False):
    if champion or champion_id:
        await _load_ddragon(session)
    payload = build_discord_payload(kind, text, queue=queue, champion=champion,
                                    champion_id=champion_id, mention=mention)
    async with session.post(webhook_url, json=payload) as resp:
        # Discord returns 204 No Content on a successful webhook post.
        if not 200 <= resp.status < 300:
            body = (await resp.text())[:200] if verbose else ""
            raise RuntimeError(f"Discord returned {resp.status}: {body}".rstrip(": "))


async def send_discord_event(webhook_url, user_id, kind, text, *, queue=None,
                             champion=None, champion_id=None, what="alert"):
    """Post an event embed to the webhook (no-op without a URL)."""
    if not webhook_url:
        return
    async with aiohttp.ClientSession() as session:
        try:
            await _post(session, webhook_url, kind, text, user_id, queue,
                        champion, champion_id)
            _mark("discord", what)
            config.console.log("[cyan]Discord notification sent.[/]")
        except Exception as e:
            _fail("discord", what, e)


async def send_discord_ping(webhook_url, user_id, game_mode):
    """The queue-pop Discord notification."""
    await send_discord_event(
        webhook_url, user_id, "queue_pop",
        "Accepting your match automatically, get back to your PC!",
        queue=game_mode or "Unknown", what="Queue pop",
    )


async def _post_discord_test(webhook_url, user_id):
    async with aiohttp.ClientSession() as session:
        await _post(session, webhook_url, "test",
                    "Your Discord webhook is working. You'll get a ping like "
                    "this when your queue pops.", user_id, verbose=True)


def send_discord_test(webhook_url, user_id):
    """
    Synchronously send a test message to the webhook. Returns (ok, error).
    Safe to call from the pywebview/main thread, runs its own event loop.
    """
    if not webhook_url:
        return False, "No webhook URL configured."
    try:
        asyncio.run(_post_discord_test(webhook_url, user_id))
        _mark("discord", "Test message")
        config.console.log("[cyan]Discord test message sent.[/]")
        return True, None
    except Exception as e:
        config.console.log(f"[yellow]Discord test failed: {e}[/]")
        return False, str(e)
