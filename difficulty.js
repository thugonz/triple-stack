const fs=require('fs');
const PACK=JSON.parse(fs.readFileSync('levels.json','utf8'));
const src=fs.readFileSync('verify.js','utf8').split('let fails=0')[0];
const mod={};new Function('module','exports',src+'\nmodule.exports={rngFrom,freeOf,assign};')(mod,{});
const {rngFrom,freeOf,assign}=mod.exports;
const TRAY=5;

function buildTiles(L){const o=[];let id=0;
 L.layers.forEach((l,layer)=>l.rows.forEach((row,r)=>{for(let c=0;c<row.length;c++)
   if(row[c]==="X")o.push({id:id++,gx:l.ox+2*c,gy:l.oy+2*r,layer,sym:null});}));return o;}

/* A careful-but-not-clairvoyant player: sees free tiles and the tray,
   cannot see anything buried. No undos, no shuffles. */
function play(tiles,rnd){
  let alive=new Set(tiles.map(t=>t.id)); let tray=[];
  for(let step=0;step<4000;step++){
    if(alive.size===0&&tray.length===0) return true;
    const live=tiles.filter(t=>alive.has(t.id));
    const free=freeOf(live);
    if(!free.length) return false;
    const cnt={};tray.forEach(s=>cnt[s]=(cnt[s]||0)+1);
    const freeCnt={};free.forEach(t=>freeCnt[t.sym]=(freeCnt[t.sym]||0)+1);
    let pick=free.find(t=>cnt[t.sym]===2);                       // complete a triple
    if(!pick){
      const pairable=free.filter(t=>cnt[t.sym]===1&&freeCnt[t.sym]>=2);
      pick=pairable.sort((a,b)=>freeCnt[b.sym]-freeCnt[a.sym])[0];
    }
    if(!pick) pick=free.find(t=>cnt[t.sym]===1);                 // bank a pair
    if(!pick&&tray.length<TRAY-1){                               // build, keeping a slot spare
      const seed=free.filter(t=>freeCnt[t.sym]>=3).sort((a,b)=>freeCnt[b.sym]-freeCnt[a.sym])[0];
      pick=seed||free[Math.floor(rnd()*free.length)];
    }
    if(!pick) pick=free[Math.floor(rnd()*free.length)];          // forced, may lose
    alive.delete(pick.id); tray.push(pick.sym);
    const t2={};tray.forEach(s=>t2[s]=(t2[s]||0)+1);
    const hit=Object.keys(t2).find(s=>t2[s]>=3);
    if(hit){let r=0;tray=tray.filter(s=>(s===hit&&r<3)?(r++,false):true);}
    else if(tray.length>=TRAY) return false;
  }
  return false;
}

function winRate(L,pool,trials){
  const tiles=buildTiles(L); let w=0;
  for(let i=0;i<trials;i++){
    const rnd=rngFrom(L.n*99991+i*7);
    const m=assign(tiles,pool,rnd,{}); if(!m) continue;
    tiles.forEach(t=>t.sym=m.get(t.id));
    if(play(tiles,rnd)) w++;
  }
  return w/trials;
}

const SAMPLE=[1,10,20,30,40,50,60,70,80,90,95,100];
console.log('lvl  tiles  syms   win% (as shipped)   win% if symbols capped at 12');
for(const n of SAMPLE){
  const L=PACK[n-1];
  const tiles=buildTiles(L);
  const a=winRate(L,L.pool,120);
  const b=winRate(L,L.pool.slice(0,Math.min(12,L.pool.length)),120);
  const bar=x=>'#'.repeat(Math.round(x*20)).padEnd(20,'.');
  console.log(`${String(n).padStart(3)}  ${String(tiles.length).padStart(5)}  ${String(L.pool.length).padStart(4)}   ${bar(a)} ${(a*100).toFixed(0).padStart(3)}%   ${(b*100).toFixed(0).padStart(3)}%`);
}
