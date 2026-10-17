# Triple Stack

A top-down tile-matching puzzle for phone, tablet and desktop. Tap a tile that
nothing is sitting on, it goes to a five-slot tray, and three of a kind clear.
Fill the tray without a match and the level restarts.

**Play it:** https://thugonz.github.io/triple-stack/

On iOS/iPadOS, open that link in Safari and tap Share → *Add to Home Screen* to
install it as a full-screen app that works offline.

---

## This repo

This is the **web prototype** — one self-contained HTML file plus a service
worker, used to settle the game design before the Godot port. The level data and
the generator here are the real assets and carry over unchanged.

| Path | What it is |
|---|---|
| `index.html` | The whole game. No build step, no dependencies. |
| `sw.js` | Service worker — offline app shell. |
| `manifest.webmanifest` | PWA manifest. |
| `tools/gen_levels.py` | Generates all 100 levels. The difficulty curve lives in `curve()`. |
| `tools/levels.json` | The generated level pack the game ships with. |
| `tools/validate_pack.js` | Correctness gate — must stay green. |
| `tools/difficulty.js` | Simulates a competent player to measure win rates per level. |

## How levels work

Tiles sit on a **half-tile grid**: a tile at `(gx, gy)` occupies `gx..gx+1` and
`gy..gy+1`, so two tiles overlap when `|dgx| < 2 && |dgy| < 2`. A tile is
blocked only by tiles *above* it that overlap its footprint — never by
neighbours.

Each layer sits on its own lattice, offset from the layer below. That offset is
the whole difficulty mechanic:

| Offset | Effect |
|---|---|
| `(1,1)` | straddles four tiles — four partial peeks |
| `(1,0)` / `(0,1)` | straddles two |
| `(0,0)` | sits dead-centre — **the tile below is completely invisible** |

Difficulty grows by depth, not width. The largest board (level 100: 126 tiles,
9 layers) is only 336×408 px unscaled, so it still fits a phone.

Across the 100 levels: 18 → 126 tiles, 2 → 9 layers, 6 → 25 symbols, 0% → ~50%
hidden tiles, with a new tile design introduced every 5 levels.

## Every board is provably clearable

Symbols are assigned by a **forward peel**: repeatedly take three tiles that are
free *at the same moment*, stamp them with a shared symbol, remove them. The
removal order is itself a valid solve order, and it only ever needs three tray
slots — so any tray of three or more can clear the board.

Regenerate and re-check with:

```bash
python3 tools/gen_levels.py     # writes levels.json
node tools/validate_pack.js     # must report PROBLEMS: 0
node tools/difficulty.js        # win-rate estimates per level
```

`validate_pack.js` checks every level for: tile count divisible by 3, no
same-layer overlaps, every raised tile supported from below, the in-game
generator succeeding across 25 seeds, and an exhaustive 5-slot solve on a
sample.

## Status

Prototype. Emoji stand in for real tile art. Next up is the Godot 4 port
targeting iOS, Android, Windows and macOS.
