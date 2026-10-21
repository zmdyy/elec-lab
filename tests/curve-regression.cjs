'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const dummy={style:{},innerHTML:'',classList:{contains:()=>false}};
const box={document:{getElementById:()=>dummy,querySelectorAll:()=>[]},window:{addEventListener(){}}};
vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]+';this.S=CircuitSimulator',box);
function build(){const s=Object.create(box.S.prototype);Object.assign(s,{components:[],wires:[],idCounter:0,viewMode:'real',simulationRunning:true});for(const fn of ['saveUndo','recalc','draw','updateCircuitInfo','updatePropertiesPanel'])s[fn]=()=>{};return s;}
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
// Validate arc positions against independent original segment projections;
// chord lengths across a corner are allowed to be shorter than arc lengths.
{
 const s=build(),source=[{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:7,y:0},{x:7,y:200},{x:600,y:200}];
 source._sampled=true;
 const points=s.sampleRealWirePath(source),lengths=[0];
 for(let i=1;i<source.length;i++)lengths.push(lengths[i-1]+Math.hypot(source[i].x-source[i-1].x,source[i].y-source[i-1].y));
 const total=lengths.at(-1);
 points.forEach((p,n)=>{
  let distance=Infinity,arc=0;
  for(let i=1;i<source.length;i++){
   const a=source[i-1],b=source[i],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);if(!l)continue;
   const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(l*l)));
   const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
   if(d<distance){distance=d;arc=lengths[i-1]+t*l;}
  }
  near(distance,0);near(arc,n*total/(points.length-1));
 });
 assert.equal(s.sampleRealWirePath(source),points,'immutable source geometry reuses its arc cache');
 assert.equal(s.sampleRealWirePath(points),points,'already normalized paths are not resampled again');
 assert.deepEqual(JSON.parse(JSON.stringify([points[0],points.at(-1)])),[source[0],source.at(-1)]);
 const zero=s.uniformRealWireSamples([{x:2,y:3},{x:2,y:3}]);assert.ok(zero.every(p=>p.x===2&&p.y===3));
 console.log('PASS final arc-distance samples, repeated vertices, terminal endpoints, degeneracy and cache idempotence');
}
{
 const s=build(),source=Array.from({length:49},(_,i)=>({x:i*10,y:80*Math.sin(i*Math.PI/24)}));
 const points=s.smoothEditedRealWirePath(source),lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
 assert.equal(points._arcSampled,true);
 assert.ok(Math.max(...lengths)<=2.000001);assert.ok(Math.min(...lengths)>1.95);
 console.log('PASS smoothed manual curve is normalized AFTER interpolation, with no clustered samples');
}
const maximumTurn=points=>{
 let max=0;
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],u=[b.x-a.x,b.y-a.y],v=[c.x-b.x,c.y-b.y];
  const length=Math.hypot(...u)*Math.hypot(...v);if(!length)continue;
  max=Math.max(max,Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/length))));
 }
 return max*180/Math.PI;
};
// Photo regression: a >3 V supply terminal above its body should connect toward
// a lower-right switch without first rising and doubling back.
{
 const s=build(),b=s.createComponent('battery',{x:140,y:120,voltage:9.5}),sw=s.createComponent('switch',{x:440,y:220});
 for(const c of s.components){c.realX=c.x;c.realY=c.y;}
 s.connectTerminals(b,'pos',sw,'a',[],'both');const w=s.wires[0];
 assert.equal(s.routeNewWireLocally(w),true);const p=s.sampleRealWirePath(s.resolveRealWire(w));
 assert.ok(p.every(q=>q.y>=p[0].y-.001),'supply wire must not rise into a return hook');
 for(let i=1;i<p.length;i++){assert.ok(p[i].x>=p[i-1].x-.001);assert.ok(p[i].y>=p[i-1].y-.001);}
 assert.equal(s.wireRoutesReport(new Map([[w,p]])).clear,true);
 assert.ok(maximumTurn(p)<6,'adjacent display samples must not hide an abrupt tangent jump');
 console.log('PASS 9.5 V supply to lower-right switch: forward natural curve, no upward hook, safe clearance');
}
// Photo regression: an ammeter under a source needs a safe diagonal/lateral
// approach, not a fixed downward tail followed by a tight reversal.
{
 const s=build(),b=s.createComponent('battery',{x:100,y:80}),a=s.createComponent('ammeter',{x:320,y:240});
 for(const c of s.components){c.realX=c.x;c.realY=c.y;}
 s.connectTerminals(b,'pos',a,'neg',[],'both');const w=s.wires[0];
 assert.equal(s.routeNewWireLocally(w),true);const p=s.sampleRealWirePath(s.resolveRealWire(w)),end=p.at(-1);
 assert.ok(Math.max(...p.map(q=>q.y))<=end.y+1,'ammeter lead must not extend below its terminal and return upward');
 assert.equal(s.wireRoutesReport(new Map([[w,p]])).clear,true);
 assert.ok(maximumTurn(p)<6,'adjacent display samples must not hide an abrupt tangent jump');
 console.log('PASS ammeter approach: no downward return hook and no instrument-face intersection');
}
