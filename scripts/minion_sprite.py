#!/usr/bin/env python3
"""Turn the minion picture into pixel data the site can animate.

    python3 scripts/minion_sprite.py            # needs Pillow and numpy

Reads site/assets/img/minion-source.png and writes site/js/minion-sprite.js:
the picture cut out of its white background, snapped to a 100 x 113 pixel grid
and a 30-colour palette, then split into layers (body, two arms, two legs,
mouth, two pupils) with a pivot for each limb and a mask for each eye, so
site/js/minion.js can move the parts separately.

The cut lines and eye positions below were read off this particular drawing.
A new drawing needs new numbers; --preview writes a picture to check them by.
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site" / "assets" / "img" / "minion-source.png"
OUTPUT = ROOT / "site" / "js" / "minion-sprite.js"

WIDTH, HEIGHT, COLOURS = 100, 113, 30
OUTLINE = (10, 10, 12)
CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

# ---- where the parts are, in sprite pixels ---------------------------------
# Limbs: a predicate for "this pixel belongs to the limb" and the joint it turns on.
LEG_L_EDGE = {83: 35, 84: 37, 85: 37, 86: 37, 87: 37, 88: 39, 89: 39, 90: 41, 91: 41}


def arm_l(x: int, y: int) -> bool:        # the waving arm, on the left of the picture
    return 10 <= y <= 56 and x <= (26 if y < 40 else 29)


def arm_r(x: int, y: int) -> bool:
    if not 51 <= y <= 86:
        return False
    return x >= {51: 74, 52: 74, 53: 74, 54: 74, 55: 75, 56: 76, 57: 78}.get(y, 80)


def leg_l(x: int, y: int) -> bool:
    return y >= 83 and x <= LEG_L_EDGE.get(y, 43)


def leg_r(x: int, y: int) -> bool:
    return (y >= 92 and x >= 58) or (89 <= y < 92 and x >= 59)


LIMBS = {
    "legL": (leg_l, (36, 84)),
    "legR": (leg_r, (62, 89)),
    "armR": (arm_r, (75, 54)),
    "armL": (arm_l, (30, 49)),
}
# Eyes: the lens ellipse (cx, cy, rx, ry) and the pupil's box (x0, y0, x1, y1), inclusive.
LENS = {"L": (41.0, 31.5, 7.3, 7.7), "R": (61.5, 33.0, 7.7, 8.2)}
PUPIL = {"L": (40, 28, 45, 35), "R": (60, 30, 65, 37)}
MOUTH = (42, 47, 59, 56)                  # columns and rows to search for the mouth
SKIN_SAMPLE = (56, 12)                    # a pixel of plain yellow, for the eyelids


def cut_out(source: Image.Image) -> np.ndarray:
    """RGBA array with the white surround made transparent. White inside the drawing stays."""
    rgb = np.asarray(source.convert("RGB")).astype(np.int16)
    height, width = rgb.shape[:2]
    near_white = rgb.min(-1) >= 232
    background = np.zeros((height, width), bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.extend(((0, x), (height - 1, x)))
    for y in range(height):
        queue.extend(((y, 0), (y, width - 1)))
    while queue:
        y, x = queue.popleft()
        if not (0 <= y < height and 0 <= x < width) or background[y, x] or not near_white[y, x]:
            continue
        background[y, x] = True
        queue.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    ys, xs = np.where(~background)
    rgba = np.dstack([rgb.astype(np.uint8), np.where(background, 0, 255).astype(np.uint8)])
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def pixelate(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Snap to the pixel grid and a small palette. Returns (H x W x 3 colours, H x W opaque)."""
    small = np.asarray(Image.fromarray(rgba, "RGBA").resize((WIDTH, HEIGHT), Image.BOX))
    opaque = small[..., 3] >= 128
    quantised = Image.fromarray(small[..., :3], "RGB").quantize(COLOURS, method=Image.MEDIANCUT, dither=Image.NONE)
    palette = np.array(quantised.getpalette()[:COLOURS * 3]).reshape(-1, 3)
    colours = palette[np.asarray(quantised)]
    # The drawing has a black line all the way round it; cutting it out left that line soft
    # and tinted in places. Any pixel on the silhouette that is not already dark becomes line.
    padded = np.pad(opaque, 1)
    on_edge = opaque & ~(padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:])
    luma = colours @ np.array([0.299, 0.587, 0.114])
    colours[on_edge & (luma > 60)] = OUTLINE
    return colours, opaque


def ellipse(cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH]
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1.0


def fill_rows(colours: np.ndarray, hole: np.ndarray, within: np.ndarray) -> None:
    """Paint over `hole` row by row, blending from the pixel on its left to the one on its right."""
    for y in np.unique(np.where(hole)[0]):
        xs = np.where(hole[y])[0]
        left, right = xs.min() - 1, xs.max() + 1
        a = colours[y, left] if within[y, left] and not hole[y, left] else None
        b = colours[y, right] if within[y, right] and not hole[y, right] else None
        a, b = (a if a is not None else b), (b if b is not None else a)
        if a is None:
            continue
        for x in xs:
            t = (x - left) / (right - left)
            colours[y, x] = np.round(a * (1 - t) + b * t)


def build() -> dict:
    colours, opaque = pixelate(cut_out(Image.open(SOURCE)))
    colours = colours.astype(float)
    luma = colours @ np.array([0.299, 0.587, 0.114])
    dark = opaque & (luma < 60)
    skin = opaque & (colours[..., 0] > 190) & (colours[..., 1] > 150) & (colours[..., 2] < 140)
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH]

    limb_masks = {name: opaque & np.vectorize(inside)(xx, yy) for name, (inside, _) in LIMBS.items()}

    eyes, pupil_masks = {}, {}
    for side in "LR":
        x0, y0, x1, y1 = PUPIL[side]
        pupil = ellipse((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (x1 - x0 + 1) / 2 + 0.35, (y1 - y0 + 1) / 2 + 0.35)
        lens = ellipse(*LENS[side]) & opaque & ~(dark & ~pupil)     # inside the ring, not the ring itself
        pupil_masks[side] = pupil & lens
        eyes[side] = {"lens": lens, "centre": [LENS[side][0], LENS[side][1]],
                      "pupil": [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2]}

    mx0, my0, mx1, my1 = MOUTH
    mouth = np.zeros((HEIGHT, WIDTH), bool)
    for y in range(my0, my1 + 1):
        xs = np.where(opaque[y, mx0:mx1 + 1] & ~skin[y, mx0:mx1 + 1])[0] + mx0
        if len(xs) == 0:
            continue
        if y <= my0 + 1:
            mouth[y, xs] = True                      # only the corners of the smile up here
        else:
            mouth[y, xs.min():xs.max() + 1] = True

    def key(c) -> tuple[int, int, int]:
        return tuple(int(v) for v in c)

    original = colours.copy()
    palette = sorted({key(c) for c in original[opaque]}, key=lambda c: (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], c))
    index = {c: i for i, c in enumerate(palette)}
    swatches = np.array(palette, float)

    def snap(hole: np.ndarray) -> None:
        """Pull freshly painted pixels back onto the palette, so the sprite keeps its few flat colours."""
        for y, x in zip(*np.where(hole)):
            colours[y, x] = swatches[((swatches - colours[y, x]) ** 2).sum(-1).argmin()]

    # the body layer has clean whites where the pupils were and skin where the mouth was
    for side in "LR":
        fill_rows(colours, pupil_masks[side], eyes[side]["lens"])
        snap(pupil_masks[side])
    fill_rows(colours, mouth, opaque)
    snap(mouth)

    def layer(source: np.ndarray, mask: np.ndarray, **extra) -> dict:
        ys, xs = np.where(mask)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
        rows = ["".join(CHARS[index[key(source[y, x])]] if mask[y, x] else "." for x in range(x0, x1 + 1))
                for y in range(y0, y1 + 1)]
        return {"x": x0, "y": y0, "rows": rows, **extra}

    limbs_all = np.zeros((HEIGHT, WIDTH), bool)
    for mask in limb_masks.values():
        limbs_all |= mask
    layers = {"body": layer(colours, opaque & ~limbs_all)}
    for name, (_, pivot) in LIMBS.items():
        layers[name] = layer(original, limb_masks[name], pivot=list(pivot))
    layers["mouth"] = layer(original, mouth)
    for side in "LR":
        layers["pupil" + side] = layer(original, pupil_masks[side])

    def mask_rows(mask: np.ndarray) -> dict:
        ys, xs = np.where(mask)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
        return {"x": x0, "y": y0, "rows": ["".join("#" if mask[y, x] else "." for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]}

    return {
        "width": WIDTH, "height": HEIGHT,
        "palette": ["#%02x%02x%02x" % c for c in palette],
        "skin": "#%02x%02x%02x" % key(original[SKIN_SAMPLE[1], SKIN_SAMPLE[0]]),
        "order": ["legL", "legR", "body", "armR", "armL"],
        "layers": layers,
        "eyes": {side: {"lens": mask_rows(eyes[side]["lens"]), "centre": eyes[side]["centre"], "pupil": eyes[side]["pupil"]}
                 for side in "LR"},
        "_debug": {"original": original, "opaque": opaque, "limbs": limb_masks, "eyes": eyes, "pupils": pupil_masks, "mouth": mouth},
    }


def write(data: dict) -> None:
    debug = data.pop("_debug")
    lines = [
        "/* Generated by scripts/minion_sprite.py from site/assets/img/minion-source.png. Do not edit by hand.",
        "   The minion as pixel data: a palette, and one grid of palette characters per movable part.",
        "   '.' is empty; every other character indexes `chars`, which lines up with `palette`. */",
        "window.GCMinionSprite = {",
        f"    width: {data['width']},",
        f"    height: {data['height']},",
        f"    chars: {json.dumps(CHARS[:len(data['palette'])])},",
        f"    palette: {json.dumps(data['palette'])},",
        f"    skin: {json.dumps(data['skin'])},",
        f"    order: {json.dumps(data['order'])},",
        "    layers: {",
    ]
    for name, part in data["layers"].items():
        head = f"x: {part['x']}, y: {part['y']}" + (f", pivot: {json.dumps(part['pivot'])}" if "pivot" in part else "")
        lines.append(f"        {name}: {{ {head}, rows: [")
        lines.extend(f"            {json.dumps(row)}," for row in part["rows"])
        lines.append("        ] },")
    lines.append("    },")
    lines.append("    eyes: {")
    for side, eye in data["eyes"].items():
        lines.append(f"        {side}: {{ centre: {json.dumps(eye['centre'])}, pupil: {json.dumps(eye['pupil'])}, "
                     f"lens: {{ x: {eye['lens']['x']}, y: {eye['lens']['y']}, rows: [")
        lines.extend(f"            {json.dumps(row)}," for row in eye["lens"]["rows"])
        lines.append("        ] } },")
    lines.append("    },")
    lines.append("};")
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    data["_debug"] = debug


def preview(data: dict, path: Path) -> None:
    """The sprite, nine times life size, with each part tinted, to check the cut lines by eye."""
    debug = data["_debug"]
    view = debug["original"].copy()
    tints = {"armL": (255, 0, 0), "armR": (0, 160, 255), "legL": (0, 200, 0), "legR": (255, 0, 255)}
    for name, mask in debug["limbs"].items():
        view[mask] = view[mask] * 0.5 + np.array(tints[name]) * 0.5
    for side in "LR":
        lens, pupil = debug["eyes"][side]["lens"], debug["pupils"][side]
        view[lens & ~pupil] = view[lens & ~pupil] * 0.5 + np.array((0, 255, 255)) * 0.5
        view[pupil] = view[pupil] * 0.4 + np.array((255, 120, 0)) * 0.6
    view[debug["mouth"]] = view[debug["mouth"]] * 0.5 + np.array((255, 255, 0)) * 0.5
    rgba = np.dstack([view.clip(0, 255).astype(np.uint8), np.where(debug["opaque"], 255, 0).astype(np.uint8)])
    backdrop = Image.new("RGB", (WIDTH * 9, HEIGHT * 9), (150, 190, 175))
    big = Image.fromarray(rgba, "RGBA").resize((WIDTH * 9, HEIGHT * 9), Image.NEAREST)
    backdrop.paste(big, (0, 0), big)
    backdrop.save(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--preview", type=Path, help="also write a tinted picture of the parts to this path")
    args = parser.parse_args()
    sprite = build()
    write(sprite)
    print(f"wrote {OUTPUT.relative_to(ROOT)}: {sprite['width']}x{sprite['height']}, {len(sprite['palette'])} colours, "
          f"{len(sprite['layers'])} layers")
    if args.preview:
        preview(sprite, args.preview)
        print(f"wrote {args.preview}")
