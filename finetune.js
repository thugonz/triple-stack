const fs=require('fs');
const src=fs.readFileSync('sweep.js','utf8');
const body=src.slice(0,src.indexOf('const LEVELS = ['));
const mod={};new Function('module','exports','require',body+'\nmodule.exports={PACK,rate};')(mod,{},require);
const {PACK,rate}=mod.exports;
const ANCHORS=[[1,95],[5,90],[10,82],[15,74],[20,66],[30,50],[40,38],[50,28],[60,20],[70,14],[80,9],[90,5],[100,2]];
function target(n){for(let i=0;i<ANCHORS.length-1;i++){const[a,av]=ANCHORS[i],[b,bv]=ANCHORS[i+1];
  if(n>=a&&n<=b)return av+(bv-av)*((n-a)/(b-a));}return 2;}
const base=n=>10+Math.round(((n-1)/99)*4);          // candidate B
const out=[],meas=[];
for(let n=1;n<=100;n++){
  const L=PACK[n-1];
  const tiles=L.layers.reduce((a,l)=>a+l.rows.join('').split('X').length-1,0);
  const cap=Math.min(Math.min(30,10+Math.floor((n-1)/5)),Math.floor(tiles/3));
  const tgt=target(n);
  let best=null;
  for(const k of [base(n)-1,base(n),base(n)+1]){      // stay within 1 of the curve
    const kk=Math.max(4,Math.min(k,cap));
    const w=rate(L,kk,5,false,250).win*100;
    const d=Math.abs(w-tgt);
    if(!best||d<best.d)best={k:kk,w,d};
  }
  out.push(best.k);meas.push(best.w);
}
const LV=[1,5,10,20,30,40,50,60,70,80,90,100];
const hdr="         |"+LV.map(n=>String(n).padStart(5)).join("");
console.log(hdr);
console.log("TARGET   |"+LV.map(n=>target(n).toFixed(0).padStart(4)+"%").join(""));
console.log("TUNED    |"+LV.map(n=>meas[n-1].toFixed(0).padStart(4)+"%").join(""));
console.log("designs  |"+LV.map(n=>String(out[n-1]).padStart(5)).join(""));
const err=out.map((_,i)=>Math.abs(meas[i]-target(i+1))).reduce((a,b)=>a+b,0)/100;
console.log("\nmean abs error: "+err.toFixed(1)+" points   range: "+Math.min(...out)+"->"+Math.max(...out));
fs.writeFileSync('board_symbols.json',JSON.stringify(out));
console.log(JSON.stringify(out));
