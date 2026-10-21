'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.click('[data-mode="mouse"]');
  const types=await page.evaluate(()=>Object.keys(COMPONENT_DEFS).filter(k=>!COMPONENT_DEFS[k].internal));
  for(const type of types){
   await page.evaluate(type=>{const s=sim;s.clearAll();s.viewMode='schematic';s.createComponent(type,{x:303,y:297});s.panX=80;s.panY=40;s.scale=1;s.setTool('select');s.draw();},type);
   for(let turn=0;turn<4;turn++){
    const point=await page.evaluate(()=>{const c=sim.components[0],a=sim.componentAngle(c)*Math.PI/180,k=sim.componentSize(c),r=sim.canvas.getBoundingClientRect();return {x:r.left+sim.panX+(c.x-28*k*Math.sin(a))*sim.scale,y:r.top+sim.panY+(c.y+28*k*Math.cos(a))*sim.scale};});
    await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+37,point.y+29,{steps:3});await page.mouse.up();
    const aligned=await page.evaluate(()=>sim.getAbsoluteTerminals(sim.components[0]).every(p=>Math.abs(p.x/20-Math.round(p.x/20))<1e-7&&Math.abs(p.y/20-Math.round(p.y/20))<1e-7));assert.ok(aligned,type+' drag at turn '+turn);
    await page.evaluate(()=>{sim.selectedComponent=sim.components[0];sim.rotateSelected();});
   }
  }
  console.log('PASS Chromium grid: real mouse drags for all 10 symbol types in four orientations');
  const terminals=await page.evaluate(()=>{const s=sim;s.clearAll();s.viewMode='schematic';const a=s.createComponent('resistor',{x:200,y:200}),b=s.createComponent('potentiometer',{x:600,y:380});s.panX=40;s.panY=20;s.scale=.9;s.setTool('wire');s.draw();const r=s.canvas.getBoundingClientRect(),screen=p=>({x:r.left+s.panX+p.x*s.scale,y:r.top+s.panY+p.y*s.scale});return [screen(s.terminalPos(a.id,'b')),screen(s.terminalPos(b.id,'a'))];});
  for(const p of terminals)await page.mouse.click(p.x,p.y);
  const wire=await page.evaluate(()=>({count:sim.wires.length,points:sim.resolveWire(sim.wires[0])}));assert.equal(wire.count,1);assert.ok(wire.points.length>=3);for(let i=0;i<wire.points.length;i++){const p=wire.points[i];assert.ok(Math.abs(p.x/20-Math.round(p.x/20))<1e-7&&Math.abs(p.y/20-Math.round(p.y/20))<1e-7);if(i)assert.ok(p.x===wire.points[i-1].x||p.y===wire.points[i-1].y);}
  await page.evaluate(()=>{sim.wires[0].view='both';sim.schematicReference=null;});
  assert.equal(await page.evaluate(()=>sim.switchCircuitView('schematic',true)),true);
  assert.ok(await page.evaluate(()=>sim.components.flatMap(c=>sim.getAbsoluteTerminals(c)).every(p=>p.x%20===0&&p.y%20===0)));
  const saved=await page.evaluate(()=>sim.experimentData());await page.evaluate(data=>sim.importExperiment(data),saved);assert.ok(await page.evaluate(()=>sim.components.flatMap(c=>sim.getAbsoluteTerminals(c)).every(p=>p.x%20===0&&p.y%20===0)));
  assert.deepEqual(errors,[]);console.log('PASS Chromium grid: two-click right-angle wire, background arrangement, JSON and no browser errors');
 }finally{await browser.close();await new Promise(done=>server.close(done));}
})().catch(e=>{console.error(e);process.exitCode=1;});
