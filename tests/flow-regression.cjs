// Run: node tests/flow-regression.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const dummy={style:{},classList:{contains:()=>false},textContent:'',innerHTML:''};
const box={document:{getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(box);vm.runInContext(code+';this.S=CircuitSimulator;this.E=EXPERIMENTS;',box);
function sim(){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'real',simulationRunning:true});for(const n of ['draw','saveUndo','updateCircuitInfo','updatePropertiesPanel','recalc'])s[n]=()=>{};return s;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
// Subdivision and wire direction cannot affect arrow positions or tangent.
for(const direction of [1,-1])for(const phase of [0,.1,.3,.6]){
 const s=sim();s.ctx={};s.flowPhase=phase;const render=segments=>{let marks=[];s.drawFlowArrow=(p,a)=>marks.push([+p.x.toFixed(6),+p.y.toFixed(6),+a.toFixed(6)]);for(const path of s.joinFlowSegments(segments))s.drawFlow({_flowDir:1},path.points);return marks;};
 const one=[{points:[{x:0,y:0},{x:120,y:0}],flow:direction,net:0}];
 const many=Array.from({length:12},(_,i)=>({points:[{x:i*10,y:0},{x:(i+1)*10,y:0}],flow:direction,net:0}));
 assert.deepEqual(render(many),render(one));
}
const chain=sim();const t=chain.joinFlowSegments([{net:1,points:[{x:0,y:0},{x:10,y:0}],flow:2},{net:1,points:[{x:10,y:0},{x:20,y:10}],flow:1},{net:1,points:[{x:10,y:0},{x:20,y:-10}],flow:1}]);assert.equal(t.length,3,'true branches remain separate');
console.log('PASS subdivision-independent spacing, both directions, endpoint tangents and branch separation');
// Every terminal direction must agree with its component current, including reversed wiring/source.
let count=0;
for(let index=0;index<box.E.length;index++)for(const reversed of [false,true])for(const polarity of [1,-1]){
 const s=sim();s.viewMode='schematic';box.E[index].build(s);s.wires.forEach(w=>{w.view='both';if(reversed)[w.start,w.end]=[w.end,w.start];});s.components.filter(c=>c.type==='switch').forEach(c=>c.state='closed');s.components.filter(c=>c.type==='battery').forEach(c=>c.voltage*=polarity);s.solveCircuit();
 for(const c of s.components){const flow=t=>s.connectedWireTerminalFlow(c,t);if(c.type==='resistor'){near(flow('a'),c._current);near(flow('b'),-c._current);}if(c.type==='bulb'){near(flow('shell'),c._current);near(flow('tip'),-c._current);}if(['ammeter','voltmeter'].includes(c.type)){near(flow(s.meterActiveTerminal(c).id),c._current);near(flow('neg'),-c._current);}if(c.type==='battery'){near(flow('pos'),-c._current);near(flow('neg'),c._current);}if(c.type==='potentiometer'){near(flow('a'),c._potI1);near(flow('b'),-c._potI2);near(flow('c')+flow('d'),c._potI2-c._potI1);}}
 count++;
}
console.log(`PASS ${count} circuit cases: all component terminals, reversed wire endpoints and power polarity`);
for(const lower of ['a','b'])for(const upper of ['c','d'])for(const polarity of [1,-1]){
 const s=sim();const b=s.createComponent('battery',{voltage:3*polarity}),p=s.createComponent('potentiometer',{position:.37}),r=s.createComponent('resistor',{resistance:10});const link=(a,ta,b,tb)=>s.connectTerminals(a,ta,b,tb,[],'both');link(b,'pos',p,upper);link(p,lower,r,'a');link(r,'b',b,'neg');s.solveCircuit();
 for(const view of ['real','schematic','principle']){
  const paths=s.potCurrentPaths(p,view);const y=view==='real'?19:view==='principle'?210:24,top=view==='real'?-30:view==='principle'?55:-28;
  const slider=paths.find(p=>p.points.length===2&&p.points.every(q=>q.x===p.points[0].x)&&p.points.some(q=>q.y===top)&&p.points.some(q=>q.y===y));
  const upward=(p._potI1-p._potI2)>0;assert.equal(slider.points[0].y,upward?y:top);
  const fixedX=view==='real'?(lower==='a'?-76:76):view==='principle'?(lower==='a'?80:520):(lower==='a'?-48:48);
  const path=paths.find(p=>p.points.some(q=>q.x===fixedX&&q.y===(view==='real'?24:y)));
  assert.equal(path.points[0].x===fixedX,s.connectedWireTerminalFlow(p,lower)>0);
 }
}
const both=sim();both.activeWires=()=>[];both.connectedWireTerminalFlow=()=>0;
assert.equal(both.potCurrentPaths({position:.5,_potI1:1,_potI2:1},'real').length,2,'equal A-P and P-B currents do not create slider current');
console.log('PASS four rheostat contacts, both polarities, all three views and zero-current slider');
const loop=sim(),b=loop.createComponent('battery'),r=loop.createComponent('resistor');loop.connectTerminals(b,'pos',r,'a',[],'both');loop.connectTerminals(b,'pos',r,'a',[],'both');loop.connectTerminals(r,'b',b,'neg',[],'both');loop.solveCircuit();assert.equal(loop.wires.filter(w=>w._flowAmbiguous).length,2);
console.log('PASS ideal-wire cycle identified without changing load readings');
const interaction=sim(),sw={id:'C99',type:'switch',state:'open'};interaction.toWorld=()=>({x:0,y:30});interaction.switchHandleAt=()=>null;interaction.findComponentAt=()=>sw;interaction.findTerminalAt=()=>null;interaction.currentTool='wire';interaction.wireDrawing=true;interaction.draftWire={};interaction.handleDblClick({});assert.equal(interaction.selectedComponent,sw);assert.equal(sw.state,'open');assert.equal(interaction.currentTool,'wire');assert.equal(interaction.draftWire,null);interaction.currentTool='select';interaction.handleDblClick({});assert.equal(sw.state,'open');
const retina=sim();retina.canvas={width:0,height:0};dummy.clientWidth=800;dummy.clientHeight=500;box.window.devicePixelRatio=2;retina.resizeCanvas();assert.deepEqual([retina.canvas.width,retina.canvas.height,retina.viewportWidth,retina.viewportHeight],[1600,1000,800,500]);retina.exportingImage=true;assert.equal(retina.viewportWidth,1600);
console.log('PASS wire-mode double-click selects without toggling; selection mode also selects without toggling; Retina preserves logical coordinates');
const network=sim();network.viewMode='schematic';network.ctx={globalAlpha:1,save(){},restore(){}};network.flowPhase=.1;network.resolveWire=w=>w.points;let positions=[];network.drawFlowArrow=(p,a)=>positions.push([+p.x.toFixed(6),+p.y.toFixed(6),+a.toFixed(6)]);network.activeWires=()=>network.wires;
network.wires=[{_flowNet:'n1',_flowMag:1,_flowDir:1,points:[{x:0,y:0},{x:120,y:0}]}];network.drawNetworkFlow();const baseline=JSON.stringify(positions);network.wires[0].points=Array.from({length:13},(_,i)=>({x:i*10,y:0}));positions=[];network.drawNetworkFlow();assert.equal(JSON.stringify(positions),baseline);positions=[];network.drawNetworkFlow();assert.equal(JSON.stringify(positions),baseline,'cached frame retains phase');
network.wires.push({...network.wires[0],_flowNet:'unconnected',_flowDir:-1});network.drawNetworkFlow();assert.equal(network._flowGeometry.length,2,'geometrically coincident but electrically separate wires must not cancel');
console.log('PASS full network renderer subdivision invariance, cache consistency and electrical-net isolation');

// A voltmeter with 1 MOhm input across 1 V draws about 1 microamp.
// This should be rendered as a faint directional indicator, not silently hidden
// and not confused with the ~0.1 A load branch.
{
 const s=sim();s.viewMode='schematic';s.ctx={globalAlpha:1,save(){},restore(){}};
 const battery=s.createComponent('battery',{voltage:1});
 const load=s.createComponent('resistor',{resistance:10});
 const meter=s.createComponent('voltmeter');
 s.connectTerminals(battery,'pos',load,'a',[],'both');
 s.connectTerminals(load,'b',battery,'neg',[],'both');
 s.connectTerminals(meter,'r3',load,'a',[],'both');
 s.connectTerminals(meter,'neg',load,'b',[],'both');
 s.solveCircuit();
 assert.ok(Math.abs(meter.measurement-1)<.0001,'voltmeter reads 1 V');
 const microWires=s.wires.filter(w=>w.start.compId===meter.id||w.end.compId===meter.id);
 assert.equal(microWires.length,2);
 for(const w of microWires){
  assert.ok(w._flowMag>1e-10&&w._flowMag<1e-4,'voltmeter current is genuinely tiny');
  assert.equal(w._flowAmbiguous,false);
 }
 const faint=[];s.drawFlow=(w,pts)=>faint.push(w);
 s.drawWeakNetworkFlow();
 assert.equal(faint.filter(w=>microWires.includes(w)).length,2,
    'both voltmeter leads must receive faint directional current arrows');
 assert.ok(!faint.some(w=>!microWires.includes(w)),'ordinary load leads must remain bright');
 console.log('PASS tiny voltmeter current: preserve physical magnitude, show both faint branch arrows');
}
