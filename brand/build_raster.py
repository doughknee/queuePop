#!/usr/bin/env python3
"""Render queuePop raster assets: PNGs, .ico, OG image, PWA icons."""
import cairosvg, os
from PIL import Image, ImageDraw, ImageFont

GOLD1=(240,230,210); GOLD2=(200,170,110); GOLD4=(200,152,60); GOLD5=(120,90,40)
TEAL2=(10,200,185); NAVY=(10,20,40); BLACK=(1,10,19)

os.makedirs("assets/png", exist_ok=True)
os.makedirs("assets/ico", exist_ok=True)
os.makedirs("assets/social", exist_ok=True)
os.makedirs("assets/pwa", exist_ok=True)

def render(svg, w, h=None, bg=None):
    h = h or w
    png = f"/tmp/_r_{os.path.basename(svg)}_{w}.png"
    cairosvg.svg2png(url=svg, write_to=png, output_width=w, output_height=h,
                     background_color=bg)
    return Image.open(png).convert("RGBA")

# ---------- 1. PNG exports of the mark ----------
for name in ["mark-primary","mark-resting","mark-mono-gold","mark-mono-light","mark-mono-dark"]:
    for s in (64,128,256,512,1024):
        render(f"assets/svg/{name}.svg", s).save(f"assets/png/{name}-{s}.png")
print("mark PNGs done")

# ---------- 2. Multi-res ICO (app + tray) and favicon ----------
# app icon on navy tile — build from the 256px render, downscaled to each size
app_base=render("assets/svg/mark-on-navy.svg", 256)
app_base.save("assets/ico/queuepop.ico", format="ICO",
              sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
# favicon (transparent) from 256px render
fav_base=render("assets/svg/mark-primary.svg", 256)
fav_base.save("assets/ico/favicon.ico", format="ICO",
              sizes=[(16,16),(32,32),(48,48),(64,64),(256,256)])
render("assets/svg/mark-primary.svg",512).save("assets/ico/favicon-512.png")
render("assets/svg/mark-primary.svg",32).save("assets/ico/favicon-32.png")
print("ICO done")

# ---------- font loading (Cinzel 700, Marcellus) ----------
def cinzel(size):
    f=ImageFont.truetype("fonts/Cinzel.ttf", size)
    try: f.set_variation_by_axes([700])
    except Exception:
        try: f.set_variation_by_name("Bold")
        except Exception: pass
    return f
def marcellus(size): return ImageFont.truetype("fonts/Marcellus.ttf", size)

def tracked(draw, xy, text, font, fill, track):
    """draw text with letter-spacing; return total width."""
    x,y=xy
    for ch in text:
        draw.text((x,y), ch, font=font, fill=fill)
        bb=draw.textbbox((0,0),ch,font=font); w=bb[2]-bb[0]
        adv=font.getlength(ch)
        x+=adv+track
    return x-xy[0]

def tracked_width(text, font, track):
    return sum(font.getlength(ch)+track for ch in text)

def draw_wordmark(draw, cx, baseline_y, size, track_frac=0.12, anchor="mm"):
    """two-tone queuePop centred at cx; baseline_y is vertical centre."""
    font=cinzel(size); track=size*track_frac
    w1=tracked_width("queue",font,track); w2=tracked_width("Pop",font,track)
    total=w1+w2
    asc,desc=font.getmetrics(); ty=baseline_y-(asc+desc)//2
    x0=cx-total/2 if anchor=="mm" else cx
    x=x0
    x+=tracked(draw,(x,ty),"queue",font,GOLD1,track)
    tracked(draw,(x,ty),"Pop",font,GOLD2,track)
    return total

# ---------- gradient background ----------
def gradient_bg(w,h):
    # diagonal 220deg-ish: #030912 -> #0A1428 (55%) -> #1a3243
    base=Image.new("RGB",(w,h))
    px=base.load()
    c0=(3,9,18); c1=(10,20,40); c2=(26,50,67)
    import math
    ang=math.radians(220); dx,dy=math.cos(ang),math.sin(ang)
    # projection range
    corners=[(0,0),(w,0),(0,h),(w,h)]
    ps=[cx*dx+cy*dy for cx,cy in corners]; pmin,pmax=min(ps),max(ps)
    for yy in range(h):
        for xx in range(w):
            t=((xx*dx+yy*dy)-pmin)/(pmax-pmin)
            if t<0.55:
                u=t/0.55; c=tuple(int(c0[i]+(c1[i]-c0[i])*u) for i in range(3))
            else:
                u=(t-0.55)/0.45; c=tuple(int(c1[i]+(c2[i]-c1[i])*u) for i in range(3))
            px[xx,yy]=c
    return base.convert("RGBA")

def corner_brackets(img, m=46, L=46, wdt=3, col=GOLD5+(255,)):
    d=ImageDraw.Draw(img); W,H=img.size
    for (cx,cy,hx,hy) in [(m,m,1,1),(W-m,m,-1,1),(m,H-m,1,-1),(W-m,H-m,-1,-1)]:
        d.line([(cx,cy),(cx+hx*L,cy)],fill=col,width=wdt)
        d.line([(cx,cy),(cx,cy+hy*L)],fill=col,width=wdt)

# ---------- 3. OG / social image 1200x630 ----------
OG=gradient_bg(1200,630)
corner_brackets(OG, m=48, L=70, wdt=3)
# teal glow behind mark
glow=Image.new("RGBA",(1200,630),(0,0,0,0)); gd=ImageDraw.Draw(glow)
gd.ellipse([600-150,150,600+150,450],fill=TEAL2+(40,))
from PIL import ImageFilter
OG=Image.alpha_composite(OG, glow.filter(ImageFilter.GaussianBlur(60)))
mark=render("assets/svg/mark-primary.svg",230)
OG.alpha_composite(mark,(600-115,86))
d=ImageDraw.Draw(OG)
draw_wordmark(d,600,400,86)
tag="Your queue, on autopilot."
mf=marcellus(34); tw=mf.getlength(tag)
d.text((600-tw/2,452),tag,font=mf,fill=GOLD1)
sub="Auto-accept League & TFT. You just play."
sf=marcellus(23); sw=sf.getlength(sub)
d.text((600-sw/2,500),sub,font=sf,fill=(160,155,140))
OG.convert("RGB").save("assets/social/og-image.png","PNG")
print("OG done")

# ---------- 4. PWA icons ----------
# standard (mark on navy, slight padding)
for s in (192,512):
    base=Image.new("RGBA",(s,s),NAVY+(255,))
    m=render("assets/svg/mark-primary.svg",int(s*0.74))
    base.alpha_composite(m,((s-m.width)//2,(s-m.height)//2))
    base.convert("RGB").save(f"assets/pwa/icon-{s}.png")
# maskable 512 (content within 80% safe zone, full-bleed navy)
base=Image.new("RGBA",(512,512),NAVY+(255,))
m=render("assets/svg/mark-primary.svg",int(512*0.58))
base.alpha_composite(m,((512-m.width)//2,(512-m.height)//2))
base.convert("RGB").save("assets/pwa/icon-512-maskable.png")
print("PWA done")

# ---------- 5. convenience raster lockups ----------
for (label,size,track) in [("lockup-horizontal",None,None)]:
    pass
# horizontal lockup PNG (transparent)
LW,LH=1040,260
lk=Image.new("RGBA",(LW,LH),(0,0,0,0))
mk=render("assets/svg/mark-primary.svg",200)
lk.alpha_composite(mk,(10,30))
d=ImageDraw.Draw(lk)
font=cinzel(112); track=112*0.12
x=235; asc,desc=font.getmetrics(); ty=LH//2-(asc+desc)//2
x+=tracked(d,(x,ty),"queue",font,GOLD1,track)
tracked(d,(x,ty),"Pop",font,GOLD2,track)
lk.save("assets/png/lockup-horizontal-2x.png")
# stacked lockup PNG (transparent)
SW,SH=620,560
st=Image.new("RGBA",(SW,SH),(0,0,0,0))
mk=render("assets/svg/mark-primary.svg",300)
st.alpha_composite(mk,((SW-300)//2,10))
d=ImageDraw.Draw(st)
draw_wordmark(d,SW//2,440,84)
st.save("assets/png/lockup-stacked-2x.png")
print("lockups done")
print("ALL RASTER DONE")
