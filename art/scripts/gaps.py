"""List the near-white regions still opaque after keying, with their color stats,
to tell trapped page (between hair strands) from the white dress.
Usage: python gaps.py <front.png>"""
import sys
from collections import deque

import numpy as np
from PIL import Image

im = np.asarray(Image.open(sys.argv[1]).convert("RGBA")).astype(int)
rgb, a = im[..., :3], im[..., 3]
near = (rgb.min(axis=2) >= 236) & (a > 0)
seen = np.zeros_like(near)
h, w = near.shape
for y0 in range(h):
    for x0 in range(w):
        if not near[y0, x0] or seen[y0, x0]:
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
        if len(pts) < 40:
            continue
        ys, xs = zip(*pts)
        c = rgb[list(ys), list(xs)]
        spread = (c.max(axis=1) - c.min(axis=1)).mean()
        print(f"area={len(pts):6d} at=({min(xs)},{min(ys)}) mean={c.mean(axis=0).round(1)} spread={spread:.1f}")
