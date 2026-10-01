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

function assertEquivalentConnections(m,saved){
 const fingerprint=rows=>{
  const parent=new Map(),find=k=>{if(!parent.has(k))parent.set(k,k);while(parent.get(k)!==k)k=parent.get(k);return k;};
  for(const c of m.components)for(const t of m.terminals(c))find(c.id+'_'+t.id);
  for(const ends of rows){const a=ends[0].compId+'_'+ends[0].termId,b=ends[1].compId+'_'+ends[1].termId;parent.set(find(a),find(b));}
  const nodes=new Map();for(const c of m.components)for(const t of m.terminals(c)){
   const node=find(c.id+'_'+t.id);if(!nodes.has(node))nodes.set(node,[]);
   const passive=['bulb','resistor','switch'].includes(c.type);nodes.get(node).push(c.id+'_'+(passive?'passive':t.id));
  }
  return JSON.stringify([...nodes.values()].map(a=>a.sort().join('|')).sort());
 };
 assert.equal(m.wires.length,JSON.parse(saved).length,'optimization must not remove or add wires');
 assert.equal(fingerprint(m.wires.map(w=>[w.start,w.end])),fingerprint(JSON.parse(saved)),
  'electrical nodes must retain every source/meter/rheostat post, allowing symmetric passive ends and junction relocation within the same node');
}

for(let index=0;index<4;index++){
 const s=build(index);if(index===2)s.components.find(c=>c.type==='switch').state='closed';
 s.solveCircuit();const before=s.components.map(c=>c.measurement||0),topology=JSON.stringify(s.wires.map(w=>[w.start,w.end])),positions=JSON.stringify(s.components.map(c=>[c.x,c.y]));
 s.viewMode='real';s.layoutRealCircuit(true);s.solveCircuit();
 assertEquivalentConnections(s,topology);
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
for(const voltage of [1.5,3,6,12]){battery.voltage=voltage;const t=s.terminals(battery),pos=t.find(t=>t.id==='pos'),neg=t.find(t=>t.id==='neg');assert.ok(pos.x>neg.x);}
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
 if(m.viewMode==='real'){const report=m.wireRoutesReport(new Map(m.wires.map((w,i)=>[w,paths[i]])));assert.ok(report.clear,`strict physical audit: ${report.body.length} obstructions, ${report.conflicts.length} wire conflicts, ${report.self.length} self crossings`);}
 m.wires.forEach((w,i)=>{
  assert.ok(!w._routeBlocked,'fixture must have a complete route');
  for(const c of m.components){
   const own=c.id===w.start.compId||c.id===w.end.compId,p=m.componentPos(c);
   const box=own&&['ammeter','voltmeter'].includes(c.type)?(m.viewMode==='real'?{left:p.x-64,right:p.x+64,top:p.y-78,bottom:p.y+20}:{left:p.x-18,right:p.x+18,top:p.y-18,bottom:p.y+18}):own?null:m.realComponentBox(c,0);
   const local=q=>{const a=-m.componentAngle(c)*Math.PI/180;return {x:(q.x-p.x)*Math.cos(a)-(q.y-p.y)*Math.sin(a),y:(q.x-p.x)*Math.sin(a)+(q.y-p.y)*Math.cos(a)};};
   if(own&&m.viewMode==='real'&&['ammeter','voltmeter'].includes(c.type)){assert.ok(!paths[i].slice(1).some((q,j)=>m.segmentIntersectsBox(local(paths[i][j]),local(q),{left:-64,right:64,top:-108,bottom:20})));continue;}
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
 assert.equal(m._realLayoutKind,'series-parallel');assertEquivalentConnections(m,connections);assert.equal(JSON.stringify(m.components.map(c=>[c.x,c.y,c.rotation])),schematic);
 m.components.forEach((c,i)=>assert.ok(Math.abs((c.measurement||0)-before[i])<1e-6));assertSafeRoutes(m);
 const real=JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX]));m.layoutRealCircuit();assert.equal(JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX])),real,'unchanged circuit must not jump on repeated view changes');
 console.log(`PASS physical layout fixture ${fixture+1}, ${reverse?'reversed':'original'} wire order: no crossing, no face coverage, equivalent topology/unchanged readings`);
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
 assertEquivalentConnections(m,ends);assert.equal(JSON.stringify(m.components.map(c=>[c.realX,c.realY,c.realFlipX])),real);
 m.components.forEach((c,i)=>assert.ok(Math.abs((c.measurement||0)-readings[i])<1e-6));
 // Reuse clearance/crossing checks with unsmoothed schematic polylines.
 m.resolveRealWire=m.resolveWire;m.sampleRealWirePath=p=>p;assertSafeRoutes(m);
 for(const w of m.wires){const p=m.resolveWire(w);for(let i=1;i<p.length;i++)assert.ok(Math.abs(p[i].x-p[i-1].x)<1e-6||Math.abs(p[i].y-p[i-1].y)<1e-6,'schematic segment must be orthogonal');}
 const geometry=JSON.stringify(m.components.map(c=>[c.x,c.y,c.schematicFlipX]));m.layoutSchematicCircuit();assert.equal(JSON.stringify(m.components.map(c=>[c.x,c.y,c.schematicFlipX])),geometry);
 console.log(`PASS schematic layout fixture ${fixture+1}, ${reverse?'reversed':'original'}: orthogonal, clear, equivalent topology/unchanged readings`);
}

// All four rheostat contacts, both polarities, and the unused coil portion.
for(const lower of ['a','b'])for(const upper of ['c','d'])for(const reversed of [false,true]){
 const m=build(3),pot=m.components.find(c=>c.type==='potentiometer');
 for(const w of m.wires)for(const end of ['start','end'])if(w[end].compId===pot.id)w[end].termId=['a','b'].includes(w[end].termId)?lower:upper;
 if(reversed)m.components.find(c=>c.type==='battery').voltage*=-1;
 pot.position=.37;m.solveCircuit();
 for(const view of ['real','schematic','principle']){
  const paths=m.potCurrentPaths(pot,view);assert.equal(paths.length,3,'only live coil half, slider and connected rod half animate');
  assert.ok(paths.every(p=>p.current>1e-6));
  const top=view==='principle'?55:view==='real'?-30:-28;
  const rod=paths.find(p=>p.points.every(q=>q.y===top));assert.ok(rod);
  const terminalX=view==='principle'?(upper==='c'?80:520):view==='real'?(upper==='c'?-112:112):48;
  assert.ok(rod.points.some(p=>p.x===terminalX),'rod must reach actual connected post');
 }
 m.simulationRunning=false;assert.equal(m.potCurrentPaths(pot,'real').length,0);
}
const oriented=buildUserMixed();oriented.components.forEach((c,i)=>{c.rotation=i%2?90:0;c.realRotation=c.rotation;});
const rotations=JSON.stringify(oriented.components.map(c=>[c.rotation,c.realRotation]));
for(const view of ['real','schematic']){oriented.viewMode=view;oriented.layoutCircuit(true,view==='real');assert.equal(JSON.stringify(oriented.components.map(c=>[c.rotation,c.realRotation])),rotations);assert.ok(oriented.components.every(c=>!c.realFlipX&&!c.schematicFlipX));oriented.components.forEach(c=>assert.equal(oriented.componentAngle(c),view==='real'?c.realRotation:c.rotation));}
console.log('PASS rheostat live paths in three views, four contact combinations, both polarities, stopped flow, and preserved rotations');
function buildFeedback(){
 const m=build(0);m.components=[];m.wires=[];
 const b=m.createComponent('battery',{voltage:3,x:400,y:100}),sw=m.createComponent('switch',{state:'closed',x:100,y:400}),l=m.createComponent('bulb',{x:260,y:400}),r=m.createComponent('resistor',{resistance:20,x:440,y:280}),l2=m.createComponent('bulb',{x:440,y:500}),am=m.createComponent('ammeter',{x:620,y:400}),p=m.createComponent('potentiometer',{x:800,y:400,position:.47});
 const w=(a,ta,b,tb)=>m.connectTerminals(a,ta,b,tb,[],'both');
 w(b,'pos',p,'c');w(p,'a',am,'r0_6');w(am,'neg',l2,'tip');w(l2,'tip',r,'b');w(r,'a',l2,'shell');w(l2,'shell',l,'tip');w(l,'shell',sw,'b');w(sw,'a',b,'neg');return m;
}
for(const view of ['real','schematic']){
 const m=buildFeedback();m.viewMode=view;m.layoutCircuit(true,view==='real');m.solveCircuit();
 if(view==='schematic'){m.resolveRealWire=m.resolveWire;m.sampleRealWirePath=p=>p;}
 assertSafeRoutes(m);console.log('PASS latest screenshot circuit, fixed orientation, '+view);
}
const balanced=buildFeedback();balanced.solveCircuit();
assert.ok(balanced.wires.every(w=>w._flowMag>1e-6&&w._flowDir===1),'all wires in screenshot fixture must flow from their start to end');
const pot=balanced.components.find(c=>c.type==='potentiometer');
assert.ok(Math.abs(balanced.connectedWireTerminalFlow(pot,'c')+pot._potI1+pot._potI2)<1e-6,'rod and resistor currents must balance');
balanced.components.find(c=>c.type==='switch').state='open';balanced.solveCircuit();assert.ok(balanced.wires.every(w=>w._flowMag===0));
console.log('PASS complete branch current balance, switch continuity and open-circuit animation');

function buildLatestMeasurement(){
 const m=build(0);m.components=[];m.wires=[];
 const b=m.createComponent('battery',{voltage:3,x:760,y:110}),p=m.createComponent('potentiometer',{x:190,y:500}),r=m.createComponent('resistor',{resistance:10,x:480,y:365}),v=m.createComponent('voltmeter',{x:480,y:590}),a=m.createComponent('ammeter',{x:770,y:477}),l1=m.createComponent('bulb',{x:1060,y:365}),l2=m.createComponent('bulb',{x:1060,y:590}),s=m.createComponent('switch',{state:'open',x:1350,y:477});
 const w=(a,ta,b,tb)=>m.connectTerminals(a,ta,b,tb,[],'both');
 w(b,'pos',p,'a');w(p,'c',r,'a');w(r,'a',v,'r3');w(r,'b',v,'neg');w(r,'b',a,'r0_6');w(a,'neg',l1,'shell');w(l1,'shell',l2,'shell');w(l1,'tip',l2,'tip');w(l2,'tip',s,'b');w(s,'a',b,'neg');return m;
}

// The annotated reference has the switch at the positive end and the meters' positive posts on the lamp side.
// Build that polarity explicitly; equivalent passive wiring must preserve these meter/source posts.
function buildRedLineMeasurement(){
 const m=buildLatestMeasurement();
 for(const w of m.wires)for(const end of ['start','end']){
  const e=w[end],c=m.components.find(c=>c.id===e.compId);
  if(c.type==='battery')e.termId=e.termId==='pos'?'neg':'pos';
  if(c.type==='ammeter')e.termId=e.termId==='neg'?'r0_6':'neg';
  if(c.type==='voltmeter')e.termId=e.termId==='neg'?'r3':'neg';
 }
 return m;
}
for(const builder of [buildLatestMeasurement,buildRedLineMeasurement])for(const reverse of [false,true]){
 const m=builder();if(reverse)m.wires.reverse();
 m.components.find(c=>c.type==='switch').state='closed';m.solveCircuit();
 const connections=JSON.stringify(m.wires.map(w=>[w.start,w.end])),before=m.components.map(c=>c.measurement||0),rotations=m.components.map(c=>c.rotation);
 for(const mode of ['real','schematic','real']){
  m.viewMode=mode;m.layoutCircuit(true,mode==='real');m.solveCircuit();
  assertEquivalentConnections(m,connections);
  m.components.forEach((c,i)=>{assert.equal(c.rotation,rotations[i]);assert.equal(m.componentAngle(c),rotations[i]);assert.ok(Math.abs((c.measurement||0)-before[i])<1e-6);});
  if(mode==='real'){
   assertSafeRoutes(m);assert.equal(m._routingMode,'independent');
   const load=m.components.find(c=>c.type==='resistor'),meter=m.components.find(c=>c.type==='voltmeter');
   assert.equal(load.realX,meter.realX);assert.ok(meter.realY<load.realY);
   const battery=m.components.find(c=>c.type==='battery'),ammeter=m.components.find(c=>c.type==='ammeter');
   const neighbor=(c,term)=>{const w=m.wires.find(w=>['start','end'].some(end=>w[end].compId===c.id&&w[end].termId===term));return m.components.find(other=>other.id===w[w.start.compId===c.id?'end':'start'].compId);};
   assert.ok(neighbor(battery,'pos').realX>battery.realX,'positive supply lead must feed the right side of the loop');
   assert.ok(neighbor(battery,'neg').realX<battery.realX,'negative supply lead must return from the left side');
   assert.ok(neighbor(ammeter,'r0_6').realX>ammeter.realX,'meter positive lead must approach from the right');
   assert.ok(neighbor(ammeter,'neg').realX<ammeter.realX,'meter negative lead must leave towards the left');
   assert.ok(ammeter.measurement>0&&meter.measurement>0,'meter readings must retain positive polarity');
  }else{
   const resolve=m.resolveRealWire,sample=m.sampleRealWirePath;
   m.resolveRealWire=m.resolveWire;m.sampleRealWirePath=p=>p;assertSafeRoutes(m);
   m.resolveRealWire=resolve;m.sampleRealWirePath=sample;
   const load=m.components.find(c=>c.type==='resistor'),meter=m.components.find(c=>c.type==='voltmeter');
   assert.equal(load.x,meter.x);assert.ok(meter.y<load.y);
   assert.ok(m.schematicJunctionPoints().length>=4,'parallel branches need visible junction dots');
   for(const w of m.wires){const path=m.resolveWire(w);path.slice(1).forEach((q,i)=>assert.ok(Math.abs(q.x-path[i].x)<1e-6||Math.abs(q.y-path[i].y)<1e-6));}
  }
 }
 console.log('PASS '+(builder===buildRedLineMeasurement?'annotated red-line':'latest')+' resistor/voltmeter and parallel lamps, '+(reverse?'reversed':'original')+' wire order: right-to-left positive flow, independent curves, measured pairing, junction dots, repeat conversion and equivalent connections/unchanged readings/angles');
}
// A common electrical net must not exempt long overlapping physical leads.
const overlap=buildLatestMeasurement();overlap.viewMode='real';overlap.layoutRealCircuit(true);
const x=overlap.wires[1],y=overlap.wires[2],post=overlap.wireEndPos(x,'end');
const sharedLine=[post,{x:post.x-100,y:post.y},{x:post.x-160,y:post.y+100}];
assert.equal(overlap.wireRoutesReport(new Map([[x,sharedLine],[y,sharedLine]])).conflicts.length,1);
console.log('PASS strict detection of overlapping wires on a shared terminal');

const disconnected=build(0);disconnected.components=[];disconnected.viewMode='schematic';disconnected.wires=[
 {id:'X',start:{x:0,y:50},end:{x:100,y:50},bends:[]},
 {id:'Y',start:{x:50,y:0},end:{x:50,y:100},bends:[{x:50,y:50}]}
];
assert.equal(disconnected.schematicJunctionPoints().length,0,'crossing disconnected wires must not acquire a junction dot');
console.log('PASS schematic junctions only mark electrically connected branches');

// Physical teaching layouts should fill both dimensions instead of forming a very wide strip.
for(const builder of [()=>build(0),()=>build(1),()=>build(2),()=>build(3),buildUserMixed,buildFeedback,buildLatestMeasurement,buildRedLineMeasurement]){
 const m=builder();m.viewMode='real';m.layoutRealCircuit(true);
 const boxes=m.components.map(c=>m.realComponentBox(c,0));
 const width=Math.max(...boxes.map(b=>b.right))-Math.min(...boxes.map(b=>b.left));
 const height=Math.max(...boxes.map(b=>b.bottom))-Math.min(...boxes.map(b=>b.top));
 assert.ok(width/height>=.85&&width/height<=2.1,'physical layout must have a balanced width and height');
 assert.ok(width<=1300,'these teaching fixtures must fit a compact component footprint');
}
console.log('PASS eight compact physical layouts: balanced proportions and bounded horizontal span');

// Electrical equivalence must reject moving a split past a zero-ohm ammeter.
const movedSplit=build(1),splitBefore=JSON.stringify(movedSplit.wires.map(w=>[w.start,w.end]));
const mainMeter=movedSplit.components.find(c=>c.type==='ammeter');
const branchLead=movedSplit.wires.find(w=>['start','end'].some(e=>w[e].compId===mainMeter.id&&w[e].termId==='neg'));
for(const e of ['start','end'])if(branchLead[e].compId===mainMeter.id)branchLead[e].termId='r0_6';
assert.throws(()=>assertEquivalentConnections(movedSplit,splitBefore),/electrical nodes/);
console.log('PASS equivalence guard rejects moving a branch point across an ammeter');

// Changing views may swap symmetric passive ends, but never the chosen rheostat posts.
for(const lower of ['a','b'])for(const upper of ['c','d']){
 const m=build(3),pot=m.components.find(c=>c.type==='potentiometer');
 for(const w of m.wires)for(const e of ['start','end'])if(w[e].compId===pot.id)w[e].termId=['a','b'].includes(w[e].termId)?lower:upper;
 const saved=JSON.stringify(m.wires.map(w=>[w.start,w.end]));
 const posts=()=>m.wires.flatMap(w=>[w.start,w.end]).filter(e=>e.compId===pot.id).map(e=>e.termId).sort();
 for(const mode of ['real','schematic','real']){
  m.viewMode=mode;m.layoutCircuit(true,mode==='real');m.solveCircuit();assertEquivalentConnections(m,saved);
  assert.deepEqual(posts(),[lower,upper]);
  for(const view of ['real','schematic','principle'])assert.equal(m.potCurrentPaths(pot,view).length,3);
 }
}
console.log('PASS all four rheostat contact combinations retain selected posts and live paths through repeat conversion');

// Prefer the near binding post on a direct-wire node, without crossing any component internally.
const near=buildLatestMeasurement();near.components.find(c=>c.type==='switch').state='closed';near.viewMode='real';near.layoutRealCircuit(true);
const lineLength=()=>near.wires.reduce((sum,w)=>{const a=near.wireEndPos(w,'start'),b=near.wireEndPos(w,'end');return sum+Math.hypot(a.x-b.x,a.y-b.y);},0);
// Restore the deliberately long original passive wiring at the optimized positions.
const original=buildLatestMeasurement();near.wires.forEach((w,i)=>{w.start={...original.wires[i].start};w.end={...original.wires[i].end};});
const equivalent=JSON.stringify(near.wires.map(w=>[w.start,w.end])),longLength=lineLength();
near.optimizePassiveTerminals(near.wires);assertEquivalentConnections(near,equivalent);
assert.ok(lineLength()<longLength-100,'equivalent binding posts should shorten this annotated circuit');
near.solveCircuit();assert.ok(near.components.filter(c=>['ammeter','voltmeter'].includes(c.type)).every(c=>c.measurement>0));
for(const mode of ['schematic','real']){
 near.viewMode=mode;for(const type of ['ammeter','voltmeter']){
  const meter=near.components.find(c=>c.type===type),posts=near.terminals(meter);
  assert.ok(posts.find(t=>t.id==='neg').x<posts.find(t=>t.id=== (type==='ammeter'?'r0_6':'r3')).x);
 }
}
console.log('PASS shorter equivalent passive wiring and consistent left-negative/right-positive meter posts');
