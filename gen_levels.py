#!/usr/bin/env python3
"""
Triple Stack — level pack generator.

DESIGN
  Difficulty grows by DEPTH, not footprint. Base footprints stay phone-sized
  (<= 6x6 tiles); later levels add layers and, crucially, more layers whose
  lattice offset is (0,0) — a tile sitting exactly on the tile below, which
  hides it completely except for its edge sliver.

GEOMETRY
  Half-tile grid: a tile at (gx,gy) occupies gx..gx+1, gy..gy+1.
  Two tiles overlap iff |dgx| < 2 and |dgy| < 2.
  Every tile in one layer sits on that layer's own step-2 lattice, so
  same-layer overlap is structurally impossible.
  A layer's lattice origin = previous layer's origin + offset, where
    (0,0) -> sits dead-centre on the tile below  => that tile is HIDDEN
    (1,1) -> straddles 4 tiles below             => 4 partial peeks
    (1,0) / (0,1) -> straddles 2 tiles below     => 2 partial peeks

GUARANTEES CHECKED FOR EVERY LEVEL
  tile count % 3 == 0 · no same-layer overlap · every upper tile supported
  from below · "peelable" (>=3 free tiles at every step, so the forward-peel
  symbol assignment always succeeds, which means the board is always solvable
  with a tray of 3 or more slots)
"""
import json, random
from collections import defaultdict

# ---------------------------------------------------------------- geometry ---

def overlaps(a, b):
    return abs(a[0] - b[0]) < 2 and abs(a[1] - b[1]) < 2


def free_tiles(tiles):
    """tiles: list of (gx,gy,layer). Returns those no higher tile overlaps."""
    out = []
    for t in tiles:
        covered = False
        for u in tiles:
            if u[2] > t[2] and overlaps(t, u):
                covered = True
                break
        if not covered:
            out.append(t)
    return out


def peelable(tiles, min_free=3):
    """Can we repeatedly remove 3 free tiles until empty? (=> solvable)"""
    alive = list(tiles)
    while alive:
        fr = free_tiles(alive)
        if len(fr) < min_free:
            return False
        # remove a spread-out triple: take from the front of a shuffled list
        random.shuffle(fr)
        drop = set(fr[:3])
        alive = [t for t in alive if t not in drop]
    return True


def hidden_count(tiles):
    """Tiles fully eclipsed by a tile sitting exactly on top of them."""
    pos = {(t[0], t[1], t[2]) for t in tiles}
    return sum(1 for (gx, gy, l) in tiles if (gx, gy, l + 1) in pos)


# ------------------------------------------------------------ shape masks ---
# Each returns a set of (col,row) on a cols x rows lattice.

def m_full(c, r):
    return {(x, y) for x in range(c) for y in range(r)}

def m_ring(c, r):
    return {(x, y) for x in range(c) for y in range(r)
            if x in (0, c - 1) or y in (0, r - 1)}

def m_diamond(c, r):
    cx, cy = (c - 1) / 2, (r - 1) / 2
    rad = (c + r) / 4 + 0.35
    return {(x, y) for x in range(c) for y in range(r)
            if abs(x - cx) + abs(y - cy) <= rad}

def m_cross(c, r):
    mx, my = c // 2, r // 2
    band_x = {mx} if c % 2 else {mx - 1, mx}
    band_y = {my} if r % 2 else {my - 1, my}
    return {(x, y) for x in range(c) for y in range(r)
            if x in band_x or y in band_y}

def m_hourglass(c, r):
    out = set()
    for y in range(r):
        d = abs(y - (r - 1) / 2)
        inset = int(round(((r - 1) / 2 - d) * (c / 2) / max((r - 1) / 2, 1)))
        inset = min(inset, (c - 1) // 2)
        for x in range(inset, c - inset):
            out.add((x, y))
    return out

def m_butterfly(c, r):
    out = set()
    for y in range(r):
        d = abs(y - (r - 1) / 2)
        wing = int(round(d * (c / 2) / max((r - 1) / 2, 1)))
        for x in range(c):
            if x < wing or x >= c - wing or x in (c // 2, (c - 1) // 2):
                out.add((x, y))
    return out

def m_bridge(c, r):
    """Two towers with a span across the middle rows."""
    out = set()
    span = {(r - 1) // 2, r // 2}
    for y in range(r):
        for x in range(c):
            if x <= 0 or x >= c - 1 or y in span:
                out.add((x, y))
    return out

def m_pillars(c, r):
    return {(x, y) for x in range(c) for y in range(r) if x % 2 == 0}

def m_stair(c, r):
    return {(x, y) for x in range(c) for y in range(r) if x + y >= min(c, r) - 1}

def m_pinwheel(c, r):
    out = set()
    mx, my = (c - 1) / 2, (r - 1) / 2
    for x in range(c):
        for y in range(r):
            if (x <= mx and y <= my and (x == 0 or y == my)) or \
               (x >= mx and y <= my and (y == 0 or x == mx)) or \
               (x >= mx and y >= my and (x == c - 1 or y == my)) or \
               (x <= mx and y >= my and (y == r - 1 or x == mx)):
                out.add((x, y))
    return out

def m_lattice(c, r):
    return {(x, y) for x in range(c) for y in range(r)
            if (x + y) % 2 == 0 or x in (0, c - 1) or y in (0, r - 1)}


CHAPTERS = [
    ("Foundations", [m_full, m_stair]),
    ("Terraces",    [m_full, m_diamond]),
    ("Rings",       [m_ring, m_lattice]),
    ("Crossroads",  [m_cross, m_full]),
    ("Facets",      [m_diamond, m_lattice]),
    ("Spans",       [m_bridge, m_full]),
    ("Hourglass",   [m_hourglass, m_butterfly]),
    ("Colonnade",   [m_pillars, m_ring]),
    ("Pinwheel",    [m_pinwheel, m_cross]),
    ("The Citadel", [m_full, m_diamond, m_ring]),
]

BASE_SYMBOLS = 10

# How many designs appear on ONE board, per level. Calibrated by simulation
# against a target difficulty curve (see tools/calibrate.js); empty = use the
# smooth fallback formula in curve().
BOARD_SYMBOLS = [
    9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 11, 10, 11, 12, 10,
    12, 12, 11, 12, 12, 12, 12, 12, 12, 12, 12, 10, 11, 12, 12, 11, 12, 12, 11, 12,
    12, 13, 12, 13, 11, 13, 11, 11, 13, 12, 12, 13, 12, 13, 13, 13, 12, 13, 13, 12,
    11, 13, 13, 14, 12, 14, 12, 13, 13, 14, 12, 14, 14, 13, 13, 13, 14, 14, 12, 13,
    12, 13, 14, 12, 12, 12, 14, 13, 13, 14, 15, 15, 13, 13, 15, 13, 13, 13, 14, 13,
]
# All Unicode 6.0 / Emoji 1.0, single codepoint, no variation selectors.
# 30 designs: enough for a catalogue that starts at 10 and adds one every
# 5 levels. Placeholder art until the real sprites land.

SYMBOLS = ["🍎","🍌","🍇","🍉","🍋","🍓","🍍","🍑","🌽","🍄","🌰","🍒","🍈",
           "🍊","🍐","🍠","🍞","🍩","🍪","🍫","🍬","🍭","🍯","🍦","🍰","🍕"]
# All Unicode 6.0 / Emoji 1.0, single codepoint, no variation selectors:
# every system emoji font has had these for over a decade. Placeholder art.


# ------------------------------------------------------------ level build ---

def curve(n):
    """Difficulty parameters for level n (1..100).

    Two separate symbol counts:
      catalogue — how many designs have been INTRODUCED by now (6 -> 25, one
                  every 5 levels). This is the variety/reward curve.
      board     — how many designs appear on THIS board (5 -> 14). This is the
                  difficulty curve, and it is the dominant one.

    They are separate because the forward peel stamps a symbol onto three tiles
    that are free at the same moment. Many symbols => each gets ~1 triple and
    its tiles sit together, which is EASY. Few symbols => each gets many triples
    assigned at widely separated moments, scattered through the stack, which is
    hard. So more designs on one board makes the game easier, not harder.
    """
    t = (n - 1) / 99.0                                  # 0..1
    target = int(round(30 + (126 - 30) * (t ** 1.05)))  # 30 -> 126 tiles
    target -= target % 3
    layers = 2 + int(round((t ** 0.85) * 7))            # 2 -> 9 layers
    f = min(1.0, t / 0.55)                              # footprint maxes at ~L55
    cols = 5 + int(round(f * 1))                        # 5 -> 6 tiles wide
    rows = 4 + int(round(f * 2))                        # 4 -> 6 tiles tall
    hide_share = 0.0 if n < 8 else min(0.68, (((n - 8) / 92.0) ** 0.95) * 0.76)
    catalogue = min(len(SYMBOLS), BASE_SYMBOLS + (n - 1) // 5)   # 6 -> 25
    board = (BOARD_SYMBOLS[n - 1] if BOARD_SYMBOLS
             else 5 + int(round(t * 9)))
    return cols, rows, target, layers, hide_share, catalogue, board


def board_pool(n, catalogue, board, _unused=None):
    """Pick this board's designs out of the unlocked catalogue.

    The design introduced on this level is always included, so the "new tile"
    moment still lands. The rest rotate per level so neighbouring levels do not
    look like the same board twice.
    """
    rng = random.Random(n * 7777)          # own stream: geometry stays fixed
    k = min(board, catalogue)
    idx = list(range(catalogue))
    rng.shuffle(idx)
    chosen = []
    if n % 5 == 1 and n > 1:
        newest = catalogue - 1
        chosen.append(newest)
        idx.remove(newest)
    chosen += idx[:max(0, k - len(chosen))]
    return [SYMBOLS[i] for i in sorted(chosen)]


def layer_sizes(base, L, target):
    """A non-increasing sequence of L layer sizes summing to exactly target."""
    lo, hi = 0.30, 1.0
    for _ in range(50):
        q = (lo + hi) / 2
        if sum(max(3, round(base * q ** k)) for k in range(L)) < target:
            lo = q
        else:
            hi = q
    q = (lo + hi) / 2
    sizes = [min(base, max(3, round(base * q ** k))) for k in range(L)]
    i = L - 1
    while sum(sizes) > target and i >= 0:
        if sizes[i] > 3:
            sizes[i] -= 1
        else:
            i -= 1
    i = 0
    guard = 0
    while sum(sizes) < target and guard < 10000:
        if sizes[i] < (base if i == 0 else sizes[i - 1]):
            sizes[i] += 1
        i = (i + 1) % L
        guard += 1
    return sizes


def build(n, rng):
    cols, rows, target, L, hide_share, catalogue, board = curve(n)
    pool = board_pool(n, catalogue, board)
    chap = CHAPTERS[(n - 1) // 10]

    base_mask = rng.choice(chap[1])(cols, rows)
    if len(base_mask) < 6:
        base_mask = m_full(cols, rows)
    base = len(base_mask)
    L = max(L, -(-target // base))          # need at least this many layers
    sizes = layer_sizes(base, L, target)

    # Which upper layers stack DEAD-CENTRE (hiding the tile beneath completely).
    upper = L - 1
    n_hide = int(round(upper * hide_share))
    if n >= 10 and upper >= 2:
        n_hide = max(1, n_hide)             # the mechanic shows up from level 10
    n_hide = min(n_hide, upper)
    # spread them evenly rather than clumping, with a little per-level jitter
    # Bias dead-centre layers toward the BOTTOM of the stack: lower layers are
    # wider, so a hidden layer down there buries more tiles, and burying them
    # deep is what actually forces the player to plan.
    if n_hide:
        weights = [(upper - i) ** 1.6 for i in range(upper)]
        picks = set()
        slots = list(range(upper))
        for _ in range(n_hide):
            tot = sum(weights[i] for i in slots)
            r = rng.random() * tot
            acc = 0.0
            for i in slots:
                acc += weights[i]
                if r <= acc:
                    picks.add(i)
                    slots.remove(i)
                    break
    else:
        picks = set()
    # the first upper layer stays offset early on, so the idea is taught gently
    if n < 18 and 0 in picks and len(picks) < upper:
        picks.discard(0)
        for i in range(1, upper):
            if i not in picks:
                picks.add(i)
                break

    layer_tiles = [{(2 * x, 2 * y) for (x, y) in base_mask}]
    origins = [(0, 0)]
    drift = 0

    for k in range(upper):
        if k in picks:
            choice = (0, 0)
        else:
            opts = [(1, 1), (1, 0), (0, 1)] if drift <= 1 else [(-1, -1), (-1, 0), (0, -1)]
            choice = rng.choice(opts)
            drift += 1 if (choice[0] > 0 or choice[1] > 0) else -1

        prev = layer_tiles[-1]
        po = origins[-1]
        no = (po[0] + choice[0], po[1] + choice[1])

        cand, seen = [], set()
        for (gx, gy) in prev:
            for dx in (-2, 0, 2):
                for dy in (-2, 0, 2):
                    cx, cy = gx + choice[0] + dx, gy + choice[1] + dy
                    if ((cx - no[0]) % 2) or ((cy - no[1]) % 2) or (cx, cy) in seen:
                        continue
                    if any(overlaps((cx, cy), p) for p in prev):
                        seen.add((cx, cy))
                        cand.append((cx, cy))
        if len(cand) < 3:
            break

        want = min(sizes[k + 1], len(cand), len(prev))
        if want < 3:
            break
        cx0 = sum(c[0] for c in cand) / len(cand)
        cy0 = sum(c[1] for c in cand) / len(cand)
        cand.sort(key=lambda c: (abs(c[0] - cx0) + abs(c[1] - cy0), rng.random()))
        layer_tiles.append(set(cand[:want]))
        origins.append(no)

    tiles = [(gx, gy, l) for l, cells in enumerate(layer_tiles) for (gx, gy) in sorted(cells)]

    # Short of target? Add dead-centre caps on top until we reach it.
    guard = 0
    while len(tiles) < target and guard < 14:
        guard += 1
        top = max(t[2] for t in tiles)
        band = [t for t in tiles if t[2] == top]
        if len(band) < 3:
            break
        need = min(target - len(tiles), len(band))
        if need < 3:
            break
        mx = sum(t[0] for t in band) / len(band)
        my = sum(t[1] for t in band) / len(band)
        band.sort(key=lambda t: (abs(t[0] - mx) + abs(t[1] - my), t[0], t[1]))
        for t in band[:need]:
            tiles.append((t[0], t[1], top + 1))

    def strip(ts, count):
        for _ in range(count):
            if not ts:
                break
            top = max(t[2] for t in ts)
            b = [t for t in ts if t[2] == top]
            mx = sum(t[0] for t in b) / len(b)
            my = sum(t[1] for t in b) / len(b)
            b.sort(key=lambda t: -(abs(t[0] - mx) + abs(t[1] - my)))
            ts.remove(b[0])
        return ts

    if len(tiles) > target:
        strip(tiles, len(tiles) - target)

    changed = True
    while changed:
        changed = False
        bylayer = defaultdict(list)
        for t in tiles:
            bylayer[t[2]].append(t)
        for t in list(tiles):
            if t[2] and not any(overlaps(t, u) for u in bylayer[t[2] - 1]):
                tiles.remove(t)
                changed = True
    while len(tiles) % 3:
        strip(tiles, 1)

    return tiles, chap[0], pool, catalogue


def to_layers(tiles):
    """Emit compact per-layer ASCII blocks."""
    bylayer = defaultdict(list)
    for (gx, gy, l) in tiles:
        bylayer[l].append((gx, gy))
    out = []
    for l in sorted(bylayer):
        cells = bylayer[l]
        ox = min(c[0] for c in cells)
        oy = min(c[1] for c in cells)
        w = (max(c[0] for c in cells) - ox) // 2 + 1
        h = (max(c[1] for c in cells) - oy) // 2 + 1
        grid = [["." for _ in range(w)] for _ in range(h)]
        for (gx, gy) in cells:
            grid[(gy - oy) // 2][(gx - ox) // 2] = "X"
        out.append({"ox": ox, "oy": oy, "rows": ["".join(r) for r in grid]})
    return out


# ------------------------------------------------------------------- main ---

def main():
    levels, report, problems = [], [], []
    for n in range(1, 101):
        for attempt in range(60):
            rng = random.Random(n * 1000 + attempt)
            tiles, chname, pool, catalogue = build(n, rng)
            if len(tiles) < 18 or len(tiles) % 3:
                continue
            # same-layer overlap must be impossible
            bad = any(a[2] == b[2] and a is not b and overlaps(a, b)
                      for i, a in enumerate(tiles) for b in tiles[i + 1:])
            if bad:
                continue
            random.seed(n)
            if not peelable(tiles):
                continue
            break
        else:
            problems.append(f"level {n}: no valid layout")
            continue

        hid = hidden_count(tiles)
        entry = {
            "n": n,
            "chapter": chname,
            "pool": pool,
            "layers": to_layers(tiles),
        }
        if n % 5 == 1 and n > 1:
            entry["introduces"] = SYMBOLS[catalogue - 1]
        levels.append(entry)
        report.append((n, chname, len(tiles), max(t[2] for t in tiles) + 1,
                       hid, round(100 * hid / len(tiles)), len(pool)))

    with open("levels.json", "w", encoding="utf-8") as f:
        json.dump(levels, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(levels)} levels written  ({len(problems)} problems)")
    for p in problems:
        print("  !", p)
    print(f"\n{'lvl':>4} {'chapter':<12} {'tiles':>5} {'lyrs':>4} {'hidden':>6} {'hid%':>5} {'syms':>4}")
    for row in report:
        if row[0] % 10 == 1 or row[0] == 100:
            print(f"{row[0]:>4} {row[1]:<12} {row[2]:>5} {row[3]:>4} {row[4]:>6} {row[5]:>5} {row[6]:>4}")
    tc = [r[2] for r in report]
    ly = [r[3] for r in report]
    hp = [r[5] for r in report]
    print(f"\ntiles  {min(tc)} -> {max(tc)}   layers {min(ly)} -> {max(ly)}   hidden% {min(hp)} -> {max(hp)}")
    dips = [(report[i][0], tc[i - 1], tc[i]) for i in range(1, len(tc)) if tc[i] < tc[i - 1]]
    print(f"tile-count regressions: {len(dips)}" + (f"  {dips[:6]}" if dips else ""))
    ldips = [(report[i][0], ly[i - 1], ly[i]) for i in range(1, len(ly)) if ly[i] < ly[i - 1] - 1]
    print(f"layer drops >1: {len(ldips)}" + (f"  {ldips[:6]}" if ldips else ""))
    first_hidden = next((r[0] for r in report if r[4] > 0), None)
    print(f"first level with a hidden tile: {first_hidden}")
    import os
    print(f"levels.json: {os.path.getsize('levels.json')/1024:.1f} KB")


if __name__ == "__main__":
    main()
