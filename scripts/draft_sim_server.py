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


# ---- /rules — human-readable master rule sheet (for review & fact-checking) --

def _subject_text(spec):
    """Subject spec (candidate / lane_opponent / lane_partner) in plain English."""
    if not spec:
        return "anyone"
    parts = []
    if spec.get("all"):
        parts.append("has " + " + ".join(spec["all"]))
    if spec.get("any"):
        parts.append("any of " + " / ".join(spec["any"]))
    if spec.get("none"):
        parts.append("without " + ", ".join(spec["none"]))
    return "; ".join(parts)


def _count_pred_text(s):
    if "any_of" in s:
        return " OR ".join(f"({_count_pred_text(x)})" for x in s["any_of"])
    bits = []
    if "flag" in s:
        bits.append(s["flag"])
    if "flags" in s:
        bits.append(" + ".join(s["flags"]))
    if "any_flags" in s:
        bits.append("any of " + " / ".join(s["any_flags"]))
    return " AND ".join(bits)


def _team_text(conds, side):
    specs = conds if isinstance(conds, list) else [conds]
    out = []
    for s in specs:
        pred = _count_pred_text(s)
        lo, hi = s.get("min"), s.get("max")
        if hi == 0:
            out.append(f"no {side} with {pred}")
        elif lo is not None and hi is not None:
            out.append(f"{lo}–{hi} {side} with {pred}")
        elif lo is not None:
            out.append(f"{lo}+ {side} with {pred}")
        elif hi is not None:
            out.append(f"at most {hi} {side} with {pred}")
        else:
            out.append(f"{side} with {pred}")
    return " and ".join(out)


def rules_sheet_html():
    names = sorted(n for n, e in ce.CHAMPS.items()
                   if not n.startswith("_") and isinstance(e, dict))
    scope_order = ["lane", "matchup", "duo", "scaling", "comp", "team_need", "warning"]
    scope_label = {"lane": "Lane matchup (vs YOUR lane opponent)",
                   "matchup": "Matchup (vs the enemy draft)",
                   "duo": "Bot-lane duo synergy",
                   "scaling": "Scaling & tempo",
                   "comp": "Team composition",
                   "team_need": "Team needs (what your team is missing)",
                   "warning": "Warnings (score penalties)"}
    groups = {}
    for r in ce.RULES:
        groups.setdefault(r["scope"], []).append(r)

    import re as _re

    def _clean_reason(s):
        # reason templates hold draft placeholders — strip "({token})" asides entirely,
        # then render any bare inline token generically
        return _re.sub(r"\{[^}]+\}", "them", _re.sub(r"\s*\(\{[^}]+\}\)", "", s))

    def rule_block(r):
        cands = [n for n in names if ce.rule_candidate_ok(r, n)]
        when = []
        if "lane_opponent" in r:
            when.append("your lane opponent " + _subject_text(r["lane_opponent"]))
        if "lane_partner" in r:
            when.append("your bot-lane partner " + _subject_text(r["lane_partner"]))
        if "enemy_team" in r:
            when.append(_team_text(r["enemy_team"], "enemies"))
        if "my_team" in r:
            when.append(_team_text(r["my_team"], "allies"))
        w = r["weight"]
        scaling = ""
        if w > 0 and "enemy_team" in r and not r.get("no_scale"):
            scaling = f" · scales with count (full at {r.get('scale_at', 3)})"
        boost = f" · boost +1 each: {', '.join(r['boost'])}" if r.get("boost") else ""
        champs_html = ", ".join(cands) if cands else "—"
        return f"""
<details class="rule"><summary><span class="w {'neg' if w < 0 else 'pos'}">{w:+d}</span>
 <b>{r['id']}</b> — {_clean_reason(r['reason'])}</summary>
 <div class="det">
  <p><b>Fires when:</b> {'; '.join(when) if when else 'always (candidate check only)'}{scaling}{boost}</p>
  <p><b>Candidate must:</b> {_subject_text(r.get('candidate'))}</p>
  <p><b>Champions that can earn this ({len(cands)}):</b> <span class="champs">{champs_html}</span></p>
 </div></details>"""

    sections = ""
    for sc in scope_order:
        rs = sorted(groups.get(sc, []), key=lambda r: -abs(r["weight"]))
        if not rs:
            continue
        sections += f"<h2>{scope_label.get(sc, sc)} <span class='cnt'>{len(rs)} rules</span></h2>"
        sections += "".join(rule_block(r) for r in rs)

    flag_champs = {}
    for n in names:
        for f in ce.flags_of(n):
            flag_champs.setdefault(f, []).append(n)
    glossary = "".join(
        f"<details class='rule'><summary><b>{f}</b> <span class='cnt'>{len(cs)} champions</span></summary>"
        f"<div class='det'><span class='champs'>{', '.join(cs)}</span></div></details>"
        for f, cs in sorted(flag_champs.items()))

    version = ce.CHAMPS.get("_meta", {}).get("ddragon_version", "?")
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>queuePop · Rule Sheet</title>
<style>
 :root{{--gold:#C8AA6E;--gold2:#F0E6D2;--teal:#0AC8B9;--bg:#010A13;--text:#D9C8A0;--line:#3c3221;--muted:#7c705a}}
 *{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Georgia,serif;padding:0 0 60px}}
 header{{padding:16px 22px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}}
 h1{{margin:0;font-size:22px;color:var(--gold2)}} h1 b{{color:var(--gold)}}
 .wrap{{max-width:980px;margin:0 auto;padding:0 18px}}
 h2{{color:var(--gold);font-size:17px;border-bottom:1px solid var(--line);padding-bottom:6px;margin:34px 0 10px}}
 .cnt{{color:var(--muted);font-size:12px;font-weight:normal}}
 .rule{{border:1px solid var(--line);border-radius:10px;margin:8px 0;background:rgba(200,170,110,.03)}}
 .rule summary{{cursor:pointer;padding:10px 14px;list-style:none}} .rule summary::-webkit-details-marker{{display:none}}
 .rule[open]{{background:rgba(200,170,110,.07)}}
 .det{{padding:2px 16px 12px;border-top:1px solid var(--line);font-size:14px}}
 .w{{display:inline-block;min-width:38px;text-align:center;border-radius:6px;padding:1px 6px;font-weight:bold;margin-right:6px}}
 .w.pos{{background:rgba(10,200,185,.15);color:var(--teal)}} .w.neg{{background:rgba(200,80,80,.18);color:#e88}}
 .champs{{color:var(--muted);font-size:13px}}
 .sub{{color:var(--muted);font-size:13px}}
 a{{color:var(--teal);text-decoration:none}}
 #q{{width:100%;max-width:420px;background:#0a1420;border:1px solid var(--line);border-radius:8px;color:var(--gold2);padding:8px 12px;font:inherit;margin:18px 0 4px}}
</style></head><body>
<header><h1>queue<b>Pop</b> · Rule Sheet</h1>
<span class="sub">every rule + every champion trait the engine believes · Data Dragon {version} · found something wrong? tell us the champ + trait</span>
<a href="/" style="margin-left:auto;border:1px solid var(--line);border-radius:8px;padding:5px 12px">← Draft Sim</a></header>
<div class="wrap">
<input id="q" placeholder="Filter rules & traits… (champion name, flag, keyword)">
<p class="sub">Positive weight = reward, negative = warning. “Scales with count” = reward grows with how many enemies match. Click any rule to see exactly which champions can earn it — that list is the thing to fact-check.</p>
{sections}
<h2>Trait glossary — which champions the engine believes have each trait <span class="cnt">{len(flag_champs)} traits</span></h2>
{glossary}
</div>
<script>
 const q=document.getElementById('q');
 q.addEventListener('input',()=>{{const s=q.value.toLowerCase();
   document.querySelectorAll('details.rule').forEach(d=>{{
     d.style.display=!s||d.textContent.toLowerCase().includes(s)?'':'none';
     if(s&&d.style.display==='')d.open=true; if(!s)d.open=false;}});}});
</script></body></html>"""


RULES_HTML = rules_sheet_html()


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
        elif self.path in ("/rules", "/rules/"):
            self._send(200, RULES_HTML, "text/html; charset=utf-8")
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
