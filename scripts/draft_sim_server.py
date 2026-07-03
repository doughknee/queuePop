"""Draft Sim server — a web UI to test the counter engine interactively.

Serves draft_sim.html and a tiny JSON API that runs the REAL engine
(scripts/counter_engine.py), so the sim and the production engine never drift.

Launch via the preview tooling (.claude/launch.json -> "draft-sim"), or directly:

    py scripts/draft_sim_server.py        # http://127.0.0.1:8765

Deployment (Coolify/Docker): HOST and PORT come from the environment —
the Dockerfile sets HOST=0.0.0.0 so the container is reachable; local runs
keep the loopback default. GET /healthz answers 200 for health checks.
"""

import json
import os
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import counter_engine as ce  # noqa: E402

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
HTML = (HERE / "draft_sim.html").read_text(encoding="utf-8")


def champions_payload():
    champs = []
    for name, entry in ce.CHAMPS.items():
        if name.startswith("_") or not isinstance(entry, dict):
            continue
        champs.append({"name": name, "id": entry.get("id"),
                       "roles": entry.get("roles", []), "flags": entry.get("flags", [])})
    champs.sort(key=lambda c: c["name"])
    rules = [{"id": r["id"], "scope": r["scope"], "weight": r["weight"], "reason": r["reason"]}
             for r in ce.RULES]
    version = ce.CHAMPS.get("_meta", {}).get("ddragon_version")
    return {"champions": champs, "rules": rules, "count": len(champs), "version": version}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, HTML, "text/html; charset=utf-8")
        elif self.path == "/healthz":
            self._send(200, b"ok", "text/plain")
        elif self.path == "/api/champions":
            self._send(200, json.dumps(champions_payload()))
        elif self.path.startswith("/fonts/") and self.path.endswith(".ttf"):
            fp = HERE.parent / "brand" / "fonts" / Path(self.path).name
            if fp.exists():
                self._send(200, fp.read_bytes(), "font/ttf")
            else:
                self._send(404, b"font not found", "text/plain")
        else:
            self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        if self.path not in ("/api/evaluate", "/api/bans"):
            self._send(404, json.dumps({"error": "not found"}))
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            scn = json.loads(self.rfile.read(length) or b"{}")
            scn.setdefault("my_team", [])
            scn.setdefault("enemy_team", [])
            scn.setdefault("pool", [])
            scn.setdefault("my_role", "middle")
            if self.path == "/api/bans":
                self._send(200, json.dumps({
                    "bans": ce.suggest_bans(scn["my_role"], scn["pool"]),
                }))
                return
            results, lane_opp = ce.evaluate_scenario(scn)
            self._send(200, json.dumps({
                "results": results,
                "lane_opponent": lane_opp,
                "confidence": ce.confidence(results),
                "analysis": ce.analyze_draft(scn),
            }))
        except Exception as exc:
            self._send(400, json.dumps({"error": str(exc)}))

    def log_message(self, *args):
        pass  # keep the console quiet


def main():
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Draft Sim running on http://{HOST}:{PORT}  ({champions_payload()['count']} champions)",
          flush=True)  # flush so container logs show startup immediately
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
