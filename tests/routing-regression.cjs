'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {Worker:Thread}=require('node:worker_threads');
const root=path.resolve(__dirname,'..'),dummy={style:{},classList:{contains:()=>false}};
const source=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const box={document:{getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}},console,setTimeout,clearTimeout};
vm.createContext(box);vm.runInContext(source+';this.S=CircuitSimulator;this.exps=EXPERIMENTS;',box);
function build(){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'schematic',simulationRunning:true});for(const fn of ['saveUndo','recalc','draw','requestDraw','syncViewButton','updateMiniSchematicVisibility','updateCircuitInfo','updatePropertiesPanel','fitView'])s[fn]=()=>{};return s;}
function preset(s,index){const old=s.wires.length;box.exps[index].build(s);s.wires.slice(old).forEach(w=>w.view='both');}
const plain=v=>JSON.parse(JSON.stringify(v));
// Real Node threads execute the exact Blob worker source, without DOM globals.
const blobs=new Map();let next=0,started=0,terminated=0;
box.Blob=class{constructor(parts){this.source=parts.join('');}};
box.URL={createObjectURL(blob){const id=String(++next);blobs.set(id,blob.source);return id;},revokeObjectURL(id){blobs.delete(id);}};
box.Worker=class{
 constructor(url){started++;this.thread=new Thread(`const {parentPort}=require('node:worker_threads');global.postMessage=m=>parentPort.postMessage(m);global.onmessage=null;${blobs.get(url)};parentPort.on('message',data=>onmessage({data}));`,{eval:true});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.(error));}
 postMessage(data){this.thread.postMessage(data);}
 terminate(){terminated++;this.thread.terminate();}
};
(async()=>{
 // Three independent sources, open switches and an isolated kit item.
 const s=build();for(let i=0;i<3;i++)preset(s,i===1?8:0);
 s.createComponent('bulb',{x:20,y:20});
 const groups=s.circuitGroups();assert.equal(groups.length,4);
 assert.deepEqual(plain(groups.slice(0,3).map(g=>g.components.filter(c=>c.type==='battery').length)),[1,1,1]);
 s.solveCircuit();const readings=s.components.map(c=>c.measurement||0);
 s.viewMode='real';const components=s.components.slice(),wires=s.wires.slice();
 let ticks=0;const ticker=setInterval(()=>ticks++,5),begin=Date.now();
 assert.equal(await s.switchCircuitView('schematic'),true);clearInterval(ticker);
 assert.ok(ticks>5,'main event loop must remain responsive while routing');
 assert.ok(s.components.every((c,i)=>c===components[i]));assert.ok(s.wires.every((w,i)=>w===wires[i]));
 assert.equal(s._routeKey,s.routingGeometryKey());s.solveCircuit();
 s.components.forEach((c,i)=>assert.ok(Math.abs((c.measurement||0)-readings[i])<1e-6,'conversion changed a meter reading'));
 const bounds=s.circuitGroups().map(g=>{const child=Object.create(box.S.prototype);Object.assign(child,g,{viewMode:s.viewMode});const bs=g.components.map(c=>child.realComponentBox(c,0)),ps=g.wires.flatMap(w=>s.resolveWire(w));return {left:Math.min(...bs.map(b=>b.left),...ps.map(p=>p.x)),right:Math.max(...bs.map(b=>b.right),...ps.map(p=>p.x))};});
 for(let i=1;i<bounds.length;i++)assert.ok(bounds[i].left-bounds[i-1].right>=179,'entire circuit including wire excursions must have its own area');
 for(const w of s.wires){const p=s.resolveWire(w);for(const [point,end] of [[p[0],'start'],[p.at(-1),'end']]){const e=s.wireEndPos(w,end);assert.ok(Math.hypot(point.x-e.x,point.y-e.y)<1e-7);}assert.ok(p.length>1);}
 console.log(`PASS 3 independent circuits + isolated kit: group packing, wire endpoints, object identity; ${Date.now()-begin} ms in background, ${ticks} UI ticks`);
 // Cancel a genuinely busy job, then let an obsolete callback try to commit.
 const before=plain(s.routingInput());const old=s.startRoutingJob(true,true);const stale=s._routingJob;
 s.cancelRoutingJob();assert.equal(await old,false);s.components[0].x+=57;
 stale.worker.onmessage({data:{error:'must be ignored'}});assert.equal(s.components[0].x,before.components[0].x+57);
 assert.equal(s._routingJob,null);
 console.log('PASS termination resolves cancelled job and late callback cannot apply geometry');
 // A geometry change without saveUndo must also reject a late result.
 const racing=s.startRoutingJob(false);s.components[0].x+=30;assert.equal(await racing,false);
 console.log('PASS input fingerprint rejects out-of-date results even without an undo hook');
 // Two rapid switches: only the last view can commit.
 const a=s.switchCircuitView('real'),b=s.switchCircuitView('schematic');
 assert.equal(await a,false);assert.equal(await b,true);assert.equal(s.viewMode,'schematic');
 assert.equal(s._routeKey,s.routingGeometryKey());
 // Changes in live electrical readings must not invalidate geometry or be replaced.
 const job=s.startRoutingJob(false);s.components[0].measurement=123;s.components[0].state='closed';
 assert.equal(await job,true);assert.equal(s.components[0].measurement,123);assert.equal(s.components[0].state,'closed');
 console.log('PASS rapid switches retain latest view and worker leaves live readings/state intact');
 // A cached, manually adjusted view must retain controls and exact bends.
 const m=build();preset(m,0);m.viewMode='schematic';m.layoutCircuit(true,false);
 const w=m.wires[0];w.autoSchematic=false;w.bends=[{x:33,y:77},{x:88,y:99}];w.editControls={schematic:{points:[{x:33,y:77},{x:55,y:88},{x:88,y:99}],sampled:false}};
 const manual=plain([w.bends,w.editControls]);assert.equal(await m.startRoutingJob(true),true);assert.deepEqual(plain([w.bends,w.editControls]),manual);
 console.log('PASS existing layout keeps manual bend and control coordinates');
 assert.equal(blobs.size,0);assert.equal(started,terminated);
 console.log('PASS workers, timers and Blob URLs cleaned up after success and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
