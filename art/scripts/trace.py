"""Trace a keyed PNG into a compact SVG with vtracer, then render a PNG preview.

Usage: python trace.py <in.png> <out.svg> <height> [color_precision] [filter_speckle] [layer_difference]
"""
import os
import re
import sys
from pathlib import Path

import resvg_py
import vtracer
from PIL import Image

src, dst, height = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
cp = int(sys.argv[4]) if len(sys.argv) > 4 else 5
speckle = int(sys.argv[5]) if len(sys.argv) > 5 else 6
layer = int(sys.argv[6]) if len(sys.argv) > 6 else 24

im = Image.open(src).convert("RGBA")
scale = height / im.height
im = im.resize((round(im.width * scale), height), Image.LANCZOS)
a = im.getchannel("A").point(lambda v: 255 if v > 127 else 0)
colors = int(sys.argv[7]) if len(sys.argv) > 7 else 0
if colors:
    # posterize to a fixed palette so the tracer makes few, large regions
    rgb = im.convert("RGB").quantize(colors=colors, method=Image.Quantize.MAXCOVERAGE, kmeans=3, dither=Image.Dither.NONE)
    mf = int(os.environ.get("TRACE_MODEFILTER", "0"))
    if mf:
        # a mode filter on the posterized image rounds off the pixel stair-steps,
        # so the tracer fits smooth curves instead of jagged runs
        from PIL import ImageFilter
        rgb = rgb.convert("RGB").filter(ImageFilter.ModeFilter(mf))
        a = a.filter(ImageFilter.ModeFilter(mf))
    im = rgb.convert("RGB").convert("RGBA")
im.putalpha(a)
tmp = dst.with_suffix(".in.png")
im.save(tmp)

vtracer.convert_image_to_svg_py(
    str(tmp), str(dst),
    colormode="color", hierarchical=os.environ.get("TRACE_HIER","stacked"), mode=os.environ.get("TRACE_MODE","spline"),
    filter_speckle=speckle, color_precision=cp, layer_difference=layer,
    corner_threshold=int(os.environ.get("TRACE_CORNER","60")), length_threshold=float(os.environ.get("TRACE_LEN", "4")), max_iterations=10,
    splice_threshold=45, path_precision=0,
)
tmp.unlink()

svg = dst.read_text(encoding="utf-8")
# compact: drop the XML prolog/comments, merge translate into nothing fancy, trim whitespace
svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
svg = re.sub(r"\s+", " ", svg).replace("> <", "><").strip()
dst.write_text(svg, encoding="utf-8")
n_paths = svg.count("<path")
print(f"{dst.name}: {len(svg):,} chars, {n_paths} paths, {im.size}")

png = resvg_py.svg_to_bytes(svg_string=svg)
dst.with_suffix(".preview.png").write_bytes(bytes(png))
