import sys
import os
import asyncio
import aiohttp
from plyer import notification
import config

# Hextech gold, as a decimal int for Discord embed `color`.
_EMBED_GOLD = 0xC8AA6E


def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)


def send_desktop_notification(game_mode):
    """
    Sends a native desktop notification.
    """
    try:
        icon_path = resource_path("assets/gnome-thresh.ico")
        notification.notify(
            title="Queue Popped!",
            message=f"Accepting match for {game_mode}.",
            app_name="queueBot",
            app_icon=icon_path,
            timeout=10  # Notification will disappear after 10 seconds
        )
        config.console.log("[cyan]Desktop notification sent.[/]")
    except Exception as e:
        config.console.log(f"[yellow]Failed to send desktop notification: {e}[/]")


def _discord_payload(user_id, title, description, fields=None):
    """Build a Discord webhook payload: an @mention in `content` (so the push
    actually fires on the user's phone) plus a tidy embed for the visuals."""
    embed = {
        "title": title,
        "description": description,
        "color": _EMBED_GOLD,
        "footer": {"text": "queueBot • auto-accepting"},
    }
    if fields:
        embed["fields"] = fields
    return {
        "content": f"<@{user_id}>" if user_id else "",
        "embeds": [embed],
    }


async def send_discord_ping(webhook_url, user_id, game_mode):
    """
    Sends a queue-pop notification to the configured Discord webhook.
    """
    if not webhook_url:
        return

    payload = _discord_payload(
        user_id,
        title="⚡ Queue Popped",
        description="Accepting your match automatically — get back to your PC!",
        fields=[{"name": "Mode", "value": game_mode or "Unknown", "inline": True}],
    )

    async with aiohttp.ClientSession() as session:
        try:
            await session.post(webhook_url, json=payload)
            config.console.log("[cyan]Discord notification sent.[/]")
        except Exception as e:
            config.console.log(f"[yellow]Failed to send Discord ping: {e}[/]")


async def _post_discord_test(webhook_url, user_id):
    payload = _discord_payload(
        user_id,
        title="✅ queueBot test",
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
    Safe to call from the pywebview/main thread — runs its own event loop.
    """
    if not webhook_url:
        return False, "No webhook URL configured."
    try:
        asyncio.run(_post_discord_test(webhook_url, user_id))
        config.console.log("[cyan]Discord test message sent.[/]")
        return True, None
    except Exception as e:
        config.console.log(f"[yellow]Discord test failed: {e}[/]")
        return False, str(e)
