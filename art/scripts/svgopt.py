"""Shrink a vtracer SVG: fold each path's translate into its data, write the data
relative with minimal separators, drop specks, and keep a bbox per path.

Used as a module by compose.py:  load(svg_path, min_area) -> (width, height, [Path])
"""
import re
from dataclasses import dataclass
from pathlib import Path as FsPath

import os

SNAP = os.environ.get("SVGOPT_SNAP", "1") == "1"
NUM = re.compile(r"[A-Za-z]|-?\d+(?:\.\d+)?")


@dataclass
class Path:
    d: str
    fill: str
    bbox: tuple  # x0, y0, x1, y1

    @property
    def area(self):
        x0, y0, x1, y1 = self.bbox
        return (x1 - x0) * (y1 - y0)

    @property
    def center(self):
        x0, y0, x1, y1 = self.bbox
        return ((x0 + x1) / 2, (y0 + y1) / 2)


def _fmt(nums):
    out = ""
    for n in nums:
        s = str(int(round(n)))
        if out and not s.startswith("-") and out[-1] not in "MmCcLlZz":
            out += " "
        out += s
    return out


def _short_hex(c):
    c = c.lower()
    if SNAP and re.fullmatch(r"#[0-9a-f]{6}", c):
        # snap to 4 bits a channel: cel-shaded art survives it, and shapes of
        # one snapped color merge into a single element
        return "#" + "".join(f"{min(15, round(int(c[i:i + 2], 16) / 17)):x}" for i in (1, 3, 5))
    if re.fullmatch(r"#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3", c):
        return "#" + c[1] + c[3] + c[5]
    return c


def compact(d, tx, ty, k=1.0):
    """k scales every coordinate; points are rounded first and the relative steps
    taken between rounded points, so rounding never drifts along a path."""
    def P(x, y):
        return round((x + tx) * k), round((y + ty) * k)

    toks = NUM.findall(d)
    i, cmd = 0, None
    cx = cy = sx = sy = 0
    out, last = [], None
    xs, ys = [], []
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                out.append("z")
                cx, cy = sx, sy
                last = "z"
                continue
        if cmd == "M":
            x, y = P(float(toks[i]), float(toks[i + 1]))
            i += 2
            if last is None:
                out.append("M" + _fmt([x, y]))
            else:
                out.append("m" + _fmt([x - cx, y - cy]))
            cx, cy, sx, sy = x, y, x, y
            last = "m"
            xs.append(x); ys.append(y)
        elif cmd == "L":
            x, y = P(float(toks[i]), float(toks[i + 1]))
            i += 2
            seg = _fmt([x - cx, y - cy])
            out.append(("" if last == "l" else "l") + ("" if last != "l" or seg.startswith("-") else " ") + seg)
            cx, cy = x, y
            last = "l"
            xs.append(x); ys.append(y)
        elif cmd == "C":
            p = [float(v) for v in toks[i:i + 6]]
            i += 6
            p = [*P(p[0], p[1]), *P(p[2], p[3]), *P(p[4], p[5])]
            rel = [p[0] - cx, p[1] - cy, p[2] - cx, p[3] - cy, p[4] - cx, p[5] - cy]
            seg = _fmt(rel)
            out.append(("" if last == "c" else "c") + ("" if last != "c" or seg.startswith("-") else " ") + seg)
            cx, cy = p[4], p[5]
            last = "c"
            xs += [p[0], p[2], p[4]]; ys += [p[1], p[3], p[5]]
        else:
            raise ValueError(f"unhandled path command {cmd!r}")
    return "".join(out), (min(xs), min(ys), max(xs), max(ys))


# Above 0, load() redraws every outline as a polyline kept within this many output
# units of the traced curve (Ramer-Douglas-Peucker). A trace of an upscaled picture
# is mostly tiny and straight "curves"; this keeps only the points that shape it.
SIMPLIFY = 0.0


def _rdp(pts, eps):
    """Ramer-Douglas-Peucker on an open polyline, iterative."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    e2 = eps * eps
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if ll == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, idx = d2, i
        if best > e2:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def compact_rdp(d, tx, ty, k, eps):
    """Like compact(), but each subpath is flattened, simplified to eps and written
    as a relative polyline of whole numbers."""
    toks = NUM.findall(d)
    subpaths, cur = [], []
    i, cmd = 0, None
    cx = cy = 0.0

    def P(x, y):
        return (x + tx) * k, (y + ty) * k

    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    subpaths.append(cur)
                cur = []
                continue
        if cmd == "M":
            if cur:
                subpaths.append(cur)
            cx, cy = P(float(toks[i]), float(toks[i + 1]))
            cur = [(cx, cy)]
            i += 2
        elif cmd == "L":
            cx, cy = P(float(toks[i]), float(toks[i + 1]))
            cur.append((cx, cy))
            i += 2
        elif cmd == "C":
            x1, y1 = P(float(toks[i]), float(toks[i + 1]))
            x2, y2 = P(float(toks[i + 2]), float(toks[i + 3]))
            x3, y3 = P(float(toks[i + 4]), float(toks[i + 5]))
            i += 6
            span = (abs(x1 - cx) + abs(y1 - cy) + abs(x2 - x1) + abs(y2 - y1) + abs(x3 - x2) + abs(y3 - y2))
            n = max(1, min(24, int(span / max(eps, 0.25))))
            for s in range(1, n + 1):
                u = s / n
                v = 1 - u
                cur.append((v ** 3 * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u ** 3 * x3,
                            v ** 3 * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u ** 3 * y3))
            cx, cy = x3, y3
        else:
            raise ValueError(f"unhandled path command {cmd!r}")
    if cur:
        subpaths.append(cur)

    out, xs, ys = [], [], []
    px = py = None
    for sp in subpaths:
        if len(sp) < 3:
            continue
        # a closed ring: split at the point farthest from the start so RDP keeps both ends
        far = max(range(len(sp)), key=lambda j: (sp[j][0] - sp[0][0]) ** 2 + (sp[j][1] - sp[0][1]) ** 2)
        ring = _rdp(sp[:far + 1], eps)[:-1] + _rdp(sp[far:] + [sp[0]], eps)[:-1]
        pts = []
        for x, y in ring:
            q = (round(x), round(y))
            if not pts or q != pts[-1]:
                pts.append(q)
        # drop points that lie straight between their neighbours
        j = 1
        while 1 < len(pts) and j < len(pts) - 1:
            (ax, ay), (bx, by), (qx, qy) = pts[j - 1], pts[j], pts[j + 1]
            if (bx - ax) * (qy - ay) == (by - ay) * (qx - ax) and min(ax, qx) <= bx <= max(ax, qx) and min(ay, qy) <= by <= max(ay, qy):
                del pts[j]
            else:
                j += 1
        if len(pts) < 3:
            continue
        x0, y0 = pts[0]
        out.append(("M" + _fmt([x0, y0])) if px is None else ("m" + _fmt([x0 - px, y0 - py])))
        seg = "l"
        lx, ly = x0, y0
        for x, y in pts[1:]:
            s = _fmt([x - lx, y - ly])
            seg += ("" if seg == "l" or s.startswith("-") else " ") + s
            lx, ly = x, y
        out.append(seg + "z")
        px, py = x0, y0
        xs += [p[0] for p in pts]
        ys += [p[1] for p in pts]
    if not out:
        return "", (0, 0, 0, 0)
    return "".join(out), (min(xs), min(ys), max(xs), max(ys))


def load(svg_file, min_area=0, scale=1.0):
    svg = FsPath(svg_file).read_text(encoding="utf-8")
    w = round(int(re.search(r'width="(\d+)"', svg).group(1)) * scale)
    h = round(int(re.search(r'height="(\d+)"', svg).group(1)) * scale)
    paths = []
    for m in re.finditer(r"<path ([^>]*)/>", svg):
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        tx = ty = 0.0
        tr = attrs.get("transform", "")
        tm = re.search(r"translate\(([-\d.]+),\s*([-\d.]+)\)", tr)
        if tm:
            tx, ty = float(tm.group(1)), float(tm.group(2))
        if not re.search(r"\d", attrs.get("d", "")):
            continue
        if SIMPLIFY > 0:
            d, bbox = compact_rdp(attrs["d"], tx, ty, scale, SIMPLIFY)
            if not d:
                continue
        else:
            d, bbox = compact(attrs["d"], tx, ty, scale)
        p = Path(d, _short_hex(attrs.get("fill", "#000")), bbox)
        if p.area >= min_area:
            paths.append(p)
    return w, h, paths


def markup(paths, by_color=False):
    """Path elements. by_color merges every path of one fill into one element,
    which is only right for non-overlapping (cutout) traces; otherwise only runs
    of neighbours with the same fill are merged, keeping the stacking order."""
    if by_color:
        groups = {}
        for p in paths:
            groups.setdefault(p.fill, []).append(p.d)
        # a hairline stroke of the same color closes the seams between cut shapes
        return "".join(f'<path fill="{f}" stroke="{f}" d="{"".join(ds)}"/>' for f, ds in groups.items())
    out, run_fill, run = [], None, []
    for p in paths:
        if p.fill != run_fill and run:
            out.append(f'<path fill="{run_fill}" d="{"".join(run)}"/>')
            run = []
        run_fill = p.fill
        run.append(p.d)
    if run:
        out.append(f'<path fill="{run_fill}" d="{"".join(run)}"/>')
    return "".join(out)


if __name__ == "__main__":
    import sys
    w, h, ps = load(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0, float(os.environ.get("SVGOPT_SCALE", "1")))
    body = markup(ps, by_color=len(sys.argv) > 3 and sys.argv[3] == "cutout")
    if len(sys.argv) > 4:
        import resvg_py
        doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w * 2}" height="{h * 2}">'
               f'<rect width="{w}" height="{h}" fill="#2a1f1c"/><g stroke-width=".8" stroke-linejoin="round">{body}</g></svg>')
        FsPath(sys.argv[4]).write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=doc)))
    print(f"{sys.argv[1]}: {len(ps)} paths, {len(body):,} chars of path markup")
