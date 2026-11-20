**English** | [简体中文](README.zh-CN.md)

# Art tools

These scripts build every drawing the plugin shows — the opening, her resting layers, the
moving figures for her entrance and outfit change — from the original images in `source/`,
as pure vector SVG.

## Setup (once)

You need Python 3.11 or later. From the repository's top folder:

```
python -m venv .venv
.venv\Scripts\pip install -r art/requirements.txt        (Windows)
.venv/bin/pip install -r art/requirements.txt            (macOS / Linux)
```

## Rebuild

From the repository's top folder, with the environment's Python:

```
python art/scripts/prep.py art
python art/scripts/compose.py art --plugin plugin
```

1. **`prep.py`** crops the front-facing figure out of each character sheet, keys out the white
   page, and prepares the wordmark: `art/build/front-dress.png`, `front-maid.png`, `logo.png`.
2. **`compose.py`** traces them into vectors (cached in `art/build/final/`), simplifies the
   outlines, lays out the scenes and animations, checks every drawing against the app's size
   limits, and writes:
   - `plugin/hooks/art/*.ts` and `plugin/hooks/scenes.ts` — the drawings the plugin shows
   - `art/build/scenes/*.png` — stills to look at

With the cache in `art/build/final/` (committed to the repository), a rebuild takes about a
minute and reproduces the shipped drawings exactly. Add `--retrace` to trace the images again
from scratch (needed after changing `source/` or the tracing settings; it takes a few
minutes).

## Files

| File | What it does |
|---|---|
| `scripts/prep.py` | Crops and keys the source images |
| `scripts/trace.py` | Traces a PNG into SVG with vtracer (used by compose.py) |
| `scripts/svgopt.py` | Shrinks a traced SVG: relative path data, specks dropped, outlines simplified |
| `scripts/compose.py` | Builds all scenes and animations and writes them into the plugin |
| `scripts/gaps.py` | A diagnostic: lists near-white areas still opaque after keying |
| `source/` | The original images (AI-generated): two character sheets and the wordmark |
| `build/final/` | The traced vectors compose.py starts from (cache, committed) |

## The app's limits

The Claude desktop app draws each drawing up to **131,072 characters** and refuses a whole
background past a fixed total (between about 220,000 and 325,000 characters), with no error.
compose.py stops with a message if a drawing is over the first; keep the whole resting scene
(ground, her layers, petals) under about 220,000 characters — it prints each total.

Animations play only in the one-off "moving" drawings (the opening, her entrance and outfit
change): their CSS must rest on the same picture the still layers show, because the app shows
a still copy of each moving drawing as it ends.

## Adding an outfit or pose

1. Add the new character sheet to `source/`, with the figure facing front on a white page.
2. In `prep.py`, add its crop; in `compose.py`, add it next to `"dress"` and `"maid"`.
3. Rebuild with `--retrace`, look at the stills in `art/build/scenes/`, and wire the new
   outfit into `plugin/hooks/register.tsx` (the `Outfit` type, the menu and the commands).

## License

The images in `source/`, `build/final/` and everything generated from them are under
[CC BY-NC 4.0](../LICENSE-ART.md) (no selling); the scripts are under [MIT](../LICENSE).
