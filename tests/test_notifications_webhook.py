"""Run: py tests/test_notifications_webhook.py"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config
import events
import notifications

config.init_console()


class _Resp:
    status = 404

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass


class _Session(_Resp):
    def post(self, *a, **kw):
        return _Resp()


marked = []
notifications._mark = lambda *a: marked.append(a)
notifications.aiohttp.ClientSession = _Session

before = events.latest_id()
asyncio.run(notifications.send_discord_event("https://x/hook", "", "t", "d"))

assert not marked, "_mark must not run on a 404"
new = events.get_since(before)
assert len(new) == 1 and new[0]["level"] == "warning" and "404" in new[0]["message"], new
assert "404" in notifications.last_sent["discord"]["error"]
print("ok")
