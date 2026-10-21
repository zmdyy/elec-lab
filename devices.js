/* Vector artwork and visible behaviour for the teaching loads.
   Electrical currents are solved in index.html, never inferred from animation. */
'use strict';
(() => {
const svg=(body,box='-80 -90 160 190')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="640" height="760">${body}</svg>`;
const ink=dark=>dark?'#e2e8f0':'#202932';
const defs=`<defs><linearGradient id="metal"><stop stop-color="#73869a"/><stop offset=".4" stop-color="#edf4fa"/><stop offset=".65" stop-color="#b9c8d4"/><stop offset="1" stop-color="#65798f"/></linearGradient><radialGradient id="bell"><stop stop-color="#e5eef4"/><stop offset=".52" stop-color="#b2c6d4"/><stop offset=".83" stop-color="#7f98ac"/><stop offset="1" stop-color="#435e74"/></radialGradient><linearGradient id="red"><stop stop-color="#6f1426"/><stop offset=".4" stop-color="#f96585"/><stop offset=".7" stop-color="#cf1e50"/><stop offset="1" stop-color="#81152e"/></linearGradient></defs>`;
function deviceArtwork(kind,dark=false,grid=20){
 const port=2*grid/1.3,post=grid/1.3;
 const edge=dark?'#cad8e5':'#293b4b';
 if(kind==='led-symbol')return svg(`<g fill="none" stroke="${ink(dark)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M-${port} 0H${port}M-18-17L13 0L-18 17ZM14-19V19M14 0H${port}"/><path d="M-1-27L-13-39M18-24L6-36"/><path d="M-13-39L-5-37L-11-31ZM6-36L14-34L8-28Z" fill="${ink(dark)}"/></g>`);
 if(kind==='motor-symbol')return svg(`<g fill="none" stroke="${ink(dark)}" stroke-width="2.8"><path d="M-${port} 0H-23M23 0H${port}"/><circle r="23"/></g><text x="0" y="9" text-anchor="middle" font-family="Georgia,serif" font-size="28" fill="${ink(dark)}">M</text>`);
 if(kind==='bell-symbol')return svg(`<g fill="none" stroke="${ink(dark)}" stroke-width="2.8" stroke-linejoin="round"><path d="M-25 5A25 25 0 0 1 25 5ZM-${post} 5V${port}M${post} 5V${port}"/></g>`);
 if(kind==='led-real')return svg(`${defs}<g stroke="${edge}" stroke-width="1.4"><path d="M-14 58V-3H-6V-25M14 46V-3H7V-23" stroke="${dark?'#d7e4ed':'#7f8f9f'}" stroke-width="5" fill="none"/><path d="M-23-5V-29A23 23 0 0 1 23-29V-5Z" fill="url(#red)" fill-opacity=".8"/><path d="M-18-7L-10-25L6-31L15-18L6-12Z" fill="#b6b8bf" fill-opacity=".8"/><path d="M-25-6H25V2H-25Z" fill="#df4c73"/><path d="M-15-38Q-7-50 7-45" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="8" cy="-35" r="4" fill="#ffd7e2" stroke="none"/></g>`);
 if(kind==='motor-real')return svg(`${defs}<g stroke="${edge}" stroke-width="1.7"><path d="M-62 28H62V52H-62Z" fill="#7f98ad"/><path d="M-62 22H62L62 38H-62Z" fill="#c4d7e5"/><path d="M-33 23V-36Q0-66 33-36V23Z" fill="url(#metal)"/><circle cy="-15" r="31" fill="#9cb4c8"/><circle cy="-15" r="23" fill="#5f788e"/><path d="M-20-11H20M-18-24H18" stroke="#abc4d5" stroke-width="3"/></g>`);
 if(kind==='fan-blades')return svg(`<g stroke="${edge}" stroke-width="1.5">${[0,120,240].map(a=>`<path transform="rotate(${a})" d="M-5 0C-34-3-55-24-50-43C-45-60-23-61-19-47C-16-33-10-19 5-6Z" fill="#bfd7ea"/>`).join('')}<circle r="7" fill="#e2edf5"/></g>`);
 if(kind==='bell-real')return svg(`${defs}<g stroke="${edge}" stroke-width="1.6"><path d="M-37-73H34L40-61V-22H-40V-61Z" fill="#52758e"/><rect x="-30" y="-64" width="57" height="31" rx="4" fill="#789aad"/><path d="M-21-57H19M-21-50H10" stroke="#d7e8ed" stroke-width="2"/><path d="M-30-22L-35-8M30-22L36-8" stroke="url(#metal)" stroke-width="6"/><circle cy="25" r="38" fill="url(#bell)"/><circle cy="25" r="30" fill="none" stroke="#d6e3ec" stroke-width="2"/><circle cy="25" r="5" fill="#e3ca79"/><path d="M-29-22L-48-10V65L-34 71M29-22L49-10V65L34 71" stroke="url(#metal)" stroke-width="3" fill="none"/><rect x="-48" y="68" width="96" height="20" rx="3" fill="#7995aa"/></g>`);
 if(kind==='bell-hammer')return svg(`<path d="M30-20L48-3L37 9" stroke="#bfa557" stroke-width="4" fill="none"/><rect x="31" y="4" width="13" height="10" rx="2" fill="#d8bc68" stroke="${edge}" stroke-width="1.4"/>`);
 return svg('');
}
function blend(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
Object.assign(CircuitSimulator.prototype,{
 lightColor(level){
  const stops=[[0,[55,35,30]],[.12,[130,41,18]],[.4,[236,115,22]],[.75,[255,206,72]],[1,[255,249,213]]];
  const t=Math.max(0,Math.min(1,level));for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const [x,a]=stops[i-1],[y,b]=stops[i];return `rgb(${blend(a,b,(t-x)/(y-x)).join(',')})`;}return 'rgb(255,249,213)';
 },
 bulbGlassColor(level){const t=Math.max(0,Math.min(1,level)),base=this.darkMode?[98,113,132]:[200,214,223],warm=this.lightColor(t).match(/\d+/g).map(Number);return `rgb(${blend(base,warm,Math.pow(t,.6)).join(',')})`;},
 isBellRinging(c){return this.simulationRunning&&!this.predictionHidden&&Math.abs(c._current||0)>Math.max(.002,(c.ratedCurrent||.1)*.15);},
 drawDeviceSVG(kind){this.drawSVG(kind+'-'+(this.darkMode?'dark':'light')+'-'+(this.gridSize||20),deviceArtwork(kind,this.darkMode,this.gridSize||20),-80,-90,160,190);},
 drawLed(c){this.drawDeviceSVG('led-symbol');this.drawLoadLabel(c,59);},
 drawMotor(c){this.drawDeviceSVG('motor-symbol');this.drawLoadLabel(c,44);},
 drawBell(c){this.drawDeviceSVG('bell-symbol');this.drawLoadLabel(c,56);},
 drawLedReal(c){
  const ctx=this.ctx,level=this.simulationRunning&&!this.predictionHidden?1-Math.exp(-Math.max(0,c._current||0)/Math.max(.001,c.ratedCurrent)):0;
  if(level>.001){const g=ctx.createRadialGradient(0,-25,3,0,-25,35+level*20);g.addColorStop(0,`rgba(255,40,85,${level*.85})`);g.addColorStop(1,'rgba(255,40,85,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,-25,35+level*20,0,Math.PI*2);ctx.fill();}
  this.drawDeviceSVG('led-real');
  if(level>.001){ctx.fillStyle=`rgba(255,225,220,${level})`;ctx.beginPath();ctx.ellipse(0,-24,7,9,0,0,Math.PI*2);ctx.fill();}
  this.label(c,'A',-25,55,{font:'bold 11px Arial'});this.label(c,'K',25,43,{font:'bold 11px Arial'});this.drawLoadLabel(c,-78);
 },
 drawMotorReal(c){
  this.drawDeviceSVG('motor-real');const ctx=this.ctx;ctx.save();ctx.translate(0,-15);ctx.rotate(c._rotorAngle||0);this.drawDeviceSVG('fan-blades');ctx.restore();
  this.bindingPost(-48,39);this.bindingPost(48,39);this.drawLoadLabel(c,77);
 },
 drawBellReal(c){
  this.drawDeviceSVG('bell-real');const ctx=this.ctx;ctx.save();if(this.isBellRinging(c)){ctx.translate(30,-20);ctx.rotate(Math.sin((this.flowPhase||0)*Math.PI*16)*.12);ctx.translate(-30,20);}
  this.drawDeviceSVG('bell-hammer');ctx.restore();this.bindingPost(-34,76);this.bindingPost(34,76);this.drawLoadLabel(c,101);
 },
 drawLoadLabel(c,y){
  const names={led:'发光二极管',motor:'电动机',bell:'电铃'},active=this.simulationRunning&&!this.predictionHidden;
  const over=active&&Math.abs(c._current||0)>(c.ratedCurrent||1);
  this.label(c,(c.label||names[c.type])+(over?'（过载）':''),0,y,{font:'12px Microsoft YaHei',color:over?'#e74c3c':'#333'});
  if(active&&Math.abs(c._current||0)>1e-6)this.label(c,(Math.abs(c._current)*1000).toFixed(1)+' mA',0,y+16,{font:'11px Arial',color:'#7f8c8d'});
 },
 advanceDevices(dt){
  let changing=false;
  for(const c of this.components){
   const live=this.simulationRunning&&!this.predictionHidden;
   if(c.type==='motor'){
    const target=live?Math.max(-18,Math.min(18,(c._current||0)/Math.max(c.ratedCurrent,.001)*9)):0;
    c._rotorSpeed=(c._rotorSpeed||0)+(target-(c._rotorSpeed||0))*(1-Math.exp(-dt/.28));
    if(Math.abs(c._rotorSpeed)<.002)c._rotorSpeed=0;
    c._rotorAngle=((c._rotorAngle||0)+c._rotorSpeed*dt)%(Math.PI*2);changing ||= Math.abs(c._rotorSpeed)>.001;
   }
   if(c.type==='bulb'){
    const target=live?1-Math.exp(-1.9*Math.pow((Math.abs(c.current||0)/Math.max(c.ratedCurrent||.3,.001))**2,.8)):0;
    c._lampLevel=(c._lampLevel??0)+(target-(c._lampLevel??0))*(1-Math.exp(-dt/.09));
    if(Math.abs(target-c._lampLevel)<.0005)c._lampLevel=target;else changing=true;
   }
  }
  this.updateBellSound?.();return changing;
 },
 updateBellSound(){
  if(!this._bellAudio)return;
  const {context,gain}=this._bellAudio,now=context.currentTime;
  const enabled=this.bellSoundEnabled&&!document.hidden&&this.simulationRunning&&!this.predictionHidden&&this.components.some(c=>c.type==='bell'&&this.isBellRinging(c));
  const beat=enabled?Math.exp(-((now*8)%1)*7)*.035:0;
  gain.gain.setTargetAtTime(beat,now,.006);
 }
});
const appearance=CircuitSimulator.prototype.bulbAppearance;
CircuitSimulator.prototype.bulbAppearance=function(c){const v=appearance.call(this,c);if(typeof c._lampLevel==='number'&&!this.predictionHidden){v.level=c._lampLevel;v.lit=v.level>.001;v.color=this.bulbGlassColor(v.level);v.filament=this.lightColor(Math.pow(v.level,.65));}return v;};
const animate=CircuitSimulator.prototype.animate;
CircuitSimulator.prototype.animate=function(ts){const dt=this._deviceTs===undefined?0:Math.min(.05,(ts-this._deviceTs)/1000);this._deviceTs=ts;const changing=this.advanceDevices(dt);animate.call(this,ts);if(changing&&!(this.simulationRunning&&this._hasFlow))this.requestDraw();};
window.addEventListener('DOMContentLoaded',()=>{
 const button=document.createElement('button');button.className='tool-button';button.id='bell-sound';button.textContent='电铃声音：关';button.setAttribute('aria-pressed','false');
 // Classroom toolbar is created by the next DOMContentLoaded listener.
 const toolbar=document.querySelector('.toolbar');toolbar.appendChild(button);
 button.onclick=async()=>{
  const s=window.sim;if(!s._bellAudio){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){s.notify?.('当前浏览器不支持声音。');return;}
   const context=new Audio(),gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);
   for(const frequency of [1350,2160,3260]){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.start();}s._bellAudio={context,gain};
  }
  try{await s._bellAudio.context.resume();s.bellSoundEnabled=!s.bellSoundEnabled;button.textContent='电铃声音：'+(s.bellSoundEnabled?'开':'关');button.setAttribute('aria-pressed',String(s.bellSoundEnabled));s.updateBellSound();}catch(_){s.notify?.('声音暂未启用，请再次点击。');}
 };
 document.addEventListener('visibilitychange',()=>window.sim.updateBellSound());
});
// Pure artwork factory also used for vector validation and rendering checks.
CircuitSimulator.deviceArtwork=deviceArtwork;
})();
