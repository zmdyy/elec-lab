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
