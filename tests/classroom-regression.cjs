'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dummy={innerHTML:'',textContent:'',hidden:false,classList:{contains:()=>false,toggle(){},remove(){},add(){}},style:{},setAttribute(){},addEventListener(){},querySelector:()=>dummy};
const cache=new Map();
const sandbox={document:{body:dummy,getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},setTimeout:()=>0,clearTimeout(){},Blob};
vm.createContext(sandbox);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1]+'\nthis.Simulator=CircuitSimulator;this.experiments=EXPERIMENTS;',sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../classroom.js'),'utf8'),sandbox);
const copy=x=>JSON.parse(JSON.stringify(x));
function build(index=0){const s=Object.create(sandbox.Simulator.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'schematic',simulationRunning:true,scale:.8,panX:43,panY:21,darkMode:false,showGrid:true,showPotPrinciple:false,activeExperiment:null});for(const fn of ['draw','resizeCanvas','updatePropertiesPanel','updateCircuitInfo','drawMiniSchematic'])s[fn]=()=>{};s.restoreClassroom();s.undoStack=[];s.maxUndo=6;s.suppressUndo=true;sandbox.experiments[index].build(s);s.wires.forEach(w=>{w.view='both';for(const end of [w.start,w.end])if(end.termId==='r3'&&s.components.find(c=>c.id===end.compId).type==='voltmeter')end.termId='r15';});s.suppressUndo=false;s.components.filter(c=>c.type==='switch').forEach(c=>c.state='closed');s.solveCircuit();return s;}
const meterValues=s=>s.components.filter(c=>['ammeter','voltmeter'].includes(c.type)).map(c=>c.measurement);
const assertReadings=(s,values)=>meterValues(s).forEach((v,i)=>assert.ok(Math.abs(v-values[i])<1e-6,JSON.stringify({after:meterValues(s),before:values})));
for(let i=0;i<4;i++){
 const s=build(i),p=s.components.find(c=>c.type==='potentiometer');if(p){p.position=.37;p.potContactMode='pinned';p.potUpperSide=-1;}
 s.wires[0].autoSchematic=true;s.wires[1].bends=[{x:100,y:80}];s.wires[1].realBends=[{x:160,y:95}];s.schematicReference={components:copy(s.components),wires:copy(s.wires)};
 s.components.forEach((c,j)=>{c.realX=c.x+j*10;c.realY=c.y-j*20;c.realRotation=c.rotation;});s.recalc();
 const readings=meterValues(s),graph=JSON.stringify(s.wires.map(w=>[w.start,w.end])),positions=JSON.stringify(s.components.map(c=>[c.x,c.y,c.realX,c.realY,c.realRotation]));
 s.recordSample();s.predictionText='电流怎样变化？';s.predictionHidden=true;s.viewMode='real';
 const saved=s.experimentData();assert.ok(!saved.components.some(c=>c._current!==undefined||c.measurement!==undefined),'derived readings are not persisted');
 const restored=build(i);restored.importExperiment(copy(saved));
 assert.equal(JSON.stringify(restored.wires.map(w=>[w.start,w.end])),graph);assert.equal(JSON.stringify(restored.components.map(c=>[c.x,c.y,c.realX,c.realY,c.realRotation])),positions);assertReadings(restored,readings);
 assert.equal(restored.wires[0].autoSchematic,true);assert.deepEqual(copy(restored.wires[1].bends),[{x:100,y:80}]);assert.deepEqual(copy(restored.wires[1].realBends),[{x:160,y:95}]);assert.equal(restored.records.length,1);assert.equal(restored.predictionHidden,true);assert.equal(restored.scale,.8);assert.equal(restored.panX,43);
 if(p){const rp=restored.components.find(c=>c.type==='potentiometer');assert.equal(rp.position,.37);assert.equal(rp.potContactMode,'pinned');assert.equal(rp.potUpperSide,-1);}
 const added=restored.createComponent('resistor');assert.equal(new Set(restored.components.map(c=>c.id)).size,restored.components.length);assert.ok(added.id);
 restored.undo();assert.equal(restored.components.length,s.components.length);assert.equal(restored.records.length,1);
 console.log('PASS persisted experiment '+(i+1)+': contacts, both layouts, readings, recording, prediction and unique IDs');
}
const invalid=build(0),initial=invalid.snapshotState(),good=invalid.experimentData();
for(const change of [d=>d.version=2,d=>d.components[0].x=NaN,d=>d.components[1].id=d.components[0].id,d=>d.wires[0].start.termId='bad',d=>d.camera.scale=0,d=>d.components[0].type='__proto__',d=>d.components[0].fault='reverse',d=>d.classroom.records=[{U:Infinity,I:1}]]){
 const data=copy(good);change(data);assert.throws(()=>invalid.importExperiment(data));assert.equal(invalid.snapshotState(),initial,'invalid input must not mutate the current experiment');
}
const cameraInjection=copy(good);cameraInjection.camera.components=[];invalid.importExperiment(cameraInjection);assert.equal(invalid.components.length,good.components.length);
console.log('PASS malformed files rejected atomically; camera fields cannot replace the graph');
const fault=build(0),base=meterValues(fault),lamp=fault.components.find(c=>c.type==='bulb'),ends=JSON.stringify(fault.wires.map(w=>[w.start,w.end]));
fault.applyFault('open',lamp.id);assert.equal(lamp.isLit,false);assert.ok(meterValues(fault).every(i=>Math.abs(i)<1e-6));fault.removeFault();assertReadings(fault,base);
fault.applyFault('short',lamp.id);assert.equal(lamp.isLit,false);assert.ok(meterValues(fault)[0]>base[0]*1.9);assert.ok(Math.abs(lamp._current)>base[0]*1.9);fault.removeFault();assertReadings(fault,base);
fault.applyFault('wire-open','0');assert.equal(fault.wires[0]._flowMag,0);assert.ok(meterValues(fault).every(i=>Math.abs(i)<1e-6));fault.removeFault();assertReadings(fault,base);
const am=fault.components.find(c=>c.type==='ammeter'),manualWire=fault.wires.find(w=>[w.start.compId,w.end.compId].includes(am.id));manualWire.bends=[{x:80,y:40}];manualWire.realBends=[{x:100,y:140}];const manual=JSON.stringify([manualWire.bends,manualWire.realBends]);fault.applyFault('reverse',am.id);assert.ok(am.measurement<0);fault.faultHidden=true;
const savedFault=fault.experimentData(),restoredFault=build(0);restoredFault.importExperiment(savedFault);assert.equal(restoredFault.faultHidden,true);assert.ok(restoredFault.components.find(c=>c.id===am.id).measurement<0);
restoredFault.removeFault();const restoredManual=restoredFault.wires.find(w=>[w.start.compId,w.end.compId].includes(am.id));assert.equal(JSON.stringify([restoredManual.bends,restoredManual.realBends]),manual);assert.equal(JSON.stringify(restoredFault.wires.map(w=>[w.start,w.end])),ends);assertReadings(restoredFault,base);
fault.undo();assert.equal(fault.currentFault(),null);assertReadings(fault,base);
console.log('PASS open load, zero-resistance short, broken wire and reversed ammeter affect physics and are reversible');
const short=build(0);short.components.filter(c=>c.type==='bulb').forEach(c=>c.fault='short');short.solveCircuit();assert.equal(short._solutionState,'short');assert.equal(short.shortCircuit,true);assert.throws(()=>short.recordSample());
console.log('PASS source short through ideal ammeters is detected without recording an invalid result');
const records=build(2),r1=records.recordSample(),pot=records.components.find(c=>c.type==='potentiometer');pot.position=.2;records.recalc();const r2=records.recordSample();assert.equal(r1.series,r2.series);assert.notEqual(r1.I,r2.I);assert.equal(r1.meters.length,2);assert.equal(r2.sliders[0].position,.2);
records.components.find(c=>c.type==='resistor').resistance=30;records.recalc();assert.notEqual(records.recordSample().series,r1.series);
const vmeter=records.components.find(c=>c.type==='voltmeter');const oldRange=vmeter.range;vmeter.range=3;assert.throws(()=>records.measurementValue(vmeter.id,'V'));vmeter.range=oldRange;
records.predictionHidden=true;assert.throws(()=>records.recordSample());assert.equal(records.bulbAppearance({current:1,resistance:10}).lit,false);assert.equal(records.potCurrentPaths(pot,'real').length,0);
records.predictionHidden=false;records.records[0].label='=HYPERLINK("example")';assert.ok(records.recordsCSV().includes("'=HYPERLINK"));assert.ok(records.recordsCSV().includes('全部电表读数'));
console.log('PASS variable-controlled record grouping, all-meter snapshots, prediction masks and CSV formula escaping');
const auto=build(1);auto._classroomReady=true;auto.flushAutosave();assert.ok(cache.has('elec-lab-experiment-v1'));const stored=cache.get('elec-lab-experiment-v1');auto._recoveryPending=true;auto.components=[];auto.flushAutosave();assert.equal(cache.get('elec-lab-experiment-v1'),stored);
sandbox.localStorage.setItem=()=>{throw new Error('quota');};auto._recoveryPending=false;auto.flushAutosave();assert.match(dummy.textContent,/自动保存失败/);
console.log('PASS autosave storage, pending-recovery protection and unavailable/quota-exceeded storage');
