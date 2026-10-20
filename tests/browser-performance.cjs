'use strict';
// Browser workload measurement for 10/20/30/40 wired circuits.
// Timings are reported, not used as hardware-dependent pass/fail thresholds.
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
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.click('[data-mode="mouse"]');
  await page.evaluate(()=>{
   const s=sim;window.__drawDurations=[];window.__perfActive=false;window.__perfSolve=0;window.__perfRoute=0;
   const oldDraw=s.draw.bind(s),oldSolve=s.solveCircuit.bind(s),oldRoute=s.autoRealWirePath.bind(s);
   s.draw=(...a)=>{const t=performance.now();const r=oldDraw(...a);if(__perfActive)__drawDurations.push(performance.now()-t);return r;};
   s.solveCircuit=(...a)=>{if(__perfActive)__perfSolve++;return oldSolve(...a);};
   s.autoRealWirePath=(...a)=>{if(__perfActive)__perfRoute++;return oldRoute(...a);};
  });
  for(const count of [10,20,30,40]){
   const drag=await page.evaluate(count=>{
    const s=sim;s.clearAll();s.viewMode='real';s.suppressUndo=true;
    const originalRecalc=s.recalc;s.recalc=()=>{};
    const pairs=count/2;
    for(let k=0;k<pairs;k++){
     const col=k%5,row=Math.floor(k/5),x=160+col*590,y=180+row*520;
     const a=s.createComponent('battery',{x,y}),b=s.createComponent('resistor',{x:x+240,y:y+55});
     a.realX=a.x;a.realY=a.y;b.realX=b.x;b.realY=b.y;
     s.wires.push(
       {start:{compId:a.id,termId:'pos'},end:{compId:b.id,termId:'a'},view:'both',bends:[],realBends:[{x:x+100,y:y-90},{x:x+170,y:y-90}]},
       {start:{compId:b.id,termId:'b'},end:{compId:a.id,termId:'neg'},view:'both',bends:[],realBends:[{x:x+170,y:y+170},{x:x+80,y:y+170}]}
     );
    }
    s.recalc=originalRecalc;s.suppressUndo=false;s.panX=80;s.panY=45;s.scale=.8;s.recalc();
    const c=s.components.find(v=>v.type==='resistor'),p=s.componentPos(c),r=s.canvas.getBoundingClientRect();
    window.__perfActive=true;window.__drawDurations=[];window.__perfSolve=0;window.__perfRoute=0;
    return {x:r.left+s.panX+p.x*s.scale,y:r.top+s.panY+p.y*s.scale};
   },count);
   const t=Date.now();
   await page.mouse.move(drag.x,drag.y);await page.mouse.down();
   await page.mouse.move(drag.x+45,drag.y+20,{steps:12});await page.mouse.up();
   await page.waitForTimeout(800);
   const result=await page.evaluate(()=>{
     window.__perfActive=false;
     const values=window.__drawDurations.slice().sort((a,b)=>a-b),sum=values.reduce((a,b)=>a+b,0);
     return {draws:values.length,meanMs:values.length?sum/values.length:0,
        p95Ms:values[Math.min(values.length-1,Math.floor(values.length*.95))]||0,
        solves:window.__perfSolve,routes:window.__perfRoute};
   });
   assert.equal(result.solves,0,'component dragging must not solve circuit');
   assert.equal(result.routes,0,'component dragging must not use whole-network router');
   assert.ok(result.draws>0,'the browser must render during the measured interval');
   console.log(JSON.stringify({wires:count,elapsedMs:Date.now()-t,...result}));
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
