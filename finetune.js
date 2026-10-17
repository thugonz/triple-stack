/* Re-fit designs-per-board against a harder target, on the new buried geometry.
   Search a window around a smooth base curve rather than the whole range: the
   difficulty-vs-designs relationship is a VALLEY, and an unconstrained search
   hops between its two easy walls and yields an illegible, jumpy curve. */
const fs=require('fs');
const src=fs.readFileSync('sweep.js','utf8');
const body=src.slice(0,src.indexOf('const LEVELS = ['));
const mod={};new Function('module','exports','require',body+'\nmodule.exports={PACK,rate};')(mod,{},require);
const {PACK,rate}=mod.exports;

// ~15 points below the previous calibration across the board.
const ANCHORS=[[1,85],[5,78],[10,68],[15,59],[20,51],[30,36],[40,25],
               [50,16],[60,10],[70,6],[80,3],[90,2],[100,1]];
function target(n){for(let i=0;i<ANCHORS.length-1;i++){const[a,av]=ANCHORS[i],[b,bv]=ANCHORS[i+1];
  if(n>=a&&n<=b)return av+(bv-av)*((n-a)/(b-a));}return 1;}
const base=n=>7+Math.round(((n-1)/99)*7);
const WIN=4, TRIALS=250;

let raw=[];
for(let n=1;n<=100;n++){
  const L=PACK[n-1];
  const tiles=L.layers.reduce((a,l)=>a+l.rows.join('').split('X').length-1,0);
  const cap=Math.min(Math.min(30,10+Math.floor((n-1)/5)),Math.floor(tiles/3));
  const tgt=target(n);
  let best=null;
  for(let k=Math.max(4,base(n)-WIN);k<=Math.min(cap,base(n)+WIN);k++){
    const w=rate(L,k,5,false,TRIALS).win*100;
    const d=Math.abs(w-tgt);
    if(!best||d<best.d)best={k,w,d};
  }
  raw.push(best?best.k:base(n));
}
// light smoothing so neighbouring levels don't swing by 3 designs
const tbl=[];
for(let i=0;i<raw.length;i++){
  if(i===0){tbl.push(raw[0]);continue;}
  const d=raw[i]-tbl[i-1];
  tbl.push(tbl[i-1]+Math.max(-2,Math.min(2,d)));   // no wild swings between levels
}
const LV=[1,5,10,20,30,40,50,60,70,80,90,100];
const meas=LV.map(n=>{
  const L=PACK[n-1];
  const tiles=L.layers.reduce((a,l)=>a+l.rows.join('').split('X').length-1,0);
  const cap=Math.min(Math.min(30,10+Math.floor((n-1)/5)),Math.floor(tiles/3));
  return rate(L,Math.min(tbl[n-1],cap),5,false,400).win*100;
});
console.log("        |"+LV.map(n=>String(n).padStart(6)).join(""));
console.log("TARGET  |"+LV.map((n,i)=>target(n).toFixed(0).padStart(5)+"%").join(""));
console.log("FITTED  |"+meas.map(w=>w.toFixed(0).padStart(5)+"%").join(""));
console.log("designs |"+LV.map(n=>String(tbl[n-1]).padStart(6)).join(""));
const err=LV.map((n,i)=>Math.abs(meas[i]-target(n))).reduce((a,b)=>a+b,0)/LV.length;
console.log("\nmean abs error: "+err.toFixed(1)+" points");
fs.writeFileSync('board_symbols.json',JSON.stringify(tbl));
