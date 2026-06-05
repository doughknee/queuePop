"""Convert the raw Swagger HTML dump (lcuapi.txt) into a friendly Markdown
reference: an index plus one file per tag, under docs/lcu/.

Usage:  py tools/lcu_docs_gen.py
"""
from __future__ import annotations

import html as htmllib
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "lcuapi.txt"
OUT = ROOT / "docs" / "lcu"

TAG_RE = re.compile(
    r'<div id="(?P<id>operation--[^"]+)" '
    r'class="swagger--panel-operation-(?P<method>\w+) panel">(?P<body>.*?)'
    r'(?=<span id="path--|<div id="operation--|</div>\s*</div>\s*</div>\s*<script)',
    re.S,
)
SUMMARY_RE = re.compile(r'<div class="operation-summary">(.*?)</div>', re.S)
TITLE_RE = re.compile(
    r'<span class="operation-name">(\w+)</span>\s*<strong>(.*?)</strong>', re.S
)
DESC_RE = re.compile(
    r'<section class="sw-operation-description">(.*?)</section>', re.S
)
TAGS_RE = re.compile(r'<a href="#tag-[^"]*">([^<]+)</a>')
ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.S)
TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
RESP_RE = re.compile(
    r'<dt class="sw-response-(\d+|default)">(.*?)</dt>\s*'
    r'<dd[^>]*>(.*?)</dd>',
    re.S,
)
VERSION_RE = re.compile(r'sw-info-version">([^<]+)<')


def clean(text: str) -> str:
    """Strip tags/entities/whitespace from an HTML fragment to plain text."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmllib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def clean_type(cell: str) -> str:
    """Render a data-type cell (type + format + enum + range) compactly."""
    typ = clean(cell)
    return re.sub(r"\(\s*", "(", typ).replace(" )", ")")


def slug(tag: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", tag.lower()).strip("-") or "misc"


def parse_params(body: str) -> list[dict]:
    sect = re.search(
        r'<section class="sw-request-params">(.*?)</section>', body, re.S
    )
    if not sect:
        return []
    rows = ROW_RE.findall(sect.group(1))
    out, seen = [], set()
    for row in rows:
        cells = TD_RE.findall(row)
        if len(cells) < 4:
            continue
        name = clean(cells[0])
        if not name:
            continue
        param = {
            "name": name,
            "desc": clean(cells[1]),
            "in": clean(cells[2]),
            "type": clean_type(cells[3]),
            "required": "required" in cells[4].lower() if len(cells) > 4 else False,
        }
        key = (param["name"], param["in"])
        if key in seen:  # the export duplicates each param row
            continue
        seen.add(key)
        out.append(param)
    return out


def parse_responses(body: str) -> list[tuple[str, str]]:
    sect = re.search(r'<section class="sw-responses">(.*?)</section>', body, re.S)
    if not sect:
        return []
    out = []
    for code, label, dd in RESP_RE.findall(sect.group(1)):
        out.append((clean(label) or code, clean(dd)))
    return out


def parse() -> tuple[str, dict[str, list[dict]]]:
    raw = SRC.read_text(encoding="utf-8", errors="replace")
    body_start = raw.find('<div class="container">')
    raw = raw[body_start:] if body_start > 0 else raw
    version_m = VERSION_RE.search(raw)
    version = version_m.group(1).strip() if version_m else "unknown"

    by_tag: dict[str, list[dict]] = defaultdict(list)
    for m in TAG_RE.finditer(raw):
        body = m.group("body")
        method = m.group("method").upper()
        title = TITLE_RE.search(body)
        if not title:
            continue
        path = clean(title.group(2))
        summary_m = SUMMARY_RE.search(body)
        desc_m = DESC_RE.search(body)
        # The panel "Tags" are a useless catch-all ("Plugins"); group by the
        # plugin namespace, i.e. the first path segment (/lol-champ-select/...).
        # Single-segment legacy RPC endpoints (/Exit, /Subscribe, ...) all fold
        # into one (builtin) group instead of one file each.
        stripped = path.strip("/")
        first = stripped.split("/")[0]
        if "/" not in stripped:
            ns = "(builtin)"
        elif not first or first.startswith("{"):
            ns = "(root)"
        else:
            ns = first
        op = {
            "method": method,
            "path": path,
            "summary": clean(summary_m.group(1)) if summary_m else "",
            "desc": clean(desc_m.group(1)) if desc_m else "",
            "params": parse_params(body),
            "responses": parse_responses(body),
        }
        by_tag[ns].append(op)
    return version, by_tag


def render_op(op: dict) -> list[str]:
    lines = [f"### `{op['method']} {op['path']}`", ""]
    if op["summary"]:
        lines += [op["summary"], ""]
    if op["desc"] and op["desc"] != op["summary"]:
        lines += [op["desc"], ""]

    if op["params"]:
        lines += [
            "**Parameters**", "",
            "| Name | In | Type | Required | Description |",
            "| --- | --- | --- | --- | --- |",
        ]
        for p in op["params"]:
            req = "yes" if p["required"] else ""
            desc = p["desc"].replace("|", "\\|")
            typ = p["type"].replace("|", "\\|") or "—"
            lines.append(
                f"| `{p['name']}` | {p['in']} | {typ} | {req} | {desc} |"
            )
        lines.append("")

    if op["responses"]:
        lines += ["**Responses**", ""]
        for label, body in op["responses"]:
            text = f"- **{label}**"
            if body:
                text += f" — {body}"
            lines.append(text)
        lines.append("")
    return lines


def main() -> None:
    version, by_tag = parse()
    OUT.mkdir(parents=True, exist_ok=True)
    total = sum(len(v) for v in by_tag.values())
    tags = sorted(by_tag, key=str.lower)

    # one file per tag
    for tag in tags:
        ops = sorted(by_tag[tag], key=lambda o: (o["path"], o["method"]))
        out = [
            f"# {tag}", "",
            f"*{len(ops)} endpoint(s) · LCU client {version}*", "",
            "[← Back to index](README.md)", "",
        ]
        # mini table of contents
        out += ["| Method | Path | Summary |", "| --- | --- | --- |"]
        for o in ops:
            out.append(
                f"| {o['method']} | `{o['path']}` | {o['summary'].replace('|', '\\|')} |"
            )
        out.append("")
        out.append("---")
        out.append("")
        for o in ops:
            out += render_op(o)
            out.append("---")
            out.append("")
        (OUT / f"{slug(tag)}.md").write_text("\n".join(out), encoding="utf-8")

    # index
    idx = [
        "# League Client (LCU) API Reference", "",
        f"Friendly Markdown rebuild of `lcuapi.txt` (Swagger export, "
        f"client **{version}**).", "",
        f"**{total} endpoints** across **{len(tags)} plugin namespaces**. "
        "Endpoints are grouped by namespace (the first path segment) — "
        "click one to open its reference.", "",
        "> Base URL: `https://127.0.0.1:{port}` — port and an HTTP Basic "
        "auth password come from the client's lockfile. All calls use the "
        "`riot:{password}` credentials over HTTPS (self-signed cert).", "",
        "## Namespaces", "",
        "| Namespace | Endpoints |", "| --- | --- |",
    ]
    for tag in tags:
        idx.append(f"| [{tag}]({slug(tag)}.md) | {len(by_tag[tag])} |")
    idx.append("")
    (OUT / "README.md").write_text("\n".join(idx), encoding="utf-8")

    print(f"client {version}: {total} endpoints, {len(tags)} tags -> {OUT}")


if __name__ == "__main__":
    main()
