import time
import asyncio
import aiohttp
from plyer import notification
import config
from config import resource_path

# Hextech gold, as a decimal int for Discord embed `color`.
_EMBED_GOLD = 0xC8AA6E

# channel -> {"ts": epoch seconds, "what": short label}; the Alerts page shows
# a "last sent" line per channel from this (via get_status).
last_sent = {}


def _mark(channel, what):
    last_sent[channel] = {"ts": time.time(), "what": what}


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
        config.console.log(f"[yellow]Failed to send desktop notification: {e}[/]")
        return False


def send_desktop_notification(game_mode):
    """The queue-pop desktop notification."""
    send_desktop_event("Queue Popped!", f"Accepting match for {game_mode}.",
                       what="Queue pop")


def _discord_payload(user_id, title, description, fields=None):
    """Build a Discord webhook payload: an @mention in `content` (so the push
    actually fires on the user's phone) plus a tidy embed for the visuals."""
    embed = {
        "title": title,
        "description": description,
        "color": _EMBED_GOLD,
        "footer": {"text": "queuePop • auto-accepting"},
    }
    if fields:
        embed["fields"] = fields
    return {
        "content": f"<@{user_id}>" if user_id else "",
        "embeds": [embed],
    }


async def send_discord_event(webhook_url, user_id, title, description,
                             fields=None, what="alert"):
    """Post an event embed to the webhook (no-op without a URL)."""
    if not webhook_url:
        return
    payload = _discord_payload(user_id, title=title, description=description,
                               fields=fields)
    async with aiohttp.ClientSession() as session:
        try:
            await session.post(webhook_url, json=payload)
            _mark("discord", what)
            config.console.log("[cyan]Discord notification sent.[/]")
        except Exception as e:
            config.console.log(f"[yellow]Failed to send Discord ping: {e}[/]")


async def send_discord_ping(webhook_url, user_id, game_mode):
    """The queue-pop Discord notification."""
    await send_discord_event(
        webhook_url, user_id,
        title="⚡ Queue Popped",
        description="Accepting your match automatically, get back to your PC!",
        fields=[{"name": "Mode", "value": game_mode or "Unknown", "inline": True}],
        what="Queue pop",
    )


async def _post_discord_test(webhook_url, user_id):
    payload = _discord_payload(
        user_id,
        title="✅ queuePop test",
        description="Your Discord webhook is working. You'll get a ping like this "
                    "when your queue pops.",
    )
    async with aiohttp.ClientSession() as session:
        async with session.post(webhook_url, json=payload) as resp:
            # Discord returns 204 No Content on a successful webhook post.
            if resp.status >= 400:
                body = await resp.text()
                raise RuntimeError(f"Discord returned {resp.status}: {body[:200]}")


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
