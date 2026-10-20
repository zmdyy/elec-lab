'use strict';
// Run: node tests/wire-editor-regression.cjs (no dependencies).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dummy={innerHTML:'',textContent:'',hidden:false,classList:{contains:()=>false,toggle(){},remove(){},add(){}},style:{},setAttribute(){},addEventListener(){},querySelector:()=>dummy};
const frames=[],sandbox={
 document:{body:dummy,getElementById:()=>dummy,querySelectorAll:()=>[]},
 window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},
 requestAnimationFrame:fn=>(frames.push(fn),frames.length),
 setTimeout:()=>0,clearTimeout(){},Blob
};
vm.createContext(sandbox);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1]+'\nthis.Simulator=CircuitSimulator;',sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../classroom.js'),'utf8'),sandbox);
const s=Object.create(sandbox.Simulator.prototype);
Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'real',simulationRunning:true,
 scale:1,panX:0,panY:0,gridSize:20,darkMode:false,showGrid:true,showPotPrinciple:false,activeExperiment:null,
 canvas:{style:{},getBoundingClientRect:()=>({left:0,top:0})},undoStack:[],maxUndo:6,suppressUndo:true});
for(const n of ['draw','recalc','updatePropertiesPanel','updateCircuitInfo','resizeCanvas','drawMiniSchematic'])s[n]=()=>{};
s.restoreClassroom();
const b=s.createComponent('battery',{x:120,y:160}),r=s.createComponent('resistor',{x:360,y:160});
b.realX=b.x;b.realY=b.y;r.realX=r.x;r.realY=r.y;
const w={start:{compId:b.id,termId:'pos'},end:{compId:r.id,termId:'a'},
 bends:[],realBends:[{x:205,y:70},{x:275,y:75}],view:'both'};
s.wires.push(w);
const originalPath=s.resolveRealWire(w);
let pts=s.wireControlPoints(w);
assert.equal(pts.length,3,'exactly three edit handles');
assert.ok(pts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
const first=JSON.stringify(pts);
s.moveWireControlPoint(w,1,pts[1].x+40,pts[1].y+40);
assert.equal(w.editControls.real.manual,true);
assert.equal(w.realBends.length,47,'edited real curve is stored as bounded sampled geometry');
assert.notEqual(JSON.stringify(s.wireControlPoints(w)),first);
assert.equal(s.resolveRealWire(w)._sampled,true);
assert.equal(JSON.stringify(s.wires[0].start),JSON.stringify(w.start));
const data=s.experimentData();
const parsed=sandbox.Simulator.validateExperiment(JSON.parse(JSON.stringify(data)));
assert.equal(parsed.wires[0].editControls.real.manual,true);
assert.equal(parsed.wires[0].editControls.real.points.length,3);
assert.deepEqual(JSON.parse(JSON.stringify(parsed.wires[0].editControls.real.points)),JSON.parse(JSON.stringify(w.editControls.real.points)));
const old=JSON.parse(JSON.stringify(data));delete old.wires[0].editControls;
assert.doesNotThrow(()=>sandbox.Simulator.validateExperiment(old),'old JSON must remain importable');
for(const mutation of [
 d=>d.wires[0].editControls.real.points.pop(),
 d=>d.wires[0].editControls.real.points[0].x='bad',
 d=>d.wires[0].editControls.real.manual='yes'
]){const invalid=JSON.parse(JSON.stringify(data));mutation(invalid);
 assert.throws(()=>sandbox.Simulator.validateExperiment(invalid));}
s.viewMode='schematic';
assert.equal(s.wireControlPoints(w).length,3,'schematic view gets its own three controls');
s.moveWireControlPoint(w,0,190,190);
assert.equal(w.editControls.schematic.manual,true);
assert.equal(w.editControls.real.manual,true,'separate view states survive');
s.viewMode='real';
let redraws=0,solves=0;s.draw=()=>redraws++;s.solveCircuit=()=>solves++;
s.requestDraw();s.requestDraw();s.requestDraw();
assert.equal(frames.length,1,'multiple requests must coalesce');
frames.shift()();assert.equal(redraws,1);
s.wireRoutesReport=()=>({body:[],self:[],conflicts:[],clear:true});
s.beginDragPreview(r);s.selectedComponent=r;s.dragging=true;
s.dragOffset={x:0,y:0};
s.handleMouseMove({clientX:380,clientY:180});
s.handleMouseMove({clientX:400,clientY:180});
assert.equal(solves,0,'dragging position must not re-solve electricity');
const preview=s.resolveRealWire(w);
assert.equal(preview.at(-1).x,s.wireEndPos(w,'end').x,'wire end follows the dragged terminal');
s.handleMouseUp({clientX:400,clientY:180});
assert.equal(s.dragging,false);
assert.equal(solves,0);
assert.equal(w.editControls.real.points.length,3);
assert.ok(w.realBends.length>0);
// Moving an unrelated component onto a wire must audit that wire locally.
const obstruction=s.createComponent('resistor',{x:900,y:650});
obstruction.realX=obstruction.x;obstruction.realY=obstruction.y;
const wirePath=s.resolveRealWire(w);
s.selectedComponent=obstruction;s.dragging=false;s.beginDragPreview(obstruction);s.dragging=true;
obstruction.realX=wirePath[24].x;obstruction.realY=wirePath[24].y;
let audited=false;
s.wireRoutesReport=(routes,only)=>{if(only===w)audited=true;return {body:[],self:[],conflicts:[],clear:true};};
s.finishDragPreview();s.dragging=false;
assert.equal(audited,true,'a moved unconnected component must audit an obstructed wire');
const line=Array.from({length:49},(_,i)=>({x:i*10,y:20}));
assert.equal(s.simplifyRoutePoints(line).length,2,'local route obstacle geometry should be simplified');
console.log('PASS wire editor: 3 handles, per-view JSON, legacy import, invalid data, redraw coalescing and electric-free dragging');

// Regression: an edited curve may store 47 dense route samples, but its three
// orange handles must remain exact while the sharp joins become C1-smooth.
{
 const source=Array.from({length:49},(_,i)=>{
  const x=20+i*10;
  const anchors=[0,12,24,36,48],heights=[0,95,-80,110,0];
  let k=0;while(k<3&&i>anchors[k+1])k++;
  const t=(i-anchors[k])/(anchors[k+1]-anchors[k]);
  return {x,y:heights[k]*(1-t)+heights[k+1]*t};
 });
 const handles=[12,24,36].map(k=>({...source[k]}));
 const testWire={
   start:{compId:'C0',termId:'pos'},end:{compId:'C1',termId:'a'},
   realBends:source.slice(1,-1).map(p=>({...p})),
   editControls:{real:{points:handles,manual:true,sampled:true}}
 };
 const shape=Object.create(sandbox.Simulator.prototype);
 shape.viewMode='real';shape.wireEndPos=(_w,end)=>end==='start'?source[0]:source[48];
 const actual=shape.resolveRealWire(testWire);
 assert.equal(actual._sampled,true);
 assert.equal(actual.length,145);
 for(let n=0;n<3;n++){
  const i=(n+1)*36;
  assert.ok(Math.hypot(actual[i].x-handles[n].x,actual[i].y-handles[n].y)<1e-8,
     'smoothing must not move a user control point');
 }
 const kink=(points,i)=>{
  const a=points[i-1],b=points[i],c=points[i+1];
  const v=[b.x-a.x,b.y-a.y],w=[c.x-b.x,c.y-b.y];
  return Math.acos(Math.max(-1,Math.min(1,(v[0]*w[0]+v[1]*w[1])/(Math.hypot(...v)*Math.hypot(...w)))));
 };
 for(const i of [12,24,36]){
  assert.ok(kink(actual,i*3)<kink(source,i)*.3,'control-point kink should become a gentle curve');
 }
 // The editable control path and export/display path must match after cache hit.
 assert.equal(shape.resolveRealWire(testWire),actual);
 console.log('PASS manual real wires stay smooth at three exact control handles');
}
