"""Build the theme's scenes from the source art.

  python art/scripts/compose.py art --plugin plugin [--retrace] [--debug-groups]
  (from the repository's top folder, after prep.py)

Traces (cached in art/build/final unless --retrace) the logo and both
front-facing outfits, then writes:
  art/build/scenes/*.svg and *.png        (stills to look at)
  plugin/hooks/art/*.ts, plugin/hooks/scenes.ts   (the drawings the plugin shows)
Each scene must stay under the app's 131,072-character limit for one Svg.
"""
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import resvg_py
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import svgopt  # noqa: E402

ROOT = Path(sys.argv[1])
RETRACE = "--retrace" in sys.argv
DEBUG = "--debug-groups" in sys.argv
BUILD, FINAL, SCENES = ROOT / "build", ROOT / "build" / "final", ROOT / "build" / "scenes"
# The plugin folder the drawings go into: --plugin <folder>, else <root>/mod.
MOD = Path(sys.argv[sys.argv.index("--plugin") + 1]) if "--plugin" in sys.argv else ROOT / "mod"
PY = sys.executable
LIMIT = 131_072
for d in (FINAL, SCENES):
    d.mkdir(parents=True, exist_ok=True)


def trace(src, out, height, cp, speckle, layer, colors, mode, length, mf=0, corner=60):
    if out.exists() and not RETRACE:
        return
    env = dict(os.environ, TRACE_HIER="cutout", TRACE_MODE=mode, TRACE_LEN=str(length),
               TRACE_MODEFILTER=str(mf), TRACE_CORNER=str(corner))
    subprocess.run([PY, str(ROOT / "scripts" / "trace.py"), str(src), str(out), str(height),
                    str(cp), str(speckle), str(layer), str(colors)], check=True, env=env)


# ---------------------------------------------------------------- figures
# High detail: trace a 3x upscale with smooth curves and full colour, written at
# half scale. Far over one drawing's limit, so the shapes are packed into layers
# that the mod stacks; cut-out shapes never overlap, so any packing lines up.
HD = dict(height=3200, cp=8, speckle=24, layer=4, colors=48, mode="spline", length=8, mf=3, corner=90)
LAYER_BUDGET = 127_500   # plus ~2.3k of wrapper and style stays under 131,072


# The desktop app also drops a whole background past some total size (one figure
# layer drew, four, about 527k characters, did not), so the outlines are simplified
# to within a fraction of a pixel, and there are two levels to choose from:
# (scale, simplify tolerance in output units, smallest shape kept)
# One level of detail. A finer one ("high", about 325-380k in all) was dropped: the
# desktop app refuses a whole background past a fixed size (somewhere between
# about 220k and 325k characters, most likely 256 KiB), whatever the screen.
DETAIL = {
    "light": (0.35, 1.0, 5),    # under about 220k in all
}


def figure_layers(name, scale, eps, min_area):
    out = FINAL / f"hd-{name}.svg"
    trace(BUILD / f"front-{name}.png", out, **HD)
    svgopt.SNAP = False
    svgopt.SIMPLIFY = eps
    try:
        bw, bh, paths = svgopt.load(out, min_area, scale)
    finally:
        svgopt.SNAP = True
        svgopt.SIMPLIFY = 0.0
    layers, cur, size = [], [], 0
    for p in paths:
        n = len(p.d) + 40
        if n > LAYER_BUDGET:
            raise SystemExit(f"{name}: one shape alone is {n:,} chars")
        if cur and size + n > LAYER_BUDGET:
            layers.append(cur)
            cur, size = [], 0
        cur.append(p)
        size += n
    if cur:
        layers.append(cur)
    return bw, bh, [svgopt.markup(layer, by_color=True) for layer in layers]


FIGURES = {
    # body trace height, head crop box in the keyed front PNG (x0, y0, x1, y1)
    "dress": {"head": (160, 10, 360, 195)},
    "maid": {"head": (150, 5, 380, 195)},
}
BODY_H, HEAD_SCALE = 800, 2.5


def figure(name):
    """The earlier single-drawing figure (kept for reference; not drawn)."""
    png = BUILD / f"front-{name}.png"
    full = Image.open(png)
    x0, y0, x1, y1 = FIGURES[name]["head"]
    head_png = FINAL / f"head-{name}.png"
    full.crop((x0, y0, x1, y1)).save(head_png)
    trace(png, FINAL / f"body-{name}.svg", BODY_H, 8, 5, 16, 24, "polygon", 6)
    head_h = round((y1 - y0) * HEAD_SCALE)
    trace(head_png, FINAL / f"head-{name}.svg", head_h, 8, 4, 20, 20, "polygon", 4)

    bw, bh, body = svgopt.load(FINAL / f"body-{name}.svg", 3)
    hw, hh, head = svgopt.load(FINAL / f"head-{name}.svg", 4)
    sb = BODY_H / full.height          # source px -> body units
    sh = hh / (y1 - y0)                # source px -> head units
    hx, hy, hs = x0 * sb, y0 * sb, sb / sh
    # body shapes wholly inside the head's opaque middle are hidden by it: drop them
    cx, cy = hx + hw * hs / 2, hy + hh * hs / 2
    rx, ry = hw * hs * 0.36, hh * hs * 0.36

    def hidden(p):
        bx0, by0, bx1, by1 = p.bbox
        return all(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 for x in (bx0, bx1) for y in (by0, by1))

    body = [p for p in body if not hidden(p)]
    mark = (f'<g stroke-width=".9" stroke-linejoin="round">{svgopt.markup(body, by_color=True)}'
            f'<g transform="translate({hx:.1f} {hy:.1f}) scale({hs:.4f})"><g mask="url(#hm-{name})">'
            f'{svgopt.markup(head, by_color=True)}</g></g></g>')
    defs = (f'<radialGradient id="hf-{name}"><stop offset=".72" stop-color="#fff"/>'
            f'<stop offset="1" stop-color="#000"/></radialGradient>'
            f'<mask id="hm-{name}" maskUnits="userSpaceOnUse" x="0" y="0" width="{hw}" height="{hh}">'
            f'<rect width="{hw}" height="{hh}" fill="url(#hf-{name})"/></mask>')
    return bw, bh, defs, mark


# ---------------------------------------------------------------- logo
LOGO_H = 420
# regions in the coordinates of the 2000-px-wide logo preview; trace units = x0.63
R = 0.63
REGIONS = [  # (group, x0, y0, x1, y1) matched on a shape's centre, first hit wins
    ("star", 950, 530, 1075, 645),
    ("tassel", 1840, 410, 1995, 668),
    ("flower", 130, 15, 405, 295),
    ("leaves", 325, 0, 515, 115),
    ("ribbon", 0, 110, 232, 640),
    ("leaves", 235, 395, 445, 610),
    ("leaves", 1690, 470, 1835, 590),
    ("book", 375, 500, 1665, 660),
    ("swirl", 1790, 330, 1995, 470),
    ("l1", 225, 40, 590, 540),
    ("l2", 590, 40, 755, 540),
    ("l3", 755, 200, 1005, 540),
    ("l4", 1005, 200, 1295, 540),
    ("l5", 1295, 40, 1615, 540),
    ("l6", 1615, 200, 1995, 540),
]
ORDER = ["book", "star", "l1", "l2", "l3", "l4", "l5", "l6", "swirl", "ribbon", "flower", "leaves", "tassel", "frame"]


LOGO_SIMPLIFY = 0.3


def logo():
    trace(BUILD / "logo.png", FINAL / "logo.svg", LOGO_H, 8, 10, 32, 10, "spline", 8)
    # simplified like her figure: lighter to redraw on every frame of the opening
    svgopt.SIMPLIFY = LOGO_SIMPLIFY
    try:
        w, h, paths = svgopt.load(FINAL / "logo.svg", 4)
    finally:
        svgopt.SIMPLIFY = 0.0
    groups = {g: [] for g in ORDER}
    for p in paths:
        x0, y0, x1, y1 = p.bbox
        if (x1 - x0) > 520 * R:   # outline masses spanning several letters
            groups["frame"].append(p)
            continue
        cx, cy = p.center
        for g, a, b, c, d in REGIONS:
            if a * R <= cx <= c * R and b * R <= cy <= d * R:
                groups[g].append(p)
                break
        else:
            groups["frame"].append(p)
    return w, h, groups


# ---------------------------------------------------------------- shared art
PETAL = "M0 0c5-7 14-8 18 0c-4 8-13 7-18 0z"
SPARK = "M0-9l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"


def medallion(x, y, r=1.0):
    petals = "".join(f'<ellipse rx="{2.4 * r:.1f}" ry="{6.5 * r:.1f}" transform="rotate({k * 45}) translate(0 {-7.5 * r:.1f})"/>'
                     for k in range(8))
    return f'<g transform="translate({x} {y})">{petals}<circle r="{3.2 * r:.1f}"/></g>'


EMBROIDERY = (
    '<pattern id="emb" width="180" height="70" patternUnits="userSpaceOnUse">'
    '<g class="gold" fill="none" stroke-width="1.6" stroke-linecap="round">'
    '<path d="M0 46c30-22 60-22 90 0s60 22 90 0"/>'
    '<path d="M38 34c-6-10-2-18 6-20M52 34c6-9 14-11 20-7M128 58c-6 10-2 17 6 19M142 58c6 8 14 9 20 5"/>'
    '</g><g class="goldf">' + medallion(90, 46, 1.0) + medallion(0, 46, .7) + medallion(180, 46, .7) + '</g></pattern>'
)

COLORS_CSS = """
.bg{fill:#f5ead9}.s-a{stop-color:#fbf3e6}.s-b{stop-color:#efdcc3}
.s-g{stop-color:#ffb36b;stop-opacity:.55}.s-g0{stop-color:#ffb36b;stop-opacity:0}
.gold{stroke:#b9853c}.goldf{fill:#c8913a}.petal{fill:#e8742c}.petal2{fill:#f39a4f}
.spark{fill:#d9a24a}.band{opacity:.38}.rule{stroke:#b9853c}
@media (prefers-color-scheme: dark){
.bg{fill:#1b1311}.s-a{stop-color:#2a1c18}.s-b{stop-color:#140e0c}
.s-g{stop-color:#ff8a3d;stop-opacity:.32}.s-g0{stop-color:#ff8a3d;stop-opacity:0}
.gold{stroke:#d6a457}.goldf{fill:#d6a457}.petal{fill:#ff8c42}.petal2{fill:#ffb070}
.spark{fill:#f3c46e}.band{opacity:.5}.rule{stroke:#d6a457}
}
"""

GROUND = (
    '<linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s-a"/><stop offset="1" class="s-b"/></linearGradient>'
    '<radialGradient id="gl"><stop offset="0" class="s-g"/><stop offset="1" class="s-g0"/></radialGradient>'
)


def wrap(defs, css, body, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">'
            f'<title>{label}</title><defs>{GROUND}{defs}</defs><style>{css}</style>'
            f'<rect class="bg" width="1600" height="1000"/><rect width="1600" height="1000" fill="url(#gr)"/>{body}</svg>')


# The opening's book and wordmark stand on a stage of their own over the ground:
# the mod sets the stage's x and width (STAGE_AT, as percentages of the window)
# to the chat area at each opening, so they show whole between the session list
# and the right sidebar, scaled to fit ("meet"), while the ground fills the window.
STAGE_AT = 'x="0%" width="100%"'


def wrap_staged(css, body, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">'
            f'<title>{label}</title><defs>{GROUND}</defs><style>{css}</style>'
            f'<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">'
            f'<rect class="bg" width="1600" height="1000"/><rect width="1600" height="1000" fill="url(#gr)"/></svg>'
            f'<svg class="stage" {STAGE_AT} height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid meet">'
            f'{body}</svg></svg>')


# ---------------------------------------------------------------- intro
def intro_scene():
    w, h, groups = logo()
    # the logo sits in a nested svg that always fits the middle of the view
    lw = 1100
    lh = lw * h / w
    lx, ly = 800 - lw / 2, 470 - lh / 2
    parts = []
    for g in ORDER:
        if groups[g]:
            parts.append(f'<g class="{g}">{svgopt.markup(groups[g], by_color=True)}</g>')
    sparks = "".join(
        f'<path class="spark sp sp{i}" d="{SPARK}" transform="translate({x} {y}) scale({s})"/>'
        for i, (x, y, s) in enumerate([(330, 330, 1.3), (1270, 300, 1.1), (1350, 610, 1.4), (260, 640, 1.0),
                                       (560, 250, .8), (1040, 255, .9), (720, 720, 1.0), (980, 700, 1.2)]))
    burst = "".join(
        f'<g transform="translate(800 690)"><path class="{"petal" if i % 2 else "petal2"} bp bp{i}" d="{PETAL}"/></g>'
        for i in range(10))
    css = COLORS_CSS + INTRO_CSS + "".join(
        f".bp{i}{{--dx:{math.cos(a) * r:.0f}px;--dy:{-abs(math.sin(a)) * r * .8 - 60:.0f}px;--rot:{(i * 77) % 360}deg;animation-delay:{3.0 + i * .06:.2f}s}}"
        for i, (a, r) in enumerate((math.pi * (i + .5) / 10, 380 + (i * 53) % 160) for i in range(10)))
    body = (f'<ellipse class="glow" cx="800" cy="520" rx="760" ry="420" fill="url(#gl)"/>'
            f'<g class="out"><svg x="{lx:.0f}" y="{ly:.0f}" width="{lw}" height="{lh:.0f}" viewBox="0 0 {w} {h}">'
            f'<g stroke-width=".9" stroke-linejoin="round">{"".join(parts)}</g></svg>{sparks}{burst}</g>')
    # With its own parchment ground: the mod hands the app this one drawing alone,
    # the only way the desktop app was seen to play a background's animation.
    return wrap_staged(css, body, "The Claude wordmark assembling on an open book")


INTRO_CSS = """
.glow,.out,.book,.star,.frame,.l1,.l2,.l3,.l4,.l5,.l6,.swirl,.ribbon,.flower,.leaves,.tassel,.sp,.bp{transform-box:fill-box;animation-fill-mode:both}
.glow{animation:fade 1.4s ease-out .9s both,vanish .9s ease-in 5.4s forwards}
.out,.l1,.l2,.l3,.l4,.l5,.l6,.book,.flower,.ribbon,.tassel,.glow{will-change:transform,opacity}
.out{transform-box:view-box;transform-origin:800px 470px;animation:out 1.1s ease-in 5.3s both}
.book{transform-origin:50% 100%;animation:unfold .9s cubic-bezier(.2,.9,.3,1.2) .3s both}
.star{transform-origin:50% 50%;animation:pop .6s cubic-bezier(.3,1.6,.5,1) 1s both}
.frame{animation:fade .9s ease-out 1.25s both}
.l1,.l2,.l3,.l4,.l5,.l6{transform-origin:50% 100%;animation:rise .55s cubic-bezier(.2,1.3,.4,1) both}
.l1{animation-delay:1.3s}.l2{animation-delay:1.45s}.l3{animation-delay:1.6s}.l4{animation-delay:1.75s}.l5{animation-delay:1.9s}.l6{animation-delay:2.05s}
.swirl{animation:fade .6s ease-out 2.3s both}
.ribbon{transform-origin:80% 0%;animation:drop .7s cubic-bezier(.2,1.2,.4,1) 2.45s both}
.flower{transform-origin:50% 50%;animation:bloom .9s cubic-bezier(.2,1.4,.4,1) 2.35s both}
.leaves{transform-origin:50% 50%;animation:pop .7s cubic-bezier(.3,1.5,.5,1) 2.6s both}
.tassel{transform-origin:50% 0%;animation:swing 2.2s ease-out 2.8s both}
.sp{transform-origin:50% 50%;opacity:0;animation:twinkle 1.6s ease-in-out both}
.sp0{animation-delay:3.1s}.sp1{animation-delay:3.3s}.sp2{animation-delay:3.5s}.sp3{animation-delay:3.2s}
.sp4{animation-delay:3.7s}.sp5{animation-delay:3.4s}.sp6{animation-delay:3.8s}.sp7{animation-delay:3.6s}
.bp{transform-origin:50% 50%;opacity:0;animation:burst 2.4s cubic-bezier(.1,.6,.3,1) both}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes vanish{from{opacity:1}to{opacity:0}}
@keyframes out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-36px)}}
@keyframes unfold{from{opacity:0;transform:scaleY(0) scaleX(.6)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(0)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
@keyframes drop{from{opacity:0;transform:scaleY(.1) rotate(-20deg)}to{opacity:1;transform:none}}
@keyframes bloom{from{opacity:0;transform:rotate(-150deg) scale(0)}to{opacity:1;transform:none}}
@keyframes swing{0%{opacity:0;transform:rotate(30deg)}12%{opacity:1;transform:rotate(-18deg)}30%{transform:rotate(11deg)}50%{transform:rotate(-6deg)}70%{transform:rotate(3deg)}100%{transform:none}}
@keyframes twinkle{0%{opacity:0;transform:scale(.2) rotate(0)}45%{opacity:1;transform:scale(1) rotate(45deg)}100%{opacity:0;transform:scale(.3) rotate(90deg)}}
@keyframes burst{0%{opacity:0;transform:translate(0,0) rotate(0) scale(.4)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--rot)) scale(1.1)}}
"""


# ---------------------------------------------------------------- steady
def bare(defs, css, body, label):
    """A transparent layer stacked over the base: same view box, no ground."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">'
            f'<title>{label}</title>{f"<defs>{defs}</defs>" if defs else ""}<style>{css}</style>{body}</svg>')


# Her layers have a view box of their own, just around her, fitted whole ("meet")
# into the right edge of the box the mod gives them: on any window shape she shows
# head to toe at the same share of the height, and the mod moves her left by
# narrowing that box when the right sidebar opens.
FIG_H, FIG_Y, FIG_X = 860, 80, 30      # in a view box 1000 tall: 80 above her, 60 below


def figure_svg(bw, bh, scale, mark, halo, label):
    fw = FIG_H * bw / bh
    vw = FIG_X + fw + 40
    css = COLORS_CSS + FIG_CSS
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.0f} 1000" preserveAspectRatio="xMaxYMax meet">'
            f'<title>{label}</title>'
            f'{"<defs>" + GLOW + "</defs>" if halo else ""}<style>{css}</style>{halo}'
            f'<g class="enter"><svg x="{FIG_X}" y="{FIG_Y}" width="{fw:.0f}" height="{FIG_H}" viewBox="0 0 {bw} {bh}">'
            f'<g stroke-width="{.9 * scale / .5:.2f}" stroke-linejoin="round">{mark}</g></svg></g></svg>')


GLOW = '<radialGradient id="gl"><stop offset="0" class="s-g"/><stop offset="1" class="s-g0"/></radialGradient>'

FIG_CSS = """
.enter,.halo{transform-box:view-box}
.enter{animation:fade .9s cubic-bezier(.3,.7,.4,1) both}
.halo{animation:fade 1.6s ease-out both,breathe 9s ease-in-out 1.6s infinite alternate}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes breathe{from{opacity:.75}to{opacity:1}}
"""


def steady_layers(name):
    """The resting scene as stacked drawings: the ground, her figure in layers (one
    set per detail level), the petals."""
    outfit = "white dress" if name == "dress" else "maid outfit"
    levels = {}
    for level, (scale, eps, min_area) in DETAIL.items():
        bw, bh, figure = figure_layers(name, scale, eps, min_area)
        layers = []
        for i, mark in enumerate(figure):
            # the halo glows behind her, in the first layer
            halo = (f'<ellipse class="halo" cx="{FIG_X + FIG_H * bw / bh / 2:.0f}" cy="{FIG_Y + FIG_H * .42:.0f}" '
                    f'rx="{FIG_H * bw / bh * .95:.0f}" ry="{FIG_H * .62:.0f}" fill="url(#gl)"/>') if i == 0 else ""
            layers.append(figure_svg(bw, bh, scale, mark, halo,
                                     f"The orange-haired librarian in her {outfit}, part {i + 1} of {len(figure)}"))
        levels[level] = layers

    sparks = "".join(
        f'<path class="spark tw tw{i}" d="{SPARK}" transform="translate({x} {y}) scale({s})"/>'
        for i, (x, y, s) in enumerate([(120, 140, 1.0), (1480, 90, .8), (980, 120, .7), (70, 520, .8), (760, 70, .6), (1560, 520, .7)]))
    base_css = COLORS_CSS + LAYER_CSS + "".join(f".tw{i}{{animation-delay:{-(i * 1.3):.1f}s}}" for i in range(6))
    base = wrap(EMBROIDERY, base_css,
                f'<g class="band"><path class="rule" fill="none" stroke-width="1.4" d="M0 918h1600M0 924h1600"/>'
                f'<rect y="930" width="1600" height="70" fill="url(#emb)"/></g>{sparks}',
                "Cream parchment with gold embroidery along the bottom and a warm glow on the right")

    petals_body = "".join(
        f'<g transform="translate({x} -40)"><path class="{"petal" if i % 2 else "petal2"} fp fp{i}" d="{PETAL}"/></g>'
        for i, x in enumerate([180, 420, 640, 860, 1010, 1180, 1320, 1460, 300, 1540]))
    petals_css = COLORS_CSS + LAYER_CSS + "".join(
        f".fp{i}{{animation-duration:{17 + (i * 7) % 12}s;animation-delay:{-(i * 3.1) % 17:.1f}s;--sway:{(-1) ** i * (40 + (i * 13) % 50)}px}}"
        for i in range(10))
    petals = bare("", petals_css, petals_body, "Orange petals drifting down")
    return {"base": base, "petals": petals, **levels}


LAYER_CSS = """
.pos,.enter,.halo{transform-box:view-box}
.enter{animation:fade 1.4s ease-out both}
.halo{animation:fade 2s ease-out both,breathe 9s ease-in-out 2s infinite alternate}
.fp{transform-box:fill-box;transform-origin:50% 50%;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite;opacity:0}
.tw{transform-box:fill-box;transform-origin:50% 50%;opacity:.35;animation:glint 7s ease-in-out infinite}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes breathe{from{opacity:.75}to{opacity:1}}
@keyframes fall{0%{opacity:0;transform:translate(0,0) rotate(0)}8%{opacity:.85}50%{transform:translate(var(--sway),540px) rotate(200deg)}92%{opacity:.85}100%{opacity:0;transform:translate(0,1080px) rotate(400deg)}}
@keyframes glint{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:.9;transform:scale(1) rotate(45deg)}}
@media (max-aspect-ratio: 3/2){.pos{transform:translateX(-50px)}}
@media (max-aspect-ratio: 27/20){.pos{transform:translateX(-125px)}}
@media (max-aspect-ratio: 6/5){.pos{transform:translateX(-200px)}}
@media (max-aspect-ratio: 1/1){.pos{transform-origin:1540px 960px;transform:translateX(-300px) scale(.9)}}
@media (max-aspect-ratio: 3/4){.pos{transform-origin:1540px 960px;transform:translateX(-390px) scale(.75)}}
"""


def steady_scene(name):
    """The earlier single-drawing resting scene (kept for reference; not drawn)."""
    bw, bh, defs, mark = figure(name)
    fh = 880
    fw = fh * bw / bh
    fx, fy = 1540 - fw, 1000 - 40 - fh
    petals = "".join(
        f'<g transform="translate({x} -40)"><path class="{"petal" if i % 2 else "petal2"} fp fp{i}" d="{PETAL}"/></g>'
        for i, x in enumerate([180, 420, 640, 860, 1010, 1180, 1320, 1460, 300, 1540]))
    sparks = "".join(
        f'<path class="spark tw tw{i}" d="{SPARK}" transform="translate({x} {y}) scale({s})"/>'
        for i, (x, y, s) in enumerate([(120, 140, 1.0), (1480, 90, .8), (980, 120, .7), (70, 520, .8), (760, 70, .6), (1560, 520, .7)]))
    css = COLORS_CSS + STEADY_CSS + "".join(
        f".fp{i}{{animation-duration:{17 + (i * 7) % 12}s;animation-delay:{-(i * 3.1) % 17:.1f}s;--sway:{(-1) ** i * (40 + (i * 13) % 50)}px}}"
        f".tw{i}{{animation-delay:{-(i * 1.3):.1f}s}}"
        for i in range(10)) + "".join(f".tw{i}{{animation-delay:{-(i * 1.3):.1f}s}}" for i in range(6))
    body = (f'<ellipse class="halo" cx="{fx + fw / 2:.0f}" cy="{fy + fh * .42:.0f}" rx="{fw * .95:.0f}" ry="{fh * .62:.0f}" fill="url(#gl)"/>'
            f'<g class="band"><path class="rule" fill="none" stroke-width="1.4" d="M0 918h1600M0 924h1600"/>'
            f'<rect y="930" width="1600" height="70" fill="url(#emb)"/></g>'
            f'{sparks}'
            f'<g class="pos"><g class="enter"><g class="float">'
            f'<svg x="{fx:.0f}" y="{fy:.0f}" width="{fw:.0f}" height="{fh}" viewBox="0 0 {bw} {bh}">{mark}</svg>'
            f'</g></g></g>{petals}')
    return wrap(EMBROIDERY + defs, css, body, f"The orange-haired librarian in her {'white dress' if name == 'dress' else 'maid outfit'}, petals drifting")


STEADY_CSS = """
.pos,.enter,.float,.halo{transform-box:view-box}
.enter{animation:enter 1.6s cubic-bezier(.2,.8,.3,1) both}
.float{animation:float 8s ease-in-out 1.6s infinite alternate}
.halo{animation:fade 2s ease-out both,breathe 9s ease-in-out 2s infinite alternate}
.fp{transform-box:fill-box;transform-origin:50% 50%;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite;opacity:0}
.tw{transform-box:fill-box;transform-origin:50% 50%;opacity:.35;animation:glint 7s ease-in-out infinite}
@keyframes enter{from{opacity:0;transform:translateX(70px)}to{opacity:1;transform:none}}
@keyframes float{from{transform:translateY(0)}to{transform:translateY(-10px)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes breathe{from{opacity:.75}to{opacity:1}}
@keyframes fall{0%{opacity:0;transform:translate(0,0) rotate(0)}8%{opacity:.85}50%{transform:translate(var(--sway),540px) rotate(200deg)}92%{opacity:.85}100%{opacity:0;transform:translate(0,1080px) rotate(400deg)}}
@keyframes glint{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:.9;transform:scale(1) rotate(45deg)}}
@media (max-aspect-ratio: 3/2){.pos{transform:translateX(-50px)}}
@media (max-aspect-ratio: 27/20){.pos{transform:translateX(-125px)}}
@media (max-aspect-ratio: 6/5){.pos{transform:translateX(-200px)}}
@media (max-aspect-ratio: 1/1){.pos{transform-origin:1540px 960px;transform:translateX(-300px) scale(.9)}}
@media (max-aspect-ratio: 3/4){.pos{transform-origin:1540px 960px;transform:translateX(-390px) scale(.75)}}
"""


# ---------------------------------------------------------------- motion
# The desktop app plays a background's animation only for one drawing handed over
# alone, and only the first time it sees that exact text. So her entrance and her
# outfit change are one-off single drawings the mod puts together (ground + her +
# light and petals), with a fresh note in each; when one ends, the mod swaps in her
# sharp stacked layers, which are still. One drawing holds at most 131,072
# characters, so she is simplified further in these.
# The app lays each moving drawing over a still copy of itself with every
# animation stripped out, and that copy shows for a moment when the animation
# ends; so the resting style of everything here is its last frame (the light
# and petals gone, her figure in place), or the light flashes up as it ends.
MOTION_LEVEL = (0.2, 2.5, 15)        # scale, simplify tolerance, smallest shape
MOTION_FX_CSS = """
.mfig,.mglow,.mp{transform-box:view-box}
.mfig .enter,.mfig .halo{animation:none}
.mglow{opacity:0}
.m-a{stop-color:#fff8ec;stop-opacity:.97}.m-b{stop-color:#ffd9a8;stop-opacity:.75}.m-c{stop-color:#ffd9a8;stop-opacity:0}
@media (prefers-color-scheme: dark){.m-a{stop-color:#ffd2a0;stop-opacity:.9}.m-b{stop-color:#ff8a3d;stop-opacity:.5}.m-c{stop-color:#ff8a3d;stop-opacity:0}}
.change .mglow{animation:flash 1.7s cubic-bezier(.3,.6,.4,1) both}
.entrance .mglow{animation:bloom 1.9s ease-in-out both}
.change .mfig{animation:emerge 1.2s cubic-bezier(.25,.7,.35,1) .35s both}
.entrance .mfig{animation:emerge 1.3s cubic-bezier(.25,.7,.35,1) .5s both}
.mp{opacity:0;animation:orbit 1.9s cubic-bezier(.25,.6,.35,1) both}
@keyframes flash{0%{opacity:1}22%{opacity:1}100%{opacity:0}}
@keyframes bloom{0%{opacity:0}30%{opacity:1}45%{opacity:1}100%{opacity:0}}
@keyframes emerge{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes orbit{0%{opacity:0;transform:rotate(var(--a)) scale(.3)}20%{opacity:1}70%{opacity:.9}100%{opacity:0;transform:rotate(calc(var(--a) + 240deg)) scale(1.25)}}
"""


def motion(name):
    """Her simplified figure, and the light and petals laid over her, as two
    drawings with the same view box as her sharp layers."""
    scale, eps, min_area = MOTION_LEVEL
    bw, bh, layers = figure_layers(name, scale, eps, min_area)
    if len(layers) != 1:
        raise SystemExit(f"motion-{name}: the simplified figure needs {len(layers)} drawings")
    fw = FIG_H * bw / bh
    vw = FIG_X + fw + 40
    cx, cy = FIG_X + fw / 2, FIG_Y + FIG_H * .48
    halo = (f'<ellipse class="halo" cx="{cx:.0f}" cy="{FIG_Y + FIG_H * .42:.0f}" '
            f'rx="{fw * .95:.0f}" ry="{FIG_H * .62:.0f}" fill="url(#gl)"/>')
    outfit = "white dress" if name == "dress" else "maid outfit"
    fig = figure_svg(bw, bh, scale, layers[0], halo, f"The orange-haired librarian in her {outfit}")
    petals = []
    for i in range(24):
        r = 140 + (i * 37) % 200
        cls = "petal" if i % 2 else "petal2"
        petals.append(f'<g class="mp mp{i}"><path class="{cls}" d="{PETAL}" '
                      f'transform="translate({cx:.0f} {cy - r:.0f}) rotate({(i * 53) % 360}) scale({1.6 + (i % 4) * .35:.2f})"/></g>')
    css = COLORS_CSS + MOTION_FX_CSS + f".mp{{transform-origin:{cx:.0f}px {cy:.0f}px}}" + "".join(
        f".mp{i}{{--a:{-(i * 15)}deg;animation-delay:{(i % 6) * 25}ms}}" for i in range(24))
    fx = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.0f} 1000" preserveAspectRatio="xMaxYMax meet">'
          f'<defs><radialGradient id="mg"><stop offset="0" class="m-a"/><stop offset=".55" class="m-b"/>'
          f'<stop offset="1" class="m-c"/></radialGradient></defs><style>{css}</style>'
          f'<ellipse class="mglow" cx="{cx:.0f}" cy="{cy:.0f}" rx="{vw * .62:.0f}" ry="560" fill="url(#mg)"/>'
          f'{"".join(petals)}</svg>')
    return {"figure": fig, "fx": fx}


# ---------------------------------------------------------------- output
def check(svg, name):
    bad = [t for t in ("<image", "data:", "foreignObject", "@import", "@font-face", "CDATA", "\\", "<!DOCTYPE") if t in svg]
    if bad:
        raise SystemExit(f"{name}: contains refused markup {bad}")
    print(f"{name}: {len(svg):,} chars ({len(svg) / LIMIT:.0%} of the limit)")
    if len(svg) > LIMIT:
        raise SystemExit(f"{name} is over the {LIMIT:,}-character limit")


def still(svg, out):
    # resvg ignores CSS animation: this is the resting frame (what reduced motion shows)
    out.write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=1600)))


intro = intro_scene()
check(intro, "intro")
(SCENES / "intro.svg").write_text(intro, encoding="utf-8")
still(intro, SCENES / "intro.png")

steady = {name: steady_layers(name) for name in ("dress", "maid")}
import re as _re
for name, parts in steady.items():
    for level in DETAIL:
        layers = [parts["base"], *parts[level], parts["petals"]]
        for i, svg in enumerate(layers):
            check(svg, f"steady-{name}-{level} layer {i}")
        # a still of the whole stack: the layers' bodies laid into the base
        inner = "".join(_re.sub(r"^<svg[^>]*>|</svg>$", "", s) for s in layers[1:])
        still(layers[0].replace("</svg>", inner + "</svg>"), SCENES / f"steady-{name}-{level}.png")
        print(f"steady-{name}-{level}: {len(layers)} drawings, {sum(map(len, layers)):,} chars in all")

moving = {name: motion(name) for name in ("dress", "maid")}


def nest(svg, attrs):
    return svg.replace("<svg ", f"<svg {attrs} ", 1)


for name, m in moving.items():
    # put together as the mod does (it adds a note of under 60 characters)
    parts = steady[name]
    full = ('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" class="change">'
            + nest(parts["base"], 'width="100%" height="100%"')
            + '<g class="mfig">' + nest(m["figure"], 'width="100%" height="100%"') + "</g>"
            + nest(m["fx"], 'width="100%" height="100%"')
            + nest(parts["petals"], 'width="100%" height="100%"') + "</svg>")
    check(full + " " * 120, f"motion-{name} (put together)")
    # its last frame, as the sharp layers take over
    end = full.replace("</svg>", "<style>.mglow{opacity:0}</style></svg>")
    end = end.replace('width="100%" height="100%" class', 'width="1600" height="1000" class', 1)
    still(end, SCENES / f"motion-{name}-end.png")

if DEBUG:
    w, h, groups = logo()
    palette = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6",
               "#bcf60c", "#fabebe", "#008080", "#e6beff", "#9a6324", "#800000"]
    body = "".join(f'<g fill="{palette[i]}">' + "".join(f'<path d="{p.d}"/>' for p in groups[g]) + "</g>"
                   for i, g in enumerate(ORDER))
    doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#fff"/>{body}</svg>'
    (SCENES / "logo-groups.png").write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=doc)))
    print({g: len(v) for g, v in groups.items()})

hooks = MOD / "hooks"
hooks.mkdir(parents=True, exist_ok=True)
# The engine reads no module file over 1 MB, so each drawing gets a file of its own
# under hooks/art/, and scenes.ts gathers them.
HEAD = "// Generated by scripts/compose.py from the art in source/. Do not edit by hand.\n"
art = hooks / "art"
if art.exists():
    for old in art.glob("*.ts"):
        old.unlink()
art.mkdir(exist_ok=True)


def art_file(stem, svg):
    (art / f"{stem}.ts").write_text(f"{HEAD}export default {json.dumps(svg)}\n", encoding="utf-8")
    return stem


imports, entries = [], {}
for stem, svg in [("intro", intro)] + [
        (f"{name}-{part}", svg) for name, parts in steady.items()
        for part, svg in [("base", parts["base"]), ("petals", parts["petals"])]
                         + [(f"{level}-{i:02d}", s) for level in DETAIL for i, s in enumerate(parts[level])]] + [
        (f"motion-{name}-{part}", m[part]) for name, m in moving.items() for part in ("figure", "fx")]:
    ident = "A_" + stem.replace("-", "_")
    imports.append(f"import {ident} from './art/{art_file(stem, svg)}'")
    entries[stem] = ident

ts = [HEAD, *imports, "", "export const INTRO: string = A_intro", "",
      "export type Detail = " + " | ".join(f"'{level}'" for level in DETAIL), "",
      "export const STEADY: Record<'dress' | 'maid', { base: string; petals: string } & Record<Detail, string[]>> = {"]
for name, parts in steady.items():
    levels = ", ".join(
        f"{level}: [" + ", ".join(entries[f"{name}-{level}-{i:02d}"] for i in range(len(parts[level]))) + "]"
        for level in DETAIL)
    ts.append(f"  {name}: {{ base: {entries[name + '-base']}, petals: {entries[name + '-petals']}, {levels} }},")
ts.append("}")
ts += ["", "// Her simplified figure and the light and petals over it, for the one-off moving drawings.",
       "export const MOTION: Record<'dress' | 'maid', { figure: string; fx: string }> = {"]
for name in moving:
    ts.append(f"  {name}: {{ figure: {entries[f'motion-{name}-figure']}, fx: {entries[f'motion-{name}-fx']} }},")
ts.append("}")
(hooks / "scenes.ts").write_text("\n".join(ts) + "\n", encoding="utf-8")
print("wrote", hooks / "scenes.ts")
