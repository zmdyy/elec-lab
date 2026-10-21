'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  for(const url of ['http://127.0.0.1:'+server.address().port,'file://'+path.join(root,'index.html')]){
   const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(url);await page.click('[data-mode="mouse"]');
   await page.evaluate(()=>{
    const s=sim;s.clearAll();s.suppressUndo=true;const recalc=s.recalc,props=s.updatePropertiesPanel;
    s.recalc=()=>{};s.updatePropertiesPanel=()=>{};
    for(let i=0;i<3;i++){const old=s.wires.length;EXPERIMENTS[i===1?8:0].build(s);s.wires.slice(old).forEach(w=>w.view='both');}
    s.recalc=recalc;s.updatePropertiesPanel=props;s.suppressUndo=false;s.schematicReference=null;
    s.viewMode='real';s.solveCircuit();window.beforeReadings=s.components.map(c=>c.measurement||0);
    window.mainRoutes=0;const route=s.routeRealWire;s.routeRealWire=function(...args){mainRoutes++;return route.apply(this,args);};
    window.uiTicks=0;window.heartbeat=setInterval(()=>uiTicks++,10);window.routeStarted=performance.now();
   });
   await page.click('#view-toggle');
   await page.waitForFunction(()=>!sim._routingJob&&sim._routeKey===sim.routingGeometryKey()&&!sim._routingFailed,{},{timeout:30000});
   const result=await page.evaluate(()=>{
    clearInterval(heartbeat);sim.solveCircuit();
    const readingError=Math.max(...sim.components.map((c,i)=>Math.abs((c.measurement||0)-beforeReadings[i])));
    const groupBounds=sim.circuitGroups().map(g=>{const points=g.wires.flatMap(w=>sim.resolveWire(w)),boxes=g.components.map(c=>sim.realComponentBox(c,0));return {left:Math.min(...points.map(p=>p.x),...boxes.map(b=>b.left)),right:Math.max(...points.map(p=>p.x),...boxes.map(b=>b.right))};});
    return {elapsed:performance.now()-routeStarted,ticks:uiTicks,routes:mainRoutes,readingError,groupBounds,mode:sim.viewMode};
   });
   assert.equal(result.mode,'schematic');assert.equal(result.routes,0,'complex router must never execute on the browser main thread');assert.ok(result.ticks>2);assert.ok(result.readingError<1e-6);
   for(let i=1;i<result.groupBounds.length;i++)assert.ok(result.groupBounds[i].left-result.groupBounds[i-1].right>=179);
   console.log('PASS Chromium '+url.split(':')[0]+': three circuits, responsive heartbeat, zero main-thread searches, unchanged readings '+JSON.stringify(result));
   const rapid=await page.evaluate(async()=>{const a=sim.switchCircuitView('real'),b=sim.switchCircuitView('schematic');return {old:await a,current:await b,mode:sim.viewMode,failed:!!sim._routingFailed};});
   assert.deepEqual(rapid,{old:false,current:true,mode:'schematic',failed:false});
   const edited=await page.evaluate(async()=>{const c=sim.components[0],task=sim.startRoutingJob(true,true);sim.saveUndo();c.x+=41;const x=c.x;return {done:await task,x:c.x,expected:x,pending:!!sim._routingJob};});
   assert.equal(edited.done,false);assert.equal(edited.x,edited.expected);
   assert.deepEqual(errors,[]);await page.close();
   console.log('PASS rapid switches and editing terminate stale worker on '+url.split(':')[0]);
  }
 } finally {await browser.close();await new Promise(done=>server.close(done));}
})().catch(error=>{console.error(error);process.exitCode=1;});
