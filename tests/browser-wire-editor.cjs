'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const file=path.join(root,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}
  catch(_){res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.click('[data-mode="mouse"]');
  await page.evaluate(()=>{
   const s=window.sim;s.clearAll();s.viewMode='real';s.currentTool='select';
   const a=s.createComponent('battery',{x:145,y:225}),b=s.createComponent('resistor',{x:425,y:225});
   a.realX=a.x;a.realY=a.y;b.realX=b.x;b.realY=b.y;
   s.wires.push({start:{compId:a.id,termId:'pos'},end:{compId:b.id,termId:'a'},
      bends:[],realBends:[{x:255,y:124},{x:341,y:125}],view:'both'});
   s.scale=.9;s.panX=160;s.panY=45;s.recalc();
   s.selectedWire=s.wires[0];s.draw();
  });
  const getHandles=()=>page.evaluate(()=>sim.wireControlPoints(sim.wires[0]).map(p=>({x:p.x,y:p.y})));
  const old=await getHandles();assert.equal(old.length,3);
  const point=await page.evaluate(()=>{
   const p=sim.wireControlPoints(sim.wires[0])[1],r=sim.canvas.getBoundingClientRect();
   return {x:r.left+sim.panX+p.x*sim.scale,y:r.top+sim.panY+p.y*sim.scale};
  });
  await page.mouse.move(point.x,point.y);
  await page.mouse.down();await page.mouse.move(point.x+45,point.y+36,{steps:6});await page.mouse.up();
  const after=await getHandles();
  assert.equal(after.length,3);assert.ok(Math.hypot(after[1].x-old[1].x,after[1].y-old[1].y)>8);
  const saved=await page.evaluate(()=>JSON.stringify(sim.experimentData()));
  await page.evaluate(json=>sim.importExperiment(JSON.parse(json)),saved);
  assert.equal(await page.evaluate(()=>sim.wires[0].editControls.real.points.length),3);
  assert.equal(await page.evaluate(()=>sim.wires[0].editControls.real.manual),true);
  await page.evaluate(()=>{
   window.__perf={solve:0,globalRoute:0};
   const solver=sim.solveCircuit.bind(sim),router=sim.autoRealWirePath.bind(sim);
   sim.solveCircuit=(...args)=>{__perf.solve++;return solver(...args);};
   sim.autoRealWirePath=(...args)=>{__perf.globalRoute++;return router(...args);};
  });
  const component=await page.evaluate(()=>{
   const c=sim.components.find(x=>x.type==='resistor'),p=sim.componentPos(c),r=sim.canvas.getBoundingClientRect();
   return {x:r.left+sim.panX+p.x*sim.scale,y:r.top+sim.panY+p.y*sim.scale,id:c.id,original:p.x};
  });
  await page.mouse.move(component.x,component.y);await page.mouse.down();
  await page.mouse.move(component.x+45,component.y+18,{steps:8});await page.mouse.up();
  const measured=await page.evaluate(id=>{
   const c=sim.components.find(x=>x.id===id);
   return {position:sim.componentPos(c).x,perf:window.__perf,points:sim.wireControlPoints(sim.wires[0]).length};
  },component.id);
  assert.ok(measured.position>component.original+15,'component must move');
  assert.equal(measured.perf.solve,0,'drag must not trigger an electrical solve');
  assert.equal(measured.perf.globalRoute,0,'drag must not trigger whole-network routing');
  assert.equal(measured.points,3);
  // Releasing outside the canvas used to leave the editor in dragging mode.
  const outside=await page.evaluate(()=>{
   const c=sim.components.find(x=>x.type==='resistor'),p=sim.componentPos(c),r=sim.canvas.getBoundingClientRect();
   return {x:r.left+sim.panX+p.x*sim.scale,y:r.top+sim.panY+p.y*sim.scale,top:r.top};
  });
  const controlsBefore=await page.evaluate(()=>JSON.stringify(sim.wires[0].editControls.real));
  await page.mouse.move(outside.x,outside.y);await page.mouse.down();
  await page.mouse.move(outside.x+20,outside.y+10,{steps:3});
  await page.mouse.move(outside.x,outside.top-10);await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>({dragging:sim.dragging,control:sim.draggingControlPoint,baseline:sim._dragBaseline})),
   {dragging:false,control:null,baseline:null});
  assert.equal(await page.evaluate(()=>JSON.stringify(sim.wires[0].editControls.real)),controlsBefore);
  console.log('PASS Chromium: mouse release outside canvas completes drag and preserves manual controls');
  // Real Canvas: opening a series switch must remove every current arrow.
  const switchStates=await page.evaluate(()=>{
    const s=sim;s.clearAll();s.viewMode='real';s.currentTool='select';
    const b=s.createComponent('battery',{x:120,y:120,voltage:3});
    const sw=s.createComponent('switch',{x:320,y:120});
    const r=s.createComponent('resistor',{x:520,y:260,resistance:10});
    const a=s.createComponent('ammeter',{x:120,y:320});
    for(const c of s.components){c.realX=c.x;c.realY=c.y;}
    sw.state='open';
    const connect=(c,t,d,u)=>s.connectTerminals(c,t,d,u,[],'both');
    connect(b,'pos',sw,'a');connect(sw,'b',r,'a');
    connect(r,'b',a,'r0_6');connect(a,'neg',b,'neg');
    let arrows=0;
    const oldDrawFlow=s.drawFlow.bind(s);
    s.drawFlow=(...args)=>{arrows++;return oldDrawFlow(...args);};
    const state=()=>{
      arrows=0;s.solveCircuit();
      return {arrows,ampere:a.measurement,solution:s._solutionState,
        poweredWires:s.wires.filter(w=>w._weakFlowValid).length};
    };
    const openBefore=state();
    sw.state='closed';const closed=state();
    sw.state='open';const openAgain=state();
    return {openBefore,closed,openAgain};
  });
  assert.equal(switchStates.openBefore.arrows,0,'open real-view circuit shows no arrows');
  assert.ok(switchStates.closed.arrows>0,'closing the switch shows current arrows');
  assert.ok(switchStates.closed.ampere>.001,'closed circuit ammeter indicates current');
  assert.equal(switchStates.openAgain.arrows,0,'reopening clears every current arrow');
  assert.equal(switchStates.openAgain.ampere,0,'open switch shows zero current');
  assert.equal(switchStates.openAgain.poweredWires,0);
  console.log('PASS Chromium: real canvas open -> closed -> open clears animated current paths');
  const uniform=await page.evaluate(()=>{
   const s=sim;s.clearAll();s.viewMode='real';s.flowPhase=.3;
   const oldResolve=s.resolveRealWire,oldArrow=s.drawFlowArrow;
   const wires=[{_flowNet:'n',_flowMag:1,_flowDir:1,points:[{x:0,y:0},{x:500,y:0}]},
    {_flowNet:'n',_flowMag:1,_flowDir:-1,points:[{x:120,y:0},{x:380,y:0}]}];
   const marks=[];s.wires=wires;s.resolveRealWire=w=>w.points;
   s.drawFlowArrow=function(p,a){marks.push(p.x);return oldArrow.call(this,p,a);};
   try{s.drawNetworkFlow();return {count:marks.length,middle:marks.some(x=>x>200&&x<300)};}
   finally{s.wires=[];s.resolveRealWire=oldResolve;s.drawFlowArrow=oldArrow;s.recalc();}
  });
  assert.ok(uniform.count>25&&uniform.middle,'actual Canvas paints the formerly blank overlap');
  console.log('PASS Chromium: physical lead overlap retains uniformly distributed current arrows');
  assert.deepEqual(errors,[]);
  console.log('PASS Chromium: drag exactly three handles, JSON roundtrip, component drag and zero repeated solve/routing');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
