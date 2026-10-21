'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dummy={style:{},classList:{contains:()=>false,toggle(){},remove(){},add(){}},querySelector:()=>dummy};
const box={document:{getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}},setTimeout:()=>0,clearTimeout(){},Blob};
vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]+';this.S=CircuitSimulator;this.experiments=EXPERIMENTS;',box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../classroom.js'),'utf8'),box);
const clone=x=>JSON.parse(JSON.stringify(x));
function build(index){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'schematic',simulationRunning:true,scale:1,panX:0,panY:0,undoStack:[],maxUndo:10,suppressUndo:true});for(const fn of ['draw','updatePropertiesPanel','updateCircuitInfo','drawMiniSchematic','applyTheme','syncViewButton','togglePotPrinciple','restoreGuide','updateMiniSchematicVisibility','resizeCanvas','fitView'])s[fn]=()=>{};s.restoreClassroom();box.experiments[index].build(s);s.wires.forEach(w=>w.view='both');s.components.filter(c=>c.type==='switch').forEach(c=>c.state='closed');s.suppressUndo=false;return s;}
const near=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
assert.equal(box.experiments.length,13);
{
 const s=build(10),r=s.recordLoad(),pot=s.components.find(c=>c.type==='potentiometer');
 for(const pos of [1,.75,.5,.25,0]){pot.position=pos;const rec=s.recordSample();near(rec.U/rec.I,r.resistance,2e-4);}
 assert.equal(new Set(s.records.map(r=>r.series)).size,1);assert.ok(s.records.at(-1).I>s.records[0].I);
 r.resistance=20;assert.notEqual(s.recordSeries(),s.records[0].series);
 console.log('PASS fixed R: five I-U points, proportional readings and grouping by the controlled resistance');
}
{
 const s=build(11),r=s.recordLoad(),pot=s.components.find(c=>c.type==='potentiometer');
 assert.throws(()=>s.recordSample(),/2 V/);assert.equal(s.records.length,0);
 for(const resistance of [5,10,15,20]){r.resistance=resistance;pot.position=2*resistance/50;const rec=s.recordSample();near(rec.U,2,3e-5);near(rec.I*resistance,2,6e-5);assert.equal(rec.loadResistance,resistance);}
 assert.equal(new Set(s.records.map(r=>r.series)).size,1,'changing the independent R variable must not split the plot');
 pot.position=1;assert.throws(()=>s.recordSample(),/2 V/);
 const data=s.experimentData(),restored=build(0);restored.importExperiment(clone(data));assert.equal(restored.recordLoad().controlVoltage,2);assert.deepEqual(clone(restored.records.map(r=>r.loadResistance)),[5,10,15,20]);
 assert.match(s.recordsCSV(),/接入电阻/);
 const invalid=clone(data);invalid.components.find(c=>c.experimentRole==='ir-load').controlVoltage=NaN;assert.throws(()=>restored.importExperiment(invalid));
 console.log('PASS fixed U: wrong control voltage rejected, four R values share an I-R series, JSON/CSV roundtrip');
}
{
 const s=build(12),lamp=s.recordLoad(),pot=s.components.find(c=>c.type==='potentiometer');
 const values=[];
 for(const pos of [1,.75,.5,.25,0]){pot.position=pos;const rec=s.recordSample();assert.equal(s._solutionState,'closed');values.push({U:rec.U,I:rec.I,R:rec.U/rec.I,power:s.bulbAppearance(lamp).power});near(s.bulbAppearance(lamp).power,Math.abs(lamp._voltage*lamp._current),1e-7);}
 for(let i=1;i<values.length;i++){assert.ok(values[i].U>values[i-1].U);assert.ok(values[i].I>values[i-1].I);assert.ok(values[i].R>values[i-1].R);assert.ok(values[i].power>values[i-1].power);}
 assert.ok(values.at(-1).R-values[0].R>3);assert.equal(new Set(s.records.map(r=>r.series)).size,1);
 const hot=lamp.resistance,rated=hot*lamp.ratedCurrent;near(s.filamentResistance(0,lamp),hot/10);near(s.filamentResistance(rated,lamp),hot);near(s.filamentResistance(-rated,lamp),hot);
 const data=s.experimentData(),restored=build(0);restored.importExperiment(clone(data));assert.equal(restored.recordLoad().bulbModel,'filament');near(restored.recordLoad().current,lamp.current);
 restored.saveUndo();restored.recordLoad().bulbModel='fixed';restored.solveCircuit();restored.undo();assert.equal(restored.recordLoad().bulbModel,'filament');
 data.components.find(c=>c.type==='bulb').bulbModel='unsupported';assert.throws(()=>restored.importExperiment(data));
 console.log('PASS filament: monotone nonlinear I-U/R/power, rated and cold calibration, polarity, persistence and undo '+JSON.stringify(values));
 // Sweep the physical slider, including nearly zero volts and reversed supply.
 const b=s.components.find(c=>c.type==='battery');for(const voltage of [0,.001,.03,.3,3,6])for(let k=0;k<=20;k++){b.voltage=voltage;pot.position=k/20;s.solveCircuit();assert.ok(voltage===0?['open','closed'].includes(s._solutionState):s._solutionState==='closed',JSON.stringify({voltage,k,state:s._solutionState}));assert.ok(Number.isFinite(lamp.current)&&Number.isFinite(lamp._effectiveResistance));}
 // Reverse physical bulb leads, retaining the ammeter's correct circuit direction.
 const current=lamp.current;for(const w of s.wires)for(const end of ['start','end'])if(w[end].compId===lamp.id)w[end].termId=w[end].termId==='shell'?'tip':'shell';s.solveCircuit();near(lamp.current,current);
 console.log('PASS filament solver: slider/voltage sweep, zero supply, overload and reversed bulb polarity');
}
{
 const s=build(9),lamp=s.components.find(c=>c.type==='bulb'),pot=s.components.find(c=>c.type==='potentiometer');
 for(const position of [0,.5,1]){pot.position=position;s.solveCircuit();near(Math.abs(lamp._voltage/lamp._current),10);}
 console.log('PASS legacy fixed-resistance lamp experiment retains its original electrical model');
}

{
 const s=build(12),lamp=s.recordLoad(),p=s.components.find(c=>c.type==='potentiometer');p.position=.5;
 const led=s.createComponent('led',{forwardVoltage:1.8,resistance:10});
 const lead=s.wires.find(w=>w.end.compId===lamp.id&&w.end.termId==='tip');lead.end={compId:led.id,termId:'a'};
 s.connectTerminals(led,'b',lamp,'tip',[],'both');
 for(const voltage of [1,1.8,2,3,6]){s.components.find(c=>c.type==='battery').voltage=voltage;s.solveCircuit();assert.ok(['open','closed'].includes(s._solutionState));assert.ok(Number.isFinite(lamp.current));near(Math.abs(led._current),lamp.current+Math.abs(s.components.find(c=>c.type==='voltmeter')._current),1e-7);if(voltage>1.8)assert.ok(lamp.current>0);}
 console.log('PASS mixed LED and filament loads converge and satisfy current balance');
}
