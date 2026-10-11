# Where the site's assets came from

Nothing here is hot-linked; every file the site loads is in this folder. Everything not listed below
(the tiny pixel animations, the banners, the clock digits, the sounds) is drawn or synthesised by the
scripts in `site/js/`.

## Photographs

The lilacs are from Wikimedia Commons, released by their authors under CC0 (public domain dedication).
We cropped them, washed them out and ordered-dithered them to a ten-colour palette.

| File | Original | Author |
|---|---|---|
| `img/lilac.jpg`, `img/lilac-dither.png` | [FliederblueteH2a.jpg](https://commons.wikimedia.org/wiki/File:FliederblueteH2a.jpg) | Helge Klaus Rieder |
| `img/bud.jpg`, `img/bud-dither.png` | [FliederblueteH1b.jpg](https://commons.wikimedia.org/wiki/File:FliederblueteH1b.jpg) | Helge Klaus Rieder |
| `img/white-lilac.jpg`, `img/white-lilac-dither.png` | [FliederbluetreWeissH1c.jpg](https://commons.wikimedia.org/wiki/File:FliederbluetreWeissH1c.jpg) | Helge Klaus Rieder |
| `img/lilacs.jpg`, `img/lilacs-dither.png` | [Lilacs (215768905).jpeg](https://commons.wikimedia.org/wiki/File:Lilacs_(215768905).jpeg) | Elena Andreeva |
| `img/bunch.jpg`, `img/bunch-dither.png` | [Lilac Bunch.jpg](https://commons.wikimedia.org/wiki/File:Lilac_Bunch.jpg) | Martin Ehrensberger |

The two backgrounds are also CC0, found through Openverse and tinted by us:

| File | Original | Author |
|---|---|---|
| `img/bg-glass-light.jpg`, `img/bg-glass-dark.jpg` | [skywalk hallway, Crossrail Place roof](https://www.rawpixel.com/image/3302276/free-photo-image-banister-building-cc0) | rawpixel public domain collection (no author given) |
| `img/bg-hall-light.jpg`, `img/bg-hall-dark.jpg` | [A long, modern corridor with large windows on both sides](https://wordpress.org/photos/photo/84467dd2a3/) | Nilo Velez, WordPress Photo Directory |

`img/receipt.png` is a thumbnail of our own `docs/assets/sample-receipt.png`.

## Fonts

| File | Typeface | By | Licence |
|---|---|---|---|
| `fonts/basiic.ttf` | [Basiic](https://cinni.net/?z=/font) | Cinni | "free to use in any non-commercial way" (the author's fonts page) |
| `fonts/virale/virale.ttf` | [Virale](https://fontstruct.com/fontstructions/show/1112042) | Piratype | Creative Commons Attribution 3.0 |

Two conditions to keep in mind:

- **Basiic is non-commercial only.** Fine for a hackathon entry. If GroupCart is ever sold or run as a
  business, replace it or ask Cinni first.
- **Virale's `license.txt` and `readme.txt` must travel with the font file**, and Piratype must be
  credited. Both files are in `fonts/virale/`; the credit is on the site's credits page.

## Pointers

| File | Original | By | Licence |
|---|---|---|---|
| `cursor/arrow.*`, `cursor/link.*`, `cursor/text.*` | [Glass cursors](https://www.rw-designer.com/cursor-set/glass-3) (Normal, Link, Text) | Rando | Released to the public domain |

The `.cur` files are the originals; the `.png` files are the same images decoded, so the stylesheet can
give a hotspot and every browser has a format it accepts.

## The minion

`img/minion-source.png` is pixel art from Justin Weng, as he sent it. The site does not load that file:
`scripts/minion_sprite.py` cuts it out of its background, snaps it to a 100 x 113 grid and a 31-colour
palette, splits it into parts and writes them to `js/minion-sprite.js`, which `js/minion.js` animates.

It is a fan drawing. The Minions are characters of Universal and Illumination; GroupCart is not
affiliated with either.
