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
  assert.deepEqual(errors,[]);
  console.log('PASS Chromium: drag exactly three handles, JSON roundtrip, component drag and zero repeated solve/routing');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
