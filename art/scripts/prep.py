"""Crop the front-facing figure out of each character sheet and key out the white page.

Usage: python art/scripts/prep.py art     (from the repository's top folder)
Reads art/source; writes art/build/front-dress.png, front-maid.png and logo.png (RGBA).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

root = Path(sys.argv[1])
src, out = root / "source", root / "build"
out.mkdir(exist_ok=True)

MARK = (1, 254, 3)


def trapped_page(rgb, page):
    """Pockets of page white enclosed by hair, which the border fill can't reach.
    Page white is neutral (channel spread under ~5); the dress and apron whites
    are warm (spread 9+). Pockets above the shoulders are left alone so pale
    skin is never cut out."""
    near = (rgb.min(axis=2) >= 236) & ~page
    seen = np.zeros_like(near)
    out = np.zeros_like(near)
    h, w = near.shape
    from collections import deque
    for y0, x0 in zip(*np.nonzero(near)):
        if seen[y0, x0]:
            continue
        q, pts = deque([(y0, x0)]), []
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        ys, xs = np.array(pts).T
        c = rgb[ys, xs]
        spread = (c.max(axis=1) - c.min(axis=1)).mean()
        if len(pts) >= 20 and spread < 5.5 and c.mean(axis=0).min() >= 249.5 and ys.min() > 0.28 * h:
            out[ys, xs] = True
    return out


def front_figure(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    ink = (a.min(axis=2) < 225)  # anything not page-white
    cols = ink.sum(axis=0) > 2
    # first run of ink columns = the front view (leftmost figure)
    xs = np.flatnonzero(cols)
    start = xs[0]
    end = start
    gap = 0
    for x in range(start, im.width):
        if cols[x]:
            end, gap = x, 0
        else:
            gap += 1
            if gap > 40:
                break
    rows = np.flatnonzero(ink[:, start:end + 1].sum(axis=1) > 0)
    box = (max(start - 12, 0), max(rows[0] - 12, 0), min(end + 13, im.width), min(rows[-1] + 13, im.height))
    fig = im.crop(box)
    # flood the page from the border; the figure's outline stops the fill
    fig = fig.copy()
    w, h = fig.size
    for x in range(0, w, 6):
        for y in (0, h - 1):
            if fig.getpixel((x, y)) != MARK and min(fig.getpixel((x, y))) > 225:
                ImageDraw.floodfill(fig, (x, y), MARK, thresh=40)
    for y in range(0, h, 6):
        for x in (0, w - 1):
            if fig.getpixel((x, y)) != MARK and min(fig.getpixel((x, y))) > 225:
                ImageDraw.floodfill(fig, (x, y), MARK, thresh=40)
    arr = np.asarray(fig).copy()
    page = (arr == MARK).all(axis=2)
    page |= trapped_page(arr.astype(int), page)
    # widen by two pixels into the pale anti-aliased fringe so no white halo is left
    fringe = (arr.astype(int).min(axis=2) >= 215)
    for _ in range(2):
        grown = page.copy()
        grown[1:] |= page[:-1]; grown[:-1] |= page[1:]
        grown[:, 1:] |= page[:, :-1]; grown[:, :-1] |= page[:, 1:]
        page |= grown & fringe
    alpha = np.where(page, 0, 255).astype(np.uint8)
    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, "RGBA"), box


for name, file in (("dress", "outfit-dress-sheet.jpg"), ("maid", "outfit-maid-sheet.jpg")):
    img, box = front_figure(src / file)
    img.save(out / f"front-{name}.png")
    print(name, "box", box, "size", img.size)

logo = Image.open(src / "logo.webp").convert("RGBA")
bbox = logo.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
logo = logo.crop(bbox)
# harden the alpha so the tracer sees clean edges
a = np.asarray(logo).copy()
a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
Image.fromarray(a, "RGBA").save(out / "logo.png")
print("logo", logo.size)
