"""
LAN phone companion server.

Serves a tiny, read-only web page on the local network so your phone can act as
a queue-pop alarm without installing anything — you just open the page in the
phone's browser (scan a QR from Settings) and keep the tab open.

Design notes:
  * Runs on its own daemon thread with its own asyncio loop, fully independent of
    the LCU connector loop in `lcu.py`.
  * Strictly read-only: it exposes the in-memory event feed and a tiny status
    blob. It never mutates config or issues LCU actions, which is what makes it
    safe to bind on 0.0.0.0 (reachable from other devices on the Wi-Fi).
  * The phone page polls /api/feed and alarms when it sees an event tagged
    kind == "queue_pop" (see events.push / lcu.ready_check_changed).
"""

import asyncio
import base64
import io
import json
import os
import socket
import sys
import threading

from aiohttp import web

import config
import events

DEFAULT_PORT = 8420

# Module-level handle so web_api.get_companion_info() can report status and
# main.py can avoid starting twice.
_thread = None
_runner = None
_loop = None
_running = False
_bound_port = None
# Count of phones currently holding an SSE stream open. Mutated only on the
# companion loop thread; read (atomically) from the main thread for the UI.
_clients = 0


def client_count():
    return _clients


def webui_dir():
    """Absolute path to the bundled web UI directory (dev and frozen builds)."""
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS  # PyInstaller extraction dir
    else:
        base = os.path.dirname(os.path.abspath(__file__))  # src/
    return os.path.join(base, "webui")


def get_lan_ip():
    """
    Best-effort LAN IP of this machine. Opens a UDP socket toward a public
    address and reads back the local endpoint the OS would route through — no
    packets are actually sent. Falls back to 127.0.0.1.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def qr_data_uri(text):
    """Return a PNG data URI of a QR code for `text`, or "" if qrcode/PIL is
    unavailable (the UI then just shows the URL)."""
    try:
        import qrcode
        img = qrcode.make(text)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


def is_running():
    return _running


def bound_port():
    return _bound_port


def _make_app(lcu=None):
    web_root = webui_dir()

    async def index(_request):
        return web.FileResponse(os.path.join(web_root, "companion.html"))

    async def feed(request):
        try:
            after = int(request.query.get("after", 0))
        except (TypeError, ValueError):
            after = 0
        return web.json_response({
            "latest": events.latest_id(),
            "events": events.get_since(after),
        })

    def _companion_cfg():
        return ((getattr(lcu, "config", {}) or {}).get("companion", {}) or {}) if lcu else {}

    async def status(_request):
        comp = _companion_cfg()
        return web.json_response({
            "connected": bool(getattr(lcu, "connected", False)) if lcu else False,
            "paused": bool(getattr(lcu, "paused", False)) if lcu else False,
            "sound": comp.get("sound", "chime"),
        })

    async def sound(_request):
        """Serve the user's custom alarm file (only when sound == 'custom')."""
        comp = _companion_cfg()
        path = comp.get("sound_file") or ""
        if comp.get("sound") == "custom" and path and os.path.isfile(path):
            return web.FileResponse(path)
        return web.Response(status=404)

    async def stream(request):
        """Server-Sent Events: pushes activity to the phone in real time and
        lets us count connected devices. Each message carries the event id so
        EventSource auto-reconnect resumes via the Last-Event-ID header."""
        global _clients
        resp = web.StreamResponse(headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        })
        try:
            await resp.prepare(request)
        except Exception:
            return resp

        _clients += 1
        try:
            last = request.headers.get("Last-Event-ID")
            try:
                after = int(last) if last is not None else int(request.query.get("after", 0))
            except (TypeError, ValueError):
                after = 0

            # Replay the backlog, then a 'synced' marker so the phone knows the
            # historical events are done and shouldn't trigger the alarm.
            for e in events.get_since(after):
                await _write_event(resp, e)
                after = e["id"]
            await resp.write(b"event: synced\ndata: {}\n\n")

            beats = 0
            while True:
                new = events.get_since(after)
                for e in new:
                    await _write_event(resp, e)
                    after = e["id"]
                beats += 1
                # Heartbeat (~every 15s of idle) so a dead client surfaces as a
                # write error and the count drops.
                if not new and beats % 15 == 0:
                    await resp.write(b": ping\n\n")
                await asyncio.sleep(1.0)
        except (asyncio.CancelledError, ConnectionResetError, RuntimeError, OSError):
            pass
        except Exception:
            pass
        finally:
            _clients = max(0, _clients - 1)
        return resp

    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/api/feed", feed)
    app.router.add_get("/api/status", status)
    app.router.add_get("/api/sound", sound)
    app.router.add_get("/api/stream", stream)
    # Static assets (companion.js, manifest.json, fonts, …).
    # Registered last so it doesn't shadow the routes above.
    app.router.add_static("/", web_root, show_index=False)
    return app


async def _write_event(resp, e):
    payload = json.dumps(e, ensure_ascii=False)
    await resp.write(f"id: {e['id']}\nevent: log\ndata: {payload}\n\n".encode("utf-8"))


def _serve(port, lcu):
    global _runner, _loop, _running, _bound_port, _clients

    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)

    app = _make_app(lcu)
    _runner = web.AppRunner(app)
    _loop.run_until_complete(_runner.setup())
    site = web.TCPSite(_runner, "0.0.0.0", port)

    try:
        _loop.run_until_complete(site.start())
    except OSError as e:
        _running = False
        if config.console:
            config.console.log(f"[yellow]Companion server failed to bind :{port} — {e}[/]")
        events.push(f"Phone companion couldn't start on port {port}", "warning")
        return

    _running = True
    _bound_port = port
    ip = get_lan_ip()
    if config.console:
        config.console.log(f"[cyan]Phone companion running at http://{ip}:{port}[/]")
    events.push(f"Phone companion ready at http://{ip}:{port}", "success")

    try:
        _loop.run_forever()
    finally:
        _loop.run_until_complete(_runner.cleanup())
        _loop.close()
        _running = False
        _clients = 0


def start(settings):
    """
    Launch the companion server in a daemon thread if it isn't already running.
    `settings` is the loaded config dict; the port comes from
    settings["companion"]["port"]. Returns True if a server thread was started.
    """
    global _thread
    if _running or (_thread and _thread.is_alive()):
        return False

    companion_cfg = (settings or {}).get("companion", {}) or {}
    try:
        port = int(companion_cfg.get("port", DEFAULT_PORT))
    except (TypeError, ValueError):
        port = DEFAULT_PORT

    # The LCU connector is handy for the status endpoint, but optional.
    lcu = getattr(start, "_lcu", None)

    _thread = threading.Thread(target=_serve, args=(port, lcu), daemon=True)
    _thread.start()
    return True


def attach_lcu(lcu):
    """Give the companion access to the live LCU connector (for /api/status).
    Call before start()."""
    start._lcu = lcu


def stop():
    """Ask the server loop to stop. Best-effort; the thread is a daemon anyway."""
    global _running
    if _loop and _loop.is_running():
        _loop.call_soon_threadsafe(_loop.stop)
    _running = False
