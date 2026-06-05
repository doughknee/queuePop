#!/usr/bin/env python3
import base64

def b64(p):
    with open(p,"rb") as f: return base64.b64encode(f.read()).decode()
def inner(p):
    s=open(p).read()
    return s[s.find(">",s.find("<svg"))+1:s.rfind("</svg>")]

cz=b64("fonts/Cinzel.ttf"); mc=b64("fonts/Marcellus.ttf")
primary=inner("assets/svg/mark-primary.svg")
resting=inner("assets/svg/mark-resting.svg")
mono_gold=inner("assets/svg/mark-mono-gold.svg")
mono_light=inner("assets/svg/mark-mono-light.svg")
mono_dark=inner("assets/svg/mark-mono-dark.svg")
lockH=open("assets/svg/lockup-horizontal.svg").read()
lockS=open("assets/svg/lockup-stacked.svg").read()

def swatch(name,hexv,role,light=False):
    tc="#010A13" if light else "#F0E6D2"
    return f'''<div class="sw"><div class="chip" style="background:{hexv}"></div>
    <div class="swmeta"><b>{name}</b><span class="hx">{hexv}</span><span class="role">{role}</span></div></div>'''

gold=[("gold1","#F0E6D2","light text · 'queue'"),("gold2","#C8AA6E","PRIMARY · borders · 'Pop'"),
("gold4","#C8983C","amber · hovers · kickers"),("gold5","#785A28","bronze · resting state · hairlines"),
("gold6","#463714","dark bronze · dividers"),("gold7","#32281E","darkest bronze")]
teal=[("blue1","#CDFAFA","pale cyan text"),("teal2","#0AC8B9","SECONDARY · live / in-queue"),
("blue3","#0397AB","mid teal"),("blue4","#005A82","deep teal-blue"),
("blue5","#0A323C","tile backgrounds"),("blue7","#0A1428","app background · theme color")]
neutral=[("black","#010A13","near-black base"),("grey1","#A09B8C","body text")]
func=[("danger","#C0584F","bans / errors"),("success","#5CB85C","ready / accepted"),("warning","#D6A32E","pending")]

def swrow(items): return "".join(swatch(*i) for i in items)

html=f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>queuePop — Brand Guidelines</title>
<style>
@font-face{{font-family:'Cinzel';font-weight:700;src:url(data:font/ttf;base64,{cz}) format('truetype');}}
@font-face{{font-family:'Marcellus';src:url(data:font/ttf;base64,{mc}) format('truetype');}}
:root{{--gold1:#F0E6D2;--gold2:#C8AA6E;--gold4:#C8983C;--gold5:#785A28;--gold6:#463714;
--teal2:#0AC8B9;--navy:#0A1428;--black:#010A13;--grey1:#A09B8C;--sub:#9f9b8d;
--d:'Cinzel',Georgia,serif;--b:'Marcellus',Georgia,serif;}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:var(--b);background:linear-gradient(220deg,#030912,#0A1428 55%,#1a3243);color:var(--grey1);padding:56px 28px 100px;line-height:1.6}}
.wrap{{max-width:920px;margin:0 auto}}
.kick{{font-family:var(--d);font-weight:700;color:var(--gold4);text-transform:uppercase;letter-spacing:.3em;font-size:11px}}
h1{{font-family:var(--d);font-weight:700;font-size:40px;letter-spacing:.06em;margin:14px 0 6px}}
h1 .q{{color:var(--gold1)}}h1 .p{{color:var(--gold2)}}
.lede{{color:var(--sub);font-size:15px;max-width:600px}}
section{{margin-top:54px;border-top:1px solid var(--gold6);padding-top:30px}}
h2{{font-family:var(--d);font-weight:700;color:var(--gold1);font-size:13px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:18px}}
p{{font-size:14.5px;margin-bottom:12px;max-width:680px}}
.hero{{display:flex;gap:30px;align-items:center;flex-wrap:wrap;background:rgba(1,10,19,.45);border:1px solid var(--gold6);padding:30px}}
.tile{{background:var(--black);border:1px solid var(--gold6);display:flex;align-items:center;justify-content:center;padding:18px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}}
.vcard{{background:rgba(1,10,19,.4);border:1px solid var(--gold6);padding:18px;text-align:center}}
.vcard .lab{{font-family:var(--d);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold4);margin-top:12px}}
.swwrap{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-bottom:18px}}
.sw{{display:flex;gap:12px;align-items:center}}
.chip{{width:46px;height:46px;border:1px solid rgba(255,255,255,.12);flex:none}}
.swmeta{{display:flex;flex-direction:column;font-size:12px}}
.swmeta b{{font-family:var(--d);letter-spacing:.08em;color:var(--gold1);font-size:12px}}
.hx{{color:var(--gold2);font-variant-numeric:tabular-nums}}
.role{{color:var(--sub);font-size:11px}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}
.do,.dont{{border:1px solid var(--gold6);padding:18px}}
.do h3,.dont h3{{font-family:var(--d);font-size:12px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:10px}}
.do h3{{color:var(--teal2)}}.dont h3{{color:#C0584F}}
.do li,.dont li{{font-size:13px;margin:6px 0 6px 16px}}
.type-d{{font-family:var(--d);font-weight:700;color:var(--gold1);letter-spacing:.14em}}
.type-b{{font-family:var(--b);color:var(--gold1)}}
.clearspace{{position:relative;display:inline-block;border:1px dashed var(--gold5);padding:42px}}
.note{{font-size:12.5px;color:var(--sub);margin-top:10px}}
@media(max-width:640px){{.cols{{grid-template-columns:1fr}}}}
</style></head><body><div class="wrap">

<div class="kick">RelentNet · Brand System v1</div>
<h1><span class="q">queue</span><span class="p">Pop</span></h1>
<p class="lede">Auto-accept for League of Legends &amp; Teamfight Tactics. Hextech-premium identity, 100% original artwork, built to read from a 1200px banner down to a 16px system tray.</p>

<section>
<h2>The Mark — "Queue Sigil"</h2>
<div class="hero">
<div class="tile"><svg viewBox="0 0 120 120" width="130" height="130">{primary}</svg></div>
<div style="flex:1;min-width:240px">
<p>A faceted Hextech ring forms a <b>Q</b> (queue); its tail is a <b>play triangle</b> — "queue" and "go" in one shape. The teal core is the live, in-queue pulse.</p>
<p>The mark carries the system's signature <b>ignite behavior</b>: bronze at rest, igniting to gold + teal the instant a match pops.</p>
</div></div>
</section>

<section>
<h2>States &amp; Variants</h2>
<div class="grid">
<div class="vcard"><svg viewBox="0 0 120 120" width="96" height="96">{primary}</svg><div class="lab">Primary · Live</div></div>
<div class="vcard"><svg viewBox="0 0 120 120" width="96" height="96">{resting}</svg><div class="lab">Resting · Bronze</div></div>
<div class="vcard"><svg viewBox="0 0 120 120" width="96" height="96">{mono_gold}</svg><div class="lab">Mono · Gold</div></div>
<div class="vcard"><svg viewBox="0 0 120 120" width="96" height="96">{mono_light}</svg><div class="lab">Mono · Light</div></div>
<div class="vcard" style="background:#F0E6D2"><svg viewBox="0 0 120 120" width="96" height="96">{mono_dark}</svg><div class="lab" style="color:#785A28">Mono · Dark</div></div>
</div>
</section>

<section>
<h2>Lockups</h2>
<div class="hero" style="justify-content:center">{lockH}</div>
<div class="hero" style="justify-content:center;margin-top:16px">{lockS}</div>
</section>

<section>
<h2>Clear Space &amp; Minimum Size</h2>
<div style="display:flex;gap:40px;flex-wrap:wrap;align-items:center">
<div class="clearspace"><svg viewBox="0 0 120 120" width="84" height="84">{primary}</svg></div>
<div>
<p><b>Clear space:</b> keep padding equal to half the mark's height on all sides, free of other elements.</p>
<p><b>Minimum size:</b> 16&nbsp;px (tray / favicon floor). Use 24&nbsp;px+ wherever possible. Horizontal lockup min height 28&nbsp;px so the wordmark stays legible.</p>
</div></div>
</section>

<section>
<h2>Color</h2>
<p style="margin-bottom:18px"><b>Gold #C8AA6E</b> is primary, <b>teal #0AC8B9</b> is the live/secondary accent, both on <b>near-black #010A13 / navy #0A1428</b>. The system is dark-mode only.</p>
<div class="swwrap">{swrow(gold)}</div>
<div class="swwrap">{swrow(teal)}</div>
<div class="swwrap">{swrow(neutral)}</div>
<p class="note">Functional only — not brand colors, never used in the logo:</p>
<div class="swwrap">{swrow(func)}</div>
</section>

<section>
<h2>Typography</h2>
<p><span class="type-d" style="font-size:30px">CINZEL 700</span><br>
<span style="font-size:12px;color:var(--sub)">Display / headings / wordmark. Always uppercase forms, wide tracking 0.10–0.32em.</span></p>
<p style="margin-top:18px"><span class="type-b" style="font-size:24px">Marcellus Regular</span><br>
<span style="font-size:12px;color:var(--sub)">Body, labels, taglines. Quiet, elegant serif. The all-serif pairing is intentional — it's the premium/fantasy feel.</span></p>
</section>

<section>
<h2>Do &amp; Don't</h2>
<div class="cols">
<div class="do"><h3>Do</h3><ul>
<li>Place on dark navy or near-black grounds.</li>
<li>Keep gold structure + teal life; let it ignite on interaction.</li>
<li>Use mono variants for single-color or busy contexts.</li>
<li>Preserve sharp corners and the corner-bracket framing.</li>
</ul></div>
<div class="dont"><h3>Don't</h3><ul>
<li>Recolor outside the palette or swap gold↔teal roles.</li>
<li>Add any Riot champion art, skins, or trademarks.</li>
<li>Stretch, rotate, round the corners, or add drop shadows beyond the ignite glow.</li>
<li>Place the color mark on light or low-contrast backgrounds — use mono-dark instead.</li>
</ul></div>
</div>
</section>

<section>
<h2>License &amp; Usage</h2>
<p>Code: MIT © 2026 Brandon Harris. Type: Cinzel &amp; Marcellus under the SIL Open Font License (free to embed). All logo artwork is original and license-clean — it replaces the prior <code>gnome-thresh.ico</code>, which derived from Riot IP and must not ship.</p>
</section>

</div></body></html>'''

open("assets/brand-guidelines.html","w").write(html)
print("guidelines written")
