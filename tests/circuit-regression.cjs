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
 s.viewMode='real';s.layoutRealCircuit(true);s.solveCircuit();
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

function buildUserMixed(){
 const m=build(0);m.components=[];m.wires=[];m.idCounter=0;m.viewMode='schematic';
 const b=m.createComponent('battery',{x:200,y:100,voltage:3}),sw=m.createComponent('switch',{x:500,y:100,state:'closed'}),r1=m.createComponent('resistor',{x:200,y:280,resistance:10}),r2=m.createComponent('resistor',{x:200,y:400,resistance:20}),am=m.createComponent('ammeter',{x:400,y:400}),r3=m.createComponent('resistor',{x:580,y:400,resistance:10}),v=m.createComponent('voltmeter',{x:580,y:280}),pot=m.createComponent('potentiometer',{x:800,y:400});
 const wire=(a,ta,b,tb)=>m.connectTerminals(a,ta,b,tb,[],'both');
 wire(b,'pos',r1,'a');wire(r1,'a',r2,'a');wire(r1,'b',r2,'b');wire(r2,'b',am,'r0_6');wire(am,'neg',r3,'a');wire(r3,'a',v,'r3');wire(v,'neg',r3,'b');wire(r3,'b',pot,'a');wire(pot,'d',sw,'b');wire(sw,'a',b,'neg');return m;
}
function assertSafeRoutes(m){
 const roots=new Map(),find=k=>{if(!roots.has(k))roots.set(k,k);while(roots.get(k)!==k)k=roots.get(k);return k;};
 for(const w of m.wires)roots.set(find(m.wireEndKey(w,'start')),find(m.wireEndKey(w,'end')));
 const paths=m.wires.map(w=>m.sampleRealWirePath(m.resolveRealWire(w)));
 m.wires.forEach((w,i)=>{
  assert.ok(!w._routeBlocked,'fixture must have a complete route');
  for(const c of m.components){
   const own=c.id===w.start.compId||c.id===w.end.compId,p=m.componentPos(c);
   const box=own&&['ammeter','voltmeter'].includes(c.type)?(m.viewMode==='real'?{left:p.x-64,right:p.x+64,top:p.y-78,bottom:p.y+20}:{left:p.x-18,right:p.x+18,top:p.y-18,bottom:p.y+18}):own?null:m.realComponentBox(c,0);
   if(box)assert.ok(!paths[i].slice(1).some((q,j)=>m.segmentIntersectsBox(paths[i][j],q,box)),`wire ${i} covers ${own?'its own meter face':'another component'} ${c.id}`);
  }
  for(let k=0;k<i;k++){
   if(find(m.wireEndKey(w,'start'))===find(m.wireEndKey(m.wires[k],'start')))continue;
   const overlaps=(a,b,c,d)=>{
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)return false;
    if(Math.abs(dx*(c.y-a.y)-dy*(c.x-a.x))/len>.01||Math.abs(dx*(d.y-a.y)-dy*(d.x-a.x))/len>.01)return false;
    const u=((c.x-a.x)*dx+(c.y-a.y)*dy)/len,v=((d.x-a.x)*dx+(d.y-a.y)*dy)/len;
    return Math.min(len,Math.max(u,v))-Math.max(0,Math.min(u,v))>3;
   };
   assert.ok(!paths[i].slice(1).some((p,j)=>paths[k].slice(1).some((q,l)=>m.segmentsIntersect(paths[i][j],p,paths[k][l],q)||overlaps(paths[i][j],p,paths[k][l],q))),`unconnected wires ${i}/${k} cross`);
  }
 });
}
for(let fixture=0;fixture<5;fixture++)for(const reverse of [false,true]){
 const m=fixture===4?buildUserMixed():build(fixture);if(reverse)m.wires.reverse();
 m.solveCircuit();const before=m.components.map(c=>c.measurement||0),connections=JSON.stringify(m.wires.map(w=>[w.start,w.end])),schematic=JSON.stringify(m.components.map(c=>[c.x,c.y,c.rotation]));
 m.viewMode='real';m.layoutRealCircuit(true);m.solveCircuit();
 assert.equal(m._realLayoutKind,'series-parallel');assert.equal(JSON.stringify(m.wires.map(w=>[w.start,w.end])),connections);assert.equal(JSON.stringify(m.components.map(c=>[c.x,c.y,c.rotation])),schematic);
 m.components.forEach((c,i)=>assert.ok(Math.abs((c.measurement||0)-before[i])<1e-6));assertSafeRoutes(m);
 const real=JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX]));m.layoutRealCircuit();assert.equal(JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX])),real,'unchanged circuit must not jump on repeated view changes');
 console.log(`PASS physical layout fixture ${fixture+1}, ${reverse?'reversed':'original'} wire order: no crossing, no face coverage, unchanged topology/readings`);
}
const reorganized=buildUserMixed();reorganized.viewMode='real';reorganized.layoutRealCircuit(true);
const frozenPath=reorganized.wires[0];frozenPath.realBends=[{x:500,y:400}];reorganized.layoutRealCircuit(true);assert.equal(frozenPath.realBends,null);assertSafeRoutes(reorganized);
assert.equal(JSON.parse(reorganized.snapshotState()).realLayoutSignature,reorganized._realLayoutSignature);
console.log('PASS reorganize discards stale physical bends and preserves layout identity in undo snapshots');
for(let fixture=0;fixture<5;fixture++)for(const reverse of [false,true]){
 const m=fixture===4?buildUserMixed():build(fixture);if(reverse)m.wires.reverse();
 m.viewMode='real';m.layoutRealCircuit(true);m.solveCircuit();
 const readings=m.components.map(c=>c.measurement||0),ends=JSON.stringify(m.wires.map(w=>[w.start,w.end])),real=JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX]));
 m.viewMode='schematic';m.layoutSchematicCircuit(true);m.solveCircuit();
 assert.equal(JSON.stringify(m.wires.map(w=>[w.start,w.end])),ends);assert.equal(JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX])),real);
 m.components.forEach((c,i)=>assert.ok(Math.abs((c.measurement||0)-readings[i])<1e-6));
 // Reuse clearance/crossing checks with unsmoothed schematic polylines.
 m.resolveRealWire=m.resolveWire;m.sampleRealWirePath=p=>p;assertSafeRoutes(m);
 for(const w of m.wires){const p=m.resolveWire(w);for(let i=1;i<p.length;i++)assert.ok(Math.abs(p[i].x-p[i-1].x)<1e-6||Math.abs(p[i].y-p[i-1].y)<1e-6,'schematic segment must be orthogonal');}
 const geometry=JSON.stringify(m.components.map(c=>[c.x,c.y,c.schematicFlipX]));m.layoutSchematicCircuit();assert.equal(JSON.stringify(m.components.map(c=>[c.x,c.y,c.schematicFlipX])),geometry);
 console.log(`PASS schematic layout fixture ${fixture+1}, ${reverse?'reversed':'original'}: orthogonal, clear, unchanged topology/readings`);
}
