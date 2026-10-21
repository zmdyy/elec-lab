'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const dummy={style:{},classList:{contains:()=>false,toggle(){},add(){},remove(){}},querySelector:()=>dummy,querySelectorAll:()=>[],addEventListener(){},setAttribute(){}};
const box={document:{body:dummy,getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]+';this.S=CircuitSimulator;this.exps=EXPERIMENTS;',box);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../classroom.js'),'utf8'),box);
const plain=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function build(){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,gridSize:20,viewMode:'schematic',simulationRunning:true,scale:1,panX:0,panY:0,pixelRatio:1,hitScale:1,maxUndo:30,snapRadius:10,undoStack:[],activeExperiment:null,currentTool:'wire',canvas:{style:{},getBoundingClientRect:()=>({left:0,top:0})}});for(const fn of ['draw','requestDraw','updatePropertiesPanel','updateCircuitInfo','hideContextMenu','updateMiniSchematicVisibility','syncViewButton','renderClassroom','renderExperimentGuide','notify','applyTheme','renderRecords','renderExperimentGuide'])s[fn]=()=>{};s.recalc=function(){this.solveCircuit();};return s;}
const geometry=s=>JSON.stringify([s.components.map(c=>[c.id,c.x,c.y,c.rotation,c.schematicRotation,c.schematicFlipX,c.potUpperSide]),s.wires.map(w=>[w.start,w.end,w.bends,w.autoSchematic])]);
for(const i of [1,2,4,10,11]){
 const s=build();box.exps[i].build(s);s.wires.forEach(w=>w.view='both');const g=geometry(s);
 s.layoutSchematicCircuit(true);assert.equal(geometry(s),g);s.solveCircuit();const before=s.components.map(c=>c.measurement||0);
 s.viewMode='real';s.layoutRealCircuit(true);s.viewMode='schematic';s.layoutSchematicCircuit(true);assert.equal(geometry(s),g,'physical placement must not alter prescribed schematic');s.solveCircuit();s.components.forEach((c,k)=>near(c.measurement||0,before[k]));
 for(const w of s.wires){const p=s.resolveWire(w);for(let k=1;k<p.length;k++)assert.ok(p[k].x===p[k-1].x||p[k].y===p[k-1].y);}
 const saved=s.experimentData(),r=build();r.importExperiment(plain(saved));r.layoutSchematicCircuit(true);assert.equal(geometry(r),g);
 if(i===1){const a=s.components.filter(c=>c.type==='ammeter');near(a[0].measurement,.6);near(a[1].measurement,.3);near(a[2].measurement,.3);assert.equal(a[0]._polarityWarning,false);assert.ok(a[0].measurement<a[0].range);}
 if(i===4){const v=s.components.filter(c=>c.type==='voltmeter');near(v[0].measurement+v[1].measurement,v[2].measurement);}
 console.log('PASS fixed reference '+(i+1)+': orthogonal geometry, physical-view isolation, persistence and readings');
}
const click=(s,p)=>s.handleMouseDown({button:0,clientX:p.x,clientY:p.y,detail:1});
{
 const s=build(),b=s.createComponent('battery',{x:200,y:120}),r=s.createComponent('resistor',{x:420,y:360}),lamp=s.createComponent('bulb',{x:420,y:500});
 s.connectTerminals(b,'pos',r,'b',[{x:640,y:120},{x:640,y:360}],'both');s.connectTerminals(r,'a',b,'neg',[{x:160,y:360}],'both');
 s.connectTerminals(lamp,'shell',b,'neg',[{x:160,y:500}],'both');s.solveCircuit();near(lamp.current,0);
 const host=s.wires[0],shape=plain(s.resolveWire(host));const before=s.snapshotState();
 click(s,s.terminalPos(lamp.id,'tip'));click(s,{x:640,y:500});click(s,{x:640,y:280});
 assert.equal(s.wireDrawing,false);assert.equal(s.components.filter(c=>c.type==='junction').length,1);assert.equal(s.wires.length,5);near(lamp.current,.3);near(Math.abs(r._current),.3);
 const node=s.components.find(c=>c.type==='junction');assert.equal(node.x,640);assert.equal(node.y,280);assert.equal(s.wires.filter(w=>[w.start.compId,w.end.compId].includes(node.id)).length,3);
 assert.deepEqual(plain(s.resolveWire(s.wires[0])),[shape[0],shape[1],{x:640,y:280}]);
 const saved=s.experimentData(),restored=build();restored.importExperiment(plain(saved));near(restored.components.find(c=>c.type==='bulb').current,.3);
 const g=geometry(s);s.layoutSchematicCircuit(true);assert.equal(geometry(s),g);
 s.undo();assert.equal(s.components.filter(c=>c.type==='junction').length,0);assert.equal(s.wires.length,3);near(s.components.find(c=>c.type==='bulb').current,0);
 // Start on a wire, then cancel: no split or orphan node.
 click(s,{x:640,y:280});assert.equal(s.wires.length,3);s.setTool('select');assert.equal(s.components.filter(c=>c.type==='junction').length,0);
 s.currentTool='wire';click(s,{x:640,y:280});click(s,s.terminalPos(s.components.find(c=>c.type==='bulb').id,'tip'));assert.equal(s.wireDrawing,false);near(s.components.find(c=>c.type==='bulb').current,.3);
 const n=s.components.find(c=>c.type==='junction');s.selectedComponent=n;s.saveUndo();s.beginDragPreview(n);n.x+=40;n.y+=40;s.finishDragPreview();for(const w of s.wires){const p=s.resolveWire(w);for(let k=1;k<p.length;k++){assert.ok(p[k].x===p[k-1].x||p[k].y===p[k-1].y);assert.equal(p[k].x%20,0);assert.equal(p[k].y%20,0);}}s.recalc();near(s.components.find(c=>c.type==='bulb').current,.3);s.undo();s.selectedComponent=s.components.find(c=>c.type==='junction');s.selectedWire=null;s.deleteSelected();assert.equal(s.wires.some(w=>[w.start.compId,w.end.compId].includes(n.id)),false);near(s.components.find(c=>c.type==='bulb').current,0);
 console.log('PASS T connection: true parallel current, preserved host path, save/import, atomic undo, cancel, start-on-wire and node deletion');
}
{
 const s=build(),a=s.createComponent('resistor',{x:100,y:200}),b=s.createComponent('resistor',{x:700,y:200}),c=s.createComponent('resistor',{x:400,y:60}),d=s.createComponent('resistor',{x:400,y:500});
 s.connectTerminals(a,'b',b,'a',[],'both');s.connectTerminals(c,'b',d,'a',[{x:400,y:60},{x:400,y:500}],'both');
 s.solveCircuit();assert.equal(s.components.some(c=>c.type==='junction'),false);assert.equal(s.schematicJunctionPoints().some(p=>p.x===400&&p.y===200),false);
 console.log('PASS geometric crossing alone creates neither connection nor junction dot');
}
