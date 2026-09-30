// Run: node tests/circuit-regression.cjs. No third-party dependencies.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const dummy={classList:{contains:()=>false,toggle(){},remove(){}},style:{}};
const sandbox={document:{getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(sandbox);vm.runInContext(code+'\nthis.Simulator=CircuitSimulator;this.experiments=EXPERIMENTS;',sandbox);
function build(index){const s=Object.create(sandbox.Simulator.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'schematic',simulationRunning:true});
for(const name of ['draw','saveUndo','updatePropertiesPanel','updateCircuitInfo','recalc'])s[name]=()=>{};
sandbox.experiments[index].build(s);s.wires.forEach(w=>w.view='both');return s;}
for(let index=0;index<4;index++){
 const s=build(index);if(index===2)s.components.find(c=>c.type==='switch').state='closed';
 s.solveCircuit();const before=s.components.map(c=>c.measurement||0),topology=JSON.stringify(s.wires.map(w=>[w.start,w.end])),positions=JSON.stringify(s.components.map(c=>[c.x,c.y]));
 s.viewMode='real';s.spaceRealComponents();s.solveCircuit();
 assert.equal(JSON.stringify(s.wires.map(w=>[w.start,w.end])),topology);
 assert.equal(JSON.stringify(s.components.map(c=>[c.x,c.y])),positions);
 // Solver regularization depends on ground-node ordering: allow < 1 micro-unit numerical drift.
 s.components.forEach((c,i)=>assert.ok(Math.abs((c.measurement||0)-before[i])<1e-6,'conversion changed reading'));
 for(const w of s.wires){const pts=s.sampleRealWirePath(s.resolveRealWire(w));assert.ok(pts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.deepEqual(pts[0],s.wireEndPos(w,'start'));assert.deepEqual(pts.at(-1),s.wireEndPos(w,'end'));
 for(const c of s.components){if([w.start.compId,w.end.compId].includes(c.id))continue;const box=s.realComponentBox(c,0);
 assert.ok(!pts.slice(1).some((p,j)=>s.segmentIntersectsBox(pts[j],p,box)),`experiment ${index}: wire through ${c.id}`);}
 }
 const routes=s._routes;s.resolveRealWire(s.wires[0]);assert.equal(s._routes,routes,'animation should reuse route cache');
 s.components[0].realY=s.components[0].realY??s.components[0].y;s.components[0].realX=(s.components[0].realX??s.components[0].x)+20;s.resolveRealWire(s.wires[0]);assert.notEqual(s._routes,routes,'drag must invalidate routes');
 console.log(`PASS experiment ${index+1}: topology, readings, curve clearance, endpoints, route cache`);
}
const s=build(0);s.viewMode='real';const battery=s.components.find(c=>c.type==='battery');
for(const voltage of [1.5,3,6,12]){battery.voltage=voltage;const t=s.terminals(battery),pos=t.find(t=>t.id==='pos'),neg=t.find(t=>t.id==='neg');assert.ok(voltage<=3?pos.x<neg.x:pos.x>neg.x);}
const am=s.components.find(c=>c.type==='ammeter');assert.equal(s.terminals(am).find(t=>t.id==='neg').x,-37.2);
console.log('PASS battery polarity for 1.5/3/6/12 V and reused meter terminal geometry');

// Three meters must measure the same series current without rewiring.
const series=build(0),meters=series.components.filter(c=>c.type==='ammeter');
assert.equal(meters.length,3);
for(const voltage of [1.5,3,6]){
 series.components.find(c=>c.type==='battery').voltage=voltage;series.solveCircuit();
 assert.ok(Math.max(...meters.map(c=>c.measurement))-Math.min(...meters.map(c=>c.measurement))<1e-6);
 assert.ok(meters.every(c=>c.measurement>0));
}
// Rheostat A-P and B-P connections both retain their physical meaning in either view.
for(const terminal of ['a','b']){
 const rheostat=build(3),pot=rheostat.components.find(c=>c.type==='potentiometer'),lamp=rheostat.components.find(c=>c.type==='bulb');
 for(const wire of rheostat.wires)for(const end of ['start','end'])if(wire[end].compId===pot.id&&wire[end].termId==='a')wire[end].termId=terminal;
 const powers=[];
 for(const position of [0,.25,.5,.75,1]){
  pot.position=position;rheostat.viewMode='schematic';rheostat.solveCircuit();const schematicPower=rheostat.bulbAppearance(lamp).power;
  rheostat.viewMode='real';rheostat.solveCircuit();const appearance=rheostat.bulbAppearance(lamp);powers.push(appearance.power);
  assert.ok(Math.abs(appearance.power-schematicPower)<1e-6);
 }
 for(let i=1;i<powers.length;i++)assert.ok(terminal==='a'?powers[i]<powers[i-1]:powers[i]>powers[i-1]);
}
const lamp={current:0,ratedCurrent:.3,resistance:10},levels=[];
for(const current of [0,.03,.06,.15,.3]){lamp.current=current;levels.push(series.bulbAppearance(lamp).level);}
for(let i=1;i<levels.length;i++)assert.ok(levels[i]>levels[i-1]);
series.simulationRunning=false;assert.equal(series.bulbAppearance(lamp).level,0);
series.viewMode='schematic';series.darkMode=true;assert.equal(series.schematicInk,'#e2e8f0');assert.equal(series.flowColor,'#ff6666');
series.darkMode=false;assert.equal(series.flowColor,'#dc2626');
console.log('PASS three simultaneous meters, both rheostat connections, power-based brightness, and theme palettes');
