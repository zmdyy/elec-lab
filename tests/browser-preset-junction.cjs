'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port);await page.click('[data-mode="mouse"]');
  await page.evaluate(()=>{window.schematicGeometry=()=>JSON.stringify([sim.components.map(c=>[c.id,c.x,c.y,c.rotation,c.schematicRotation,c.schematicFlipX,c.potUpperSide]),sim.wires.filter(w=>w.view!=='real').map(w=>[w.start,w.end,w.bends,w.autoSchematic])]);});
  for(const i of [1,2,4,5,10,11]){
   await page.evaluate(i=>{sim.loadExperiment(i);sim.draw();},i);const before=await page.evaluate(()=>schematicGeometry());
   assert.equal(await page.evaluate(()=>sim.switchCircuitView('real')),true);assert.equal(await page.evaluate(()=>sim.switchCircuitView('schematic')),true);assert.equal(await page.evaluate(()=>schematicGeometry()),before);
   assert.equal(await page.evaluate(()=>sim.switchCircuitView('schematic',true)),true);assert.equal(await page.evaluate(()=>schematicGeometry()),before);
   const saved=await page.evaluate(()=>sim.experimentData());await page.evaluate(d=>sim.importExperiment(d),saved);assert.equal(await page.evaluate(()=>schematicGeometry()),before);
   if(process.env.PRESET_VISUAL_QA&&[1,2,4,5].includes(i)){await page.evaluate(()=>{sim.draw();});const shot=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=840;c.height=525;c.getContext('2d').drawImage(sim.canvas,0,0,840,525);return c.toDataURL('image/jpeg',.65).split(',')[1];});console.log('PRESET_VISUAL_'+i+':'+shot);}
   console.log('PASS Chromium preset '+(i+1)+': load, worker view switches, arrange and JSON retain reference drawing');
  }
  await page.evaluate(()=>{
   sim.clearAll();sim.viewMode='schematic';sim.activeExperiment=null;sim.panX=20;sim.panY=20;sim.scale=1;document.getElementById('guide-panel').classList.remove('show');
   const b=sim.createComponent('battery',{x:200,y:120}),r=sim.createComponent('resistor',{x:420,y:360}),l=sim.createComponent('bulb',{x:420,y:500});
   sim.connectTerminals(b,'pos',r,'b',[{x:640,y:120},{x:640,y:360}],'both');sim.connectTerminals(r,'a',b,'neg',[{x:160,y:360}],'both');sim.connectTerminals(l,'shell',b,'neg',[{x:160,y:500}],'both');sim.setTool('wire');sim.recalc();
   window.screenPoint=p=>{const r=sim.canvas.getBoundingClientRect();return {x:r.left+sim.panX+p.x*sim.scale,y:r.top+sim.panY+p.y*sim.scale};};
  });
  for(const p of [{x:460,y:500},{x:640,y:500},{x:640,y:280}]){const q=await page.evaluate(p=>screenPoint(p),p);await page.mouse.click(q.x,q.y);}
  assert.ok(await page.evaluate(()=>!sim.wireDrawing&&sim.components.filter(c=>c.type==='junction').length===1&&Math.abs(sim.components.find(c=>c.type==='bulb').current-.3)<1e-6));
  assert.equal(await page.evaluate(()=>sim.switchCircuitView('schematic',true)),true);
  assert.equal(await page.evaluate(()=>sim.switchCircuitView('real')),true);assert.equal(await page.evaluate(()=>sim.switchCircuitView('schematic')),true);
  const saved=await page.evaluate(()=>sim.experimentData());await page.evaluate(d=>sim.importExperiment(d),saved);assert.ok(await page.evaluate(()=>Math.abs(sim.components.find(c=>c.type==='bulb').current-.3)<1e-6));
  await page.evaluate(()=>sim.setTool('select'));const drag=await page.evaluate(()=>screenPoint({x:640,y:280}));await page.mouse.move(drag.x,drag.y);await page.mouse.down();await page.mouse.move(drag.x+40,drag.y+40,{steps:4});await page.mouse.up();assert.ok(await page.evaluate(()=>sim.wires.every(w=>{const p=sim.resolveWire(w);return p.every((q,i)=>q.x%20===0&&q.y%20===0&&(!i||q.x===p[i-1].x||q.y===p[i-1].y));})));await page.evaluate(()=>{sim.undo();sim.setTool('wire');});
  // Hover and start at the same node, then cancel without changing topology.
  const q=await page.evaluate(()=>screenPoint({x:640,y:280}));await page.mouse.move(q.x,q.y);await page.mouse.click(q.x,q.y);await page.evaluate(()=>sim.setTool('select'));assert.equal(await page.evaluate(()=>sim.wires.length),5);
  assert.deepEqual(errors,[]);console.log('PASS Chromium junction: actual mouse branch connection, hover/draft rendering, worker, persistence, cancellation and no page errors');
 }finally{await browser.close();await new Promise(done=>server.close(done));}
})().catch(e=>{console.error(e);process.exitCode=1;});
