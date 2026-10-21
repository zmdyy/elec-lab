'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dummy={style:{},classList:{contains:()=>false,toggle(){},add(){},remove(){}},querySelector:()=>dummy,setAttribute(){}};
const box={document:{getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]+';this.S=CircuitSimulator;this.defs=COMPONENT_DEFS;this.experiments=EXPERIMENTS;',box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../devices.js'),'utf8'),box);
function build(mode='schematic'){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,gridSize:20,viewMode:mode,simulationRunning:false,scale:1,panX:0,panY:0});for(const name of ['saveUndo','recalc','draw','updateCircuitInfo','updatePropertiesPanel'])s[name]=()=>{};return s;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),grid=p=>{near(p.x/20,Math.round(p.x/20));near(p.y/20,Math.round(p.y/20));};
const types=Object.keys(box.defs).filter(k=>!box.defs[k].internal);
for(const type of types)for(const rotation of [0,90,180,270])for(const flip of [false,true]){
 const s=build(),c=s.createComponent(type,{x:213,y:227,rotation});c.schematicFlipX=flip;
 for(let k=0;k<4;k++){s.getAbsoluteTerminals(c).forEach(grid);s.selectedComponent=c;s.rotateSelected();}
 c.x=243.3;c.y=197.1;s.snapSchematicComponent(c);s.getAbsoluteTerminals(c).forEach(grid);
}
console.log('PASS all 10 types: creation, four rotations, mirroring and off-grid placement correction');
// Capture vector endpoints, independent from electrical terminal calculation.
for(const type of types){
 const s=build(),c=s.createComponent(type),points=[],art=[];s.label=()=>{};
 s.ctx=new Proxy({moveTo:(x,y)=>points.push({x,y}),lineTo:(x,y)=>points.push({x,y})},{get:(o,k)=>k in o?o[k]:()=>{}});
 s.drawSVG=(_key,svg)=>art.push(svg);s.drawComponent(c);
 const terminals=s.terminals(c).filter(t=>!t.hidden);
 if(['led','motor','bell'].includes(type)){
  const svg=art.join('');assert.ok(svg.includes(String(40/1.3)),type+' SVG has its exact terminal height/span');
  if(type==='bell')assert.ok(svg.includes(String(20/1.3)));
 }else for(const t of terminals)assert.ok(points.some(p=>Math.hypot(p.x-t.x,p.y-t.y)<1e-7),type+' visible symbol lead must meet its electrical terminal');
}
console.log('PASS visible vector lead endpoints match electrical endpoints, including device SVGs');
{
 const s=build(),p=s.createComponent('potentiometer');s.wires=[{start:{compId:p.id,termId:'a'},end:{compId:p.id,termId:'b'}},{start:{compId:p.id,termId:'c'},end:{compId:p.id,termId:'d'}}];
 assert.equal(s.terminals(p).filter(t=>!t.hidden).length,4);s.getAbsoluteTerminals(p).forEach(grid);
 for(const side of [-1,1]){p.potUpperSide=side;s.getAbsoluteTerminals(p).forEach(grid);}
}
for(let i=0;i<box.experiments.length;i++){
 const s=build();s.simulationRunning=true;box.experiments[i].build(s);s.wires.forEach(w=>w.view='both');s.solveCircuit();const before=s.components.map(c=>c.measurement||0);
 s.layoutSchematicCircuit(true);s.solveCircuit();s.components.forEach((c,k)=>{s.getAbsoluteTerminals(c).forEach(grid);near(c.measurement||0,before[k]);});
 for(const w of s.wires){const p=s.resolveWire(w);p.forEach(grid);near(p[0].x,s.wireEndPos(w,'start').x);near(p.at(-1).x,s.wireEndPos(w,'end').x);near(p.at(-1).y,s.wireEndPos(w,'end').y);for(let n=1;n<p.length;n++)assert.ok(p[n].x===p[n-1].x||p[n].y===p[n-1].y,'automatic route must be orthogonal');}
 console.log('PASS grid-aligned schematic layout and routes for experiment '+(i+1));
}
{
 const s=build();for(let i=0;i<3;i++){const old=s.wires.length;box.experiments[0].build(s);s.wires.slice(old).forEach(w=>w.view='both');}
 s.layoutSchematicCircuit(true);s.components.forEach(c=>s.getAbsoluteTerminals(c).forEach(grid));s.wires.forEach(w=>s.resolveWire(w).forEach(grid));
 console.log('PASS independent-circuit packing uses translations by whole grid cells');
}
{
 const s=build(),a=s.createComponent('resistor',{x:200,y:200}),b=s.createComponent('resistor',{x:400,y:360});
 s.currentTool='wire';s.hideContextMenu=()=>{};s.hitScale=1;s.snapRadius=10;s.canvas={getBoundingClientRect:()=>({left:0,top:0})};s.pixelRatio=1;s.activeExperiment=null;
 const click=p=>s.handleMouseDown({button:0,clientX:p.x,clientY:p.y,detail:1});click(s.terminalPos(a.id,'b'));click(s.terminalPos(b.id,'a'));assert.equal(s.wires.length,1);
 const points=s.resolveWire(s.wires[0]);points.forEach(grid);for(let i=1;i<points.length;i++)assert.ok(points[i].x===points[i-1].x||points[i].y===points[i-1].y);
 console.log('PASS two-click schematic wire adds right-angle elbows on the grid');
}
{
 const s=build('real'),p=s.createComponent('potentiometer',{x:213,y:227}),b=s.createComponent('battery',{x:333,y:257});
 near(p.x,213);near(p.y,227);near(s.terminals(p)[0].x,-76);near(s.terminals(p)[0].y,24);near(s.terminals(b)[0].x,64);near(s.terminals(b)[0].y,8);
 console.log('PASS physical geometry and placement retain their original coordinates');
}
