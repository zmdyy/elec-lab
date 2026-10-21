'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const file=path.join(root,req.url==='/'?'index.html':req.url.split('?')[0]);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch(_){res.statusCode=404;res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.click('[data-mode="mouse"]');
  assert.equal(await page.locator('#exp-menu [data-experiment]').count(),13);
  await page.evaluate(()=>{window.setInquiryPot=resistance=>{const p=sim.components.find(c=>c.type==='potentiometer'),a=sim.wires.some(w=>[w.start,w.end].some(e=>e.compId===p.id&&e.termId==='a'));p.position=a?resistance/p.resistance:1-resistance/p.resistance;sim.recalc();};window.inquiryAxes=()=>{const canvas=document.querySelector('#record-plot'),ctx=canvas.getContext('2d'),old=ctx.fillText,labels=[];ctx.fillText=function(text,...args){labels.push(text);return old.call(this,text,...args);};try{sim.renderRecords();}finally{ctx.fillText=old;}return labels;};});
  for(const index of [10,11,12]){
   await page.click('#exp-menu-btn');await page.click(`[data-experiment="${index}"]`);
   await page.evaluate(()=>{sim.components.find(c=>c.type==='switch').state='closed';sim.recalc();});
   if(index===11){
    await page.click('#record-btn');await page.click('#take-record');assert.equal(await page.evaluate(()=>sim.records.length),0);assert.match(await page.locator('#classroom-message').innerText(),/2 V/);await page.click('#record-return');
    for(const R of [5,10,15,20]){
     await page.evaluate(R=>{const r=sim.recordLoad();sim.selectedComponent=r;sim.updatePropertiesPanel();},R);
     await page.fill('#p-res',String(R));await page.locator('#p-res').dispatchEvent('change');
     await page.evaluate(R=>setInquiryPot(2*R),R);await page.click('#record-btn');await page.click('#take-record');
     await page.click('#record-return');
    }
   }else{
    for(const resistance of [20,10,0]){await page.evaluate(value=>setInquiryPot(value),resistance);await page.click('#record-btn');await page.click('#take-record');await page.click('#record-return');}
   }
   await page.click('#record-btn');const labels=await page.evaluate(()=>inquiryAxes());assert.ok(labels.includes(index===11?'I-R 实验数据':'I-U 实验数据'));assert.ok(labels.includes(index===11?'R / Ω':'U / V'));assert.ok(labels.includes('I / A'));
   const data=await page.evaluate(()=>({records:sim.records.map(r=>({U:r.U,I:r.I,R:r.U/r.I,load:r.loadResistance})),groups:new Set(sim.records.map(r=>r.series)).size,headers:document.querySelector('#record-table thead').innerText,csv:sim.recordsCSV()}));
   assert.equal(data.groups,1);assert.match(data.headers,/R \/ Ω/);assert.match(data.headers,/P \/ W/);assert.match(data.csv,/接入电阻/);
   if(index===10)for(const r of data.records)assert.ok(Math.abs(r.R-10)<.001);
   if(index===11){assert.deepEqual(data.records.map(r=>r.load),[5,10,15,20]);for(const r of data.records)assert.ok(Math.abs(r.U-2)<.001);}
   if(index===12){assert.ok(data.records[2].R-data.records[0].R>3);assert.ok(data.records[2].I>data.records[0].I);}
   await page.click('#record-return');console.log('PASS Chromium inquiry '+(index+1)+': menu, records table/CSV, correct axes, controlled variables '+JSON.stringify(data.records));
  }
  await page.evaluate(()=>{sim.selectedComponent=sim.recordLoad();sim.updatePropertiesPanel();});assert.equal(await page.inputValue('#p-bulb-model'),'filament');
  const saved=await page.evaluate(()=>sim.experimentData());await page.selectOption('#p-bulb-model','fixed');assert.equal(await page.evaluate(()=>sim.recordLoad().bulbModel),'fixed');
  await page.evaluate(data=>sim.importExperiment(data),saved);assert.equal(await page.evaluate(()=>sim.recordLoad().bulbModel),'filament');assert.equal(await page.evaluate(()=>sim.records.length),3);
  assert.deepEqual(errors,[]);console.log('PASS Chromium filament model selector, persistence and no JavaScript errors');
 }finally{await browser.close();await new Promise(done=>server.close(done));}
})().catch(error=>{console.error(error);process.exitCode=1;});
