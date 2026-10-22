const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),dummy={style:{},innerHTML:'',textContent:'',hidden:false,classList:{contains:()=>false,toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector:()=>dummy};
const box={window:{addEventListener(){}},document:{body:dummy,getElementById:()=>dummy,querySelectorAll:()=>[]},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem(){return null;},setItem(){}},Blob};vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]+';this.S=CircuitSimulator;',box);
for(const file of ['devices.js','classroom.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box);
const copy=x=>JSON.parse(JSON.stringify(x));
function base(){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'real',simulationRunning:true,scale:1,panX:0,panY:0,darkMode:false,showGrid:true,showPotPrinciple:false,activeExperiment:null,flowPhase:0,undoStack:[],maxUndo:20});for(const n of ['draw','resizeCanvas','updatePropertiesPanel','updateCircuitInfo','drawMiniSchematic'])s[n]=()=>{};s.restoreClassroom();return s;}
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function circuit(type){const s=base();s.viewMode='schematic';const b=s.createComponent('battery',{voltage:3}),r=s.createComponent('resistor',{resistance:100}),c=s.createComponent(type,{resistance:20,position:.4}),a=s.createComponent('ammeter');const ports=type==='bulb'?['shell','tip']:type==='potentiometer'?['a','c']:type==='ammeter'?['r0_6','neg']:type==='voltmeter'?['r3','neg']:['a','b'];for(const [x,tx,y,ty] of [[b,'pos',r,'a'],[r,'b',c,ports[0]],[c,ports[1],a,'r0_6'],[a,'neg',b,'neg']])s.connectTerminals(x,tx,y,ty,[],'both');s.recalc();return {s,c,a,r};}
for(const type of ['bulb','resistor','potentiometer','ammeter','voltmeter','led','motor','bell']){
 const {s,c,a}=circuit(type),baseline=a.measurement,params=JSON.stringify([c.resistance,c.position,c.ratedCurrent]),ends=JSON.stringify(s.wires.map(w=>[w.start,w.end]));
 assert.ok(baseline>0,type+' initial current');s.predictionHidden=true;s.replaceFault('open',c.id);near(a.measurement,0);assert.equal(s.predictionHidden,true);s.replaceFault('short',c.id);near(a.measurement,.03);assert.equal(c.measurement||0,0);assert.equal(JSON.stringify([c.resistance,c.position,c.ratedCurrent]),params);assert.equal(JSON.stringify(s.wires.map(w=>[w.start,w.end])),ends);s.removeFault(c.id);near(a.measurement,baseline);
 const before=s.snapshotState();assert.throws(()=>s.replaceFault('reverse',s.components[0].id));assert.equal(s.snapshotState(),before);
}
console.log('PASS all eight component types: open isolates, short bypasses, restoration retains normal parameters and topology');
for(const type of ['ammeter','voltmeter']){const {s,c}=circuit(type),normal=c.measurement;s.replaceFault('reverse',c.id);near(c.measurement,-normal);const restored=base();restored.importExperiment(copy(s.experimentData()));restored.removeFault();near(restored.components.find(o=>o.id===c.id).measurement,normal);}
console.log('PASS both meter types reverse actual endpoints and signed readings, including JSON restoration');
for(const kind of ['upper','lower']){
 const {s,c,a}=circuit('potentiometer');s.wires.forEach((w,i)=>{w.bends=[{x:80+i*20,y:40}];w.realBends=[{x:100,y:140+i*20}];});s.schematicReference=copy({components:s.components,wires:s.wires});const original=JSON.stringify(s.wires.map(w=>[w.start,w.end,w.bends,w.realBends]));const reference=JSON.stringify(s.schematicReference.wires);s.replaceFault(kind,c.id);
 for(const position of [0,.2,.5,.9,1]){c.position=position;s.recalc();near(a.measurement,3/(100+(kind==='lower'?20:0)));}
 const data=copy(s.experimentData()),restored=base();restored.importExperiment(data);assert.equal(restored.currentFault().kind,kind);restored.removeFault();assert.equal(JSON.stringify(restored.wires.map(w=>[w.start,w.end,w.bends,w.realBends])),original);assert.equal(JSON.stringify(restored.schematicReference.wires.map(w=>[w.start,w.end,w.bends,w.realBends])),JSON.stringify(JSON.parse(reference).map(w=>[w.start,w.end,w.bends,w.realBends])));
 const invalid=copy(data);invalid.wires.find(w=>w.connectionBackup).connectionBackup.start.termId='missing';assert.throws(()=>box.S.validateExperiment(invalid));
 s.replaceFault('short',s.components.find(o=>o.type==='resistor').id);assert.equal(JSON.stringify(s.wires.map(w=>[w.start,w.end,w.bends,w.realBends])),original);assert.equal(s.components.filter(o=>o.fault).length,1);s.undo();assert.equal(s.currentFault().kind,kind);
}
console.log('PASS both rheostat wrong connections: slider independent full/zero resistance, both-view path restore, JSON validation and one-step replacement undo');
{
 const {s,c}=circuit('potentiometer');s.wires=s.wires.filter(w=>w.start.compId!==c.id&&w.end.compId!==c.id);const previous=s.snapshotState(),n=s.undoStack.length;assert.throws(()=>s.replaceFault('upper',c.id));assert.equal(s.snapshotState(),previous);assert.equal(s.undoStack.length,n);
 s.simulationRunning=false;s.replaceFault('open',c.id);assert.equal(s.simulationRunning,false);assert.equal(s.experimentData().components.find(o=>o.id===c.id).fault,'open');
 for(const type of ['battery','switch'])assert.equal(s.faultKinds(s.createComponent(type)).length,0);
}
console.log('PASS invalid wiring is rejected atomically; paused state persists without starting simulation; switch and power have no faults');
