// Run: node tests/interface-regression.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dummy={innerHTML:'',textContent:'',hidden:false,classList:{contains:()=>false,toggle(){},remove(){},add(){}},style:{},setAttribute(){},addEventListener(){},querySelector:()=>dummy};
const box={document:{body:dummy,getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:()=>null,setItem(){}},Blob};
vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]+';this.S=CircuitSimulator;this.E=EXPERIMENTS;',box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../classroom.js'),'utf8'),box);
const copy=x=>JSON.parse(JSON.stringify(x));
function build(){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'schematic',simulationRunning:false,scale:1,panX:0,panY:0,darkMode:false,showGrid:true,showPotPrinciple:false,activeExperiment:null,hitScale:1,snapRadius:13,canvas:{style:{}},undoStack:[],maxUndo:30});s.restoreClassroom();for(const fn of ['draw','updateCircuitInfo','updatePropertiesPanel','resizeCanvas'])s[fn]=()=>{};return s;}
const s=build();let a=s.createComponent('ammeter');assert.equal(a.label,'A');let a2=s.createComponent('ammeter');assert.deepEqual([a.label,a2.label],['A1','A2']);
s.selectedComponent=a;s.deleteSelected();assert.equal(a2.label,'A');s.undo();assert.deepEqual(copy(s.components.map(c=>c.label)),['A1','A2']);[a,a2]=s.components;
const r=s.createComponent('resistor'),pot=s.createComponent('potentiometer');assert.deepEqual([r.label,pot.label],['R1','R2']);
for(const [type,prefix] of Object.entries({battery:'电源',bulb:'L',switch:'S',voltmeter:'V',led:'D',motor:'M',bell:'电铃'})){
 const c=s.createComponent(type),d=s.createComponent(type);assert.deepEqual([c.label,d.label],[prefix+'1',prefix+'2']);s.selectedComponent=d;s.deleteSelected();assert.equal(c.label,prefix);
}
a2.label='支路表';a2.labelMode='custom';s.refreshAutoNames();assert.equal(a2.label,'支路表');
const named=s.createComponent('ammeter',{label:'A1'});assert.equal(named.labelMode,'custom');assert.equal(s.components.find(c=>c.id===a.id).label,'A2','automatic names avoid custom name collisions');
s.components.reverse();s.refreshAutoNames();assert.equal(s.components.find(c=>c.id===a.id).label,'A2','ordering uses creation ID, not array order');
const data=s.experimentData(),restored=build();restored.importExperiment(copy(data));assert.equal(restored.components.find(c=>c.id===a2.id).label,'支路表');assert.equal(restored.components.find(c=>c.id===named.id).labelMode,'custom');
const legacy=copy(data);legacy.components.forEach(c=>delete c.labelMode);restored.importExperiment(legacy);assert.equal(restored.components.find(c=>c.id===a2.id).label,'支路表');
const bad=copy(data);bad.components[0].labelMode='bad';assert.throws(()=>restored.importExperiment(bad));
console.log('PASS all name groups, mixed R sequence, deletion/undo, creation order, custom collisions, JSON and legacy import');
// Actual geometry under rotation, mirror and touch terminal snapping.
for(const mode of ['real','schematic'])for(const input of ['mouse','touch'])for(const rotation of [0,90,180,270])for(const flip of [false,true]){
 const s=build(),c=s.createComponent('switch',{x:200,y:200,state:'open',rotation});s.viewMode=mode;s.inputMode=input;s.hitScale=input==='touch'?1.7:1;s.snapRadius=input==='touch'?18:13;c.realX=c.x;c.realY=c.y;c.realRotation=rotation;c.realFlipX=c.schematicFlipX=flip;s.toWorld=e=>({x:e.clientX,y:e.clientY});s.hideContextMenu=()=>{};
 const point=(x,y)=>{if(flip)x=-x;const a=rotation*Math.PI/180,k=s.componentSize(c);return {clientX:200+(x*Math.cos(a)-y*Math.sin(a))*k,clientY:200+(x*Math.sin(a)+y*Math.cos(a))*k,button:0};};
 const grip=()=>mode==='real'?point(28-69*Math.cos(c.state==='closed'?0:.36),-10-69*Math.sin(c.state==='closed'?0:.36)):point(0,c.state==='closed'?0:-9.5625);
 s.currentTool='wire';let e=grip();s.handleMouseDown(e);s.handleMouseUp(e);assert.equal(c.state,'closed',JSON.stringify({mode,input,rotation,flip}));
 e=grip();s.handleMouseDown(e);s.handleMouseMove({...e,clientX:e.clientX+20});s.handleMouseUp(e);assert.equal(c.state,'closed','dragging handle never toggles');
 const base=point(0,mode==='real'?28:28);s.handleDblClick(base);assert.equal(c.state,'closed');assert.equal(s.selectedComponent,c);assert.equal(s.currentTool,'wire');
 const terminal=s.getAbsoluteTerminals(c).find(t=>!t.hidden);assert.equal(s.switchHandleAt(terminal.x,terminal.y),null,'terminal always remains a wiring target');
 e=grip();s.handleMouseDown(e);s.handleMouseUp(e);assert.equal(c.state,'open');
}
console.log('PASS handle toggle, drag cancellation, base double-click and terminals in both views, inputs, rotations and mirror states');
const state=build();state.getAmmeterPolarityIssues=()=>[];assert.equal(state.stateWithChecks('正常','closed'),'正常');state.getAmmeterPolarityIssues=()=>['反接'];assert.match(state.stateWithChecks('闭合','warning'),/反接/);assert.ok(!state.stateWithChecks('闭合','warning').includes('闭合开关前检查'));
console.log('PASS concise circuit status retains real polarity warnings');
