"""Run: py tests/test_discord_embed.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import notifications as n

n._ddragon.update(version="14.1.1", by_id={266: "Aatrox"}, by_name={"aatrox": "Aatrox"})

for kind, (title, color) in n._KINDS.items():
    p = n.build_discord_payload(kind, "body", queue="Ranked Solo", mention="42")
    e, = p["embeds"]
    assert p["content"] == "<@42>", p
    assert e["title"] == title and e["color"] == color and e["description"] == "body"
    assert e["fields"] == [{"name": "Queue", "value": "Ranked Solo", "inline": True}]
    assert "thumbnail" not in e, "no champion known, no thumbnail"

for kw in ({"champion_id": 266}, {"champion": "Aatrox"}):
    e = n.build_discord_payload("locked_pick", "x", **kw)["embeds"][0]
    assert e["thumbnail"]["url"].endswith("/cdn/14.1.1/img/champion/Aatrox.png"), e

p = n.build_discord_payload("locked_pick", "x", champion_id=999)  # unknown id
assert "thumbnail" not in p["embeds"][0]
assert n.build_discord_payload("nope", "hi") == {"content": "hi"}
assert n.build_discord_payload("nope", "hi", mention="7") == {"content": "<@7> hi"}
assert n.build_discord_payload("test", "x")["content"] == ""
print("ok")
