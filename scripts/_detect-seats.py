"""Detect seat blobs on the Drukair A320neo seating graphic."""
from __future__ import annotations

import json
from collections import deque

from PIL import Image
import colorsys

SRC = r"public\seats\drukair-a320neo.png"
im = Image.open(SRC).convert("RGB")
w, h = im.size
px = im.load()

mask = [[0] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hue = hh * 360
        if s < 0.28 or v < 0.25 or v > 0.98:
            continue
        if 5 <= hue <= 45:
            mask[y][x] = 1  # business orange
        elif 200 <= hue <= 250:
            mask[y][x] = 2  # economy blue (incl bassinet light blue)


def blobs(kind: int, min_area: int):
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] != kind or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            xs, ys = [], []
            while q:
                cx, cy = q.popleft()
                xs.append(cx)
                ys.append(cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and mask[ny][nx] == kind:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            area = len(xs)
            if area < min_area:
                continue
            minx, maxx = min(xs), max(xs)
            miny, maxy = min(ys), max(ys)
            bw, bh = maxx - minx + 1, maxy - miny + 1
            aspect = bw / max(1, bh)
            if aspect < 0.45 or aspect > 2.4:
                continue
            if bw < 8 or bh < 8 or bw > 80 or bh > 80:
                continue
            out.append(
                {
                    "kind": "business" if kind == 1 else "economy",
                    "cx": (minx + maxx) / 2 / w,
                    "cy": (miny + maxy) / 2 / h,
                    "x": minx / w,
                    "y": miny / h,
                    "w": bw / w,
                    "h": bh / h,
                    "area": area,
                    "px": ((minx + maxx) / 2, (miny + maxy) / 2),
                }
            )
    return out


biz = blobs(1, 40)
eco = blobs(2, 40)
print("business blobs", len(biz), "economy blobs", len(eco), "total", len(biz) + len(eco))

all_seats = biz + eco
all_seats.sort(key=lambda s: (s["cy"], s["cx"]))

# cluster into rows by Y
rows = []
for s in all_seats:
    if not rows or abs(s["cy"] - rows[-1][0]["cy"]) > 0.012:
        rows.append([s])
    else:
        rows[-1].append(s)
for r in rows:
    r.sort(key=lambda s: s["cx"])

print("row count", len(rows))
for i, r in enumerate(rows):
    kinds = ",".join(s["kind"][0] for s in r)
    xs = " ".join(f"{s['cx']:.3f}" for s in r)
    print(f"row {i:02d} n={len(r)} {kinds}  {xs}")

payload = {
    "width": w,
    "height": h,
    "rows": [
        [
            {
                "kind": s["kind"],
                "x": round(s["x"], 5),
                "y": round(s["y"], 5),
                "w": round(s["w"], 5),
                "h": round(s["h"], 5),
                "cx": round(s["cx"], 5),
                "cy": round(s["cy"], 5),
            }
            for s in r
        ]
        for r in rows
    ],
}
with open("scripts/_seat-blobs.json", "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
print("wrote scripts/_seat-blobs.json")
