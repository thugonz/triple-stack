const fs=require('fs');
const LV=JSON.parse(fs.readFileSync('levels.json','utf8'));
const src=fs.readFileSync('verify.js','utf8').split('let fails=0')[0];
const mod={};
new Function('module','exports',src+'\nmodule.exports={rngFrom,freeOf,assign,shuffled,overlap};')(mod,{});
const {rngFrom,freeOf,assign,overlap}=mod.exports;

function buildTiles(level){
  const out=[];let id=0;
  level.layers.forEach((L,layer)=>L.rows.forEach((row,r)=>{
    for(let c=0;c<row.length;c++) if(row[c]==="X") out.push({id:id++,gx:L.ox+2*c,gy:L.oy+2*r,layer,sym:null});
  }));
  return out;
}
// full solver, 5-slot tray (bounded)
function solvable(tiles,traySize){
  const seen=new Set();let budget=400000;
  function go(alive,tray){
    if(alive.size===0&&tray.length===0)return true;
    const k=[...alive].sort((a,b)=>a-b).join(",")+"|"+tray.slice().sort().join(",");
    if(seen.has(k))return false; seen.add(k);
    if(--budget<0)return null;
    const live=tiles.filter(t=>alive.has(t.id));
    for(const t of freeOf(live)){
      const nt=tray.concat([t.sym]);const tally={};nt.forEach(s=>tally[s]=(tally[s]||0)+1);
      let fin=nt;const hit=Object.keys(tally).find(s=>tally[s]>=3);
      if(hit){let r=0;fin=nt.filter(s=>(s===hit&&r<3)?(r++,false):true);}
      else if(nt.length>=traySize)continue;
      const na=new Set(alive);na.delete(t.id);
      const res=go(na,fin); if(res===null)return null; if(res)return true;
    }
    return false;
  }
  return go(new Set(tiles.map(t=>t.id)),[]);
}

let bad=[],widest=0,tallest=0,genFails=0,solverChecked=0,solverUndet=0;
const TW=56,TH=68,HU=28,HV=34,DX=5,DY=-7;
for(const L of LV){
  const tiles=buildTiles(L);
  const tag=`L${L.n}`;
  if(tiles.length%3) bad.push(`${tag}: ${tiles.length} not multiple of 3`);
  // no same-layer overlap
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++)
    if(tiles[i].layer===tiles[j].layer&&overlap(tiles[i],tiles[j])){bad.push(`${tag}: same-layer overlap`);i=j=1e9;}
  // every upper tile supported
  for(const t of tiles) if(t.layer>0 && !tiles.some(u=>u.layer===t.layer-1&&overlap(t,u)))
    {bad.push(`${tag}: unsupported tile at ${t.gx},${t.gy},L${t.layer}`);break;}
  // the GAME's own generator must succeed, repeatedly
  let f=0;
  for(let s=1;s<=25;s++){
    const m=assign(tiles,L.pool,rngFrom(L.n*7919+s),{});
    if(!m){f++;continue;}
    const c={};tiles.forEach(t=>c[m.get(t.id)]=(c[m.get(t.id)]||0)+1);
    if(Object.values(c).some(v=>v%3)) bad.push(`${tag}: symbol counts not /3`);
  }
  if(f){genFails++;bad.push(`${tag}: generator failed ${f}/25`);}
  // pixel footprint
  let mx=0,my=0,mn=Infinity;
  tiles.forEach(t=>{const x=t.gx*HU+t.layer*DX,y=t.gy*HV+t.layer*DY;
    mx=Math.max(mx,x+TW);my=Math.max(my,y+TH);mn=Math.min(mn,y);});
  widest=Math.max(widest,mx);tallest=Math.max(tallest,my-mn);
  // exhaustive solve at 5 slots for a sample of levels
  if(L.n<=6||L.n%17===0){
    const m=assign(tiles,L.pool,rngFrom(L.n*31),{});
    tiles.forEach(t=>t.sym=m.get(t.id));
    const r=solvable(tiles,5);solverChecked++;
    if(r===null)solverUndet++; else if(!r)bad.push(`${tag}: NOT SOLVABLE at 5 slots`);
  }
}
console.log(`levels: ${LV.length}`);
console.log(`generator failures: ${genFails} levels`);
console.log(`board footprint max: ${widest}px wide x ${tallest}px tall (unscaled)`);
console.log(`exhaustive 5-slot solves: ${solverChecked} run, ${solverUndet} hit the search budget, 0 proven unsolvable unless listed below`);
console.log(`PROBLEMS: ${bad.length}`);
bad.slice(0,25).forEach(b=>console.log('  !',b));
