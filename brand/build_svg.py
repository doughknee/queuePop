#!/usr/bin/env python3
"""Generate the queuePop 'Queue Sigil' mark in all variants + lockups."""
import math, base64, os

OUT = "assets/svg"
os.makedirs(OUT, exist_ok=True)

# ---- brand palette ----
GOLD1 = "#F0E6D2"  # parchment / light
GOLD2 = "#C8AA6E"  # signature gold (primary)
GOLD4 = "#C8983C"  # deeper amber
GOLD5 = "#785A28"  # bronze
TEAL2 = "#0AC8B9"  # signature teal (live)
TEAL4 = "#005A82"  # deep teal-blue
NAVY  = "#0A1428"
BLACK = "#010A13"
WHITE = "#F0E6D2"

# ---- geometry: octagon ring centred at (CX,CY) radius R (centre->vertex) ----
CX, CY, R = 56, 54, 40

def octagon(cx, cy, r):
    pts = []
    for k in range(8):
        a = math.radians(45 * k)  # 0,45,...315
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def pts_str(pts):
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)

OUTER = octagon(CX, CY, R)
INNER = octagon(CX, CY, R * 0.60)

# play-triangle tail at lower-right (the Q tail + 'play/go')
TAIL = [(74, 71), (78, 99), (105, 85)]
TAIL_HI = [(74, 71), (78, 85), (105, 85)]  # top bevel sliver


def mark_svg(ring, tri, core_teal=True, glow=True, core_color=TEAL2,
             tri_color=None, tri_hi=True, bg=None, view=120):
    tri_color = tri_color or ring
    g = ""
    if glow:
        g += (
            '<defs><radialGradient id="gl" cx="50%" cy="50%" r="50%">'
            f'<stop offset="0%" stop-color="{TEAL2}" stop-opacity="0.55"/>'
            f'<stop offset="100%" stop-color="{TEAL2}" stop-opacity="0"/>'
            '</radialGradient></defs>'
        )
    bgrect = f'<rect width="{view}" height="{view}" fill="{bg}"/>' if bg else ""
    glow_circle = f'<circle cx="{CX}" cy="{CY}" r="26" fill="url(#gl)"/>' if glow else ""
    inner_ring = (
        f'<polygon points="{pts_str(INNER)}" fill="none" stroke="{GOLD5}" '
        f'stroke-width="1.6" stroke-linejoin="miter" opacity="0.65"/>'
    )
    core = ""
    if core_teal:
        core = f'<circle cx="{CX}" cy="{CY}" r="6.5" fill="{core_color}"/>'
    elif core_color:
        core = f'<circle cx="{CX}" cy="{CY}" r="6.5" fill="{core_color}"/>'
    hi = ""
    if tri_hi:
        hi = f'<polygon points="{pts_str(TAIL_HI)}" fill="{GOLD1}" opacity="0.20"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view} {view}" width="{view}" height="{view}">
{g}{bgrect}{glow_circle}
<polygon points="{pts_str(OUTER)}" fill="none" stroke="{ring}" stroke-width="8" stroke-linejoin="miter"/>
{inner_ring}
{core}
<polygon points="{pts_str(tri)}" fill="{tri_color}" stroke="{GOLD4 if ring==GOLD2 else 'none'}" stroke-width="1"/>
{hi}
</svg>'''


variants = {
    # primary, full colour, live state (gold + teal + glow)
    "mark-primary": mark_svg(GOLD2, TAIL, core_teal=True, glow=True),
    # resting / bronze state
    "mark-resting": mark_svg(GOLD5, TAIL, core_teal=False, glow=False,
                             core_color=TEAL4, tri_color=GOLD5, tri_hi=False),
    # single-colour gold (no teal, no glow) — for stamping, embroidery, etc.
    "mark-mono-gold": mark_svg(GOLD2, TAIL, core_teal=False, glow=False,
                               core_color=GOLD2, tri_color=GOLD2, tri_hi=False),
    # single-colour light (on dark backgrounds)
    "mark-mono-light": mark_svg(WHITE, TAIL, core_teal=False, glow=False,
                                core_color=WHITE, tri_color=WHITE, tri_hi=False),
    # single-colour dark (on light backgrounds)
    "mark-mono-dark": mark_svg(BLACK, TAIL, core_teal=False, glow=False,
                               core_color=BLACK, tri_color=BLACK, tri_hi=False),
    # on-navy tile (favicon / app base)
    "mark-on-navy": mark_svg(GOLD2, TAIL, core_teal=True, glow=True, bg=NAVY),
}

for name, svg in variants.items():
    with open(f"{OUT}/{name}.svg", "w") as f:
        f.write(svg)
    print("wrote", name)

# ---- lockups (mark + wordmark) with embedded Cinzel so the SVG is portable ----
with open("fonts/Cinzel.ttf", "rb") as f:
    cinzel_b64 = base64.b64encode(f.read()).decode()

FONT_FACE = f'''<style>
@font-face {{ font-family:'Cinzel'; font-weight:700;
  src:url(data:font/ttf;base64,{cinzel_b64}) format('truetype'); }}
.wm {{ font-family:'Cinzel', Georgia, serif; font-weight:700; letter-spacing:0.14em; }}
</style>'''

def lockup_horizontal():
    mark = mark_svg(GOLD2, TAIL, core_teal=True, glow=True)
    mark_inner = mark.split(">", 1)[1].rsplit("</svg>", 1)[0]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 130" width="520" height="130">
<defs>{FONT_FACE}</defs>
<g transform="translate(8,5)">{mark_inner}</g>
<text x="146" y="84" class="wm" font-size="56">
<tspan fill="{GOLD1}">queue</tspan><tspan fill="{GOLD2}">Pop</tspan></text>
</svg>'''

def lockup_stacked():
    mark = mark_svg(GOLD2, TAIL, core_teal=True, glow=True)
    mark_inner = mark.split(">", 1)[1].rsplit("</svg>", 1)[0]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 230" width="300" height="230">
<defs>{FONT_FACE}</defs>
<g transform="translate(90,4)">{mark_inner}</g>
<text x="150" y="205" text-anchor="middle" class="wm" font-size="46">
<tspan fill="{GOLD1}">queue</tspan><tspan fill="{GOLD2}">Pop</tspan></text>
</svg>'''

with open(f"{OUT}/lockup-horizontal.svg", "w") as f:
    f.write(lockup_horizontal())
with open(f"{OUT}/lockup-stacked.svg", "w") as f:
    f.write(lockup_stacked())
print("wrote lockups")
print("done")
