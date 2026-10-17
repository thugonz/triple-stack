/* Difficulty sweep.
   Fast rewrite: coverage is static geometry, so precompute it once per level
   and keep an alive-coverer count per tile instead of rescanning the board. */
const fs = require('fs');
const PACK = JSON.parse(fs.readFileSync('levels.json', 'utf8'));

function rngFrom(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTiles(L){
  const o = []; let id = 0;
  L.layers.forEach((l, layer) => l.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++)
      if (row[c] === "X") o.push({id: id++, gx: l.ox + 2*c, gy: l.oy + 2*r, layer});
  }));
  return o;
}

/* coverers[i] = tiles ABOVE i that overlap it; covers[i] = tiles BELOW i it sits on */
function geometry(T){
  const n = T.length;
  const coverers = Array.from({length:n}, () => []);
  const covers   = Array.from({length:n}, () => []);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    if (i === j) continue;
    if (T[j].layer > T[i].layer &&
        Math.abs(T[i].gx - T[j].gx) < 2 && Math.abs(T[i].gy - T[j].gy) < 2){
      coverers[i].push(j); covers[j].push(i);
    }
  }
  return {coverers, covers};
}

/* Forward peel: take `spread` into account when choosing which free tiles share
   a symbol. spread=false picks any 3 free (current behaviour). spread=true
   prefers 3 that are far apart, which is harder to collect but still solvable
   because they are all free at the same moment. */
function assign(T, G, nsym, rnd, spread){
  const n = T.length;
  const cnt = new Int32Array(n);
  for (let i = 0; i < n; i++) cnt[i] = G.coverers[i].length;
  const alive = new Uint8Array(n).fill(1);
  const sym = new Int32Array(n).fill(-1);
  const used = new Int32Array(nsym);
  let left = n;

  while (left > 0){
    const free = [];
    for (let i = 0; i < n; i++) if (alive[i] && cnt[i] === 0) free.push(i);
    if (free.length < 3) return null;

    let pick;
    if (spread && free.length > 3){
      const a = free[(rnd() * free.length) | 0];
      const rest = free.filter(x => x !== a);
      rest.sort((x, y) => {
        const dx = Math.abs(T[x].gx - T[a].gx) + Math.abs(T[x].gy - T[a].gy) + Math.abs(T[x].layer - T[a].layer) * 3;
        const dy = Math.abs(T[y].gx - T[a].gx) + Math.abs(T[y].gy - T[a].gy) + Math.abs(T[y].layer - T[a].layer) * 3;
        return dy - dx;
      });
      pick = [a, rest[0], rest[1]];
    } else {
      for (let i = free.length - 1; i > 0; i--){ const j = (rnd()*(i+1))|0; const t = free[i]; free[i] = free[j]; free[j] = t; }
      pick = [free[0], free[1], free[2]];
    }

    let best = 0, bestN = Infinity;
    for (let s = 0; s < nsym; s++){ const r = used[s] + rnd() * 0.5; if (r < bestN){ bestN = r; best = s; } }
    for (const i of pick){
      sym[i] = best; alive[i] = 0; left--;
      for (const j of G.covers[i]) cnt[j]--;
    }
    used[best] += 3;
  }
  return sym;
}

/* A careful, non-clairvoyant player: sees free tiles and the tray only. */
function play(T, G, sym, traySize, rnd){
  const n = T.length;
  const cnt = new Int32Array(n);
  for (let i = 0; i < n; i++) cnt[i] = G.coverers[i].length;
  const alive = new Uint8Array(n).fill(1);
  let left = n;
  const tray = [];

  for (let guard = 0; guard < 5000; guard++){
    if (left === 0 && tray.length === 0) return true;
    const free = [];
    for (let i = 0; i < n; i++) if (alive[i] && cnt[i] === 0) free.push(i);
    if (!free.length) return false;

    const inTray = {}; tray.forEach(s => inTray[s] = (inTray[s]||0)+1);
    const freeCnt = {}; free.forEach(i => freeCnt[sym[i]] = (freeCnt[sym[i]]||0)+1);

    let pick = free.find(i => inTray[sym[i]] === 2);
    if (pick === undefined){
      const pair = free.filter(i => inTray[sym[i]] === 1 && freeCnt[sym[i]] >= 2);
      if (pair.length) pick = pair.sort((a,b) => freeCnt[sym[b]] - freeCnt[sym[a]])[0];
    }
    if (pick === undefined) pick = free.find(i => inTray[sym[i]] === 1);
    if (pick === undefined && tray.length < traySize - 1){
      const seed = free.filter(i => freeCnt[sym[i]] >= 3).sort((a,b) => freeCnt[sym[b]] - freeCnt[sym[a]])[0];
      pick = seed !== undefined ? seed : free[(rnd()*free.length)|0];
    }
    if (pick === undefined) pick = free[(rnd()*free.length)|0];

    alive[pick] = 0; left--;
    for (const j of G.covers[pick]) cnt[j]--;
    tray.push(sym[pick]);

    const tally = {}; tray.forEach(s => tally[s] = (tally[s]||0)+1);
    const hit = Object.keys(tally).find(s => tally[s] >= 3);
    if (hit !== undefined){
      let r = 0;
      for (let i = tray.length - 1; i >= 0 && r < 3; i--) if (String(tray[i]) === hit){ tray.splice(i,1); r++; }
    } else if (tray.length >= traySize) return false;
  }
  return false;
}

function rate(L, nsym, traySize, spread, trials){
  const T = buildTiles(L), G = geometry(T);
  const eff = Math.min(nsym, Math.floor(T.length / 3));
  let w = 0, ok = 0;
  for (let s = 0; s < trials; s++){
    const rnd = rngFrom(L.n * 7919 + s * 131 + (spread?5:0));
    const sym = assign(T, G, eff, rnd, spread);
    if (!sym) continue;
    ok++;
    if (play(T, G, sym, traySize, rnd)) w++;
  }
  return {win: ok ? w/ok : NaN, eff, tiles: T.length};
}

const LEVELS = [20, 50, 80, 100];
const SYMS = [6, 9, 12, 16, 20, 25];
const TRIALS = 120;

console.log("Bot win rate — lower is harder. Current build = 'as shipped' column.\n");
for (const tray of [5, 4]){
  console.log(`=== tray ${tray} slots ===`);
  console.log("lvl tiles  shipped |" + SYMS.map(s => String(s).padStart(5)).join("") + "   <- symbols per board");
  for (const n of LEVELS){
    const L = PACK[n-1];
    const shipped = rate(L, L.pool.length, tray, false, TRIALS);
    const row = SYMS.map(s => {
      const r = rate(L, s, tray, false, TRIALS);
      return (r.win*100).toFixed(0).padStart(4) + "%";
    }).join("");
    console.log(String(n).padStart(3) + String(shipped.tiles).padStart(6) +
                (shipped.win*100).toFixed(0).padStart(7) + "% |" + row);
  }
  console.log("");
}

console.log("=== effect of spreading a symbol's three tiles apart (tray 5) ===");
console.log("lvl  symbols   clustered   spread");
for (const n of LEVELS){
  const L = PACK[n-1];
  const a = rate(L, L.pool.length, 5, false, TRIALS);
  const b = rate(L, L.pool.length, 5, true, TRIALS);
  console.log(String(n).padStart(3) + String(a.eff).padStart(9) +
    (a.win*100).toFixed(0).padStart(11) + "%" + (b.win*100).toFixed(0).padStart(8) + "%");
}
