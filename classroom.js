/* Persistence, export, recording, prediction and fault exploration.
   Circuit topology and routing remain owned by CircuitSimulator. */
'use strict';
(() => {
const STORAGE_KEY='elec-lab-experiment-v1';
const MAX_FILE_BYTES=2*1024*1024;
const componentFields=['id','type','x','y','rotation','realX','realY','realRotation','schematicRotation','realFlipX','schematicFlipX','voltage','resistance','ratedCurrent','forwardVoltage','position','state','range','label','labelMode','potUpperSide','potContactMode','fault','bulbModel','experimentRole','controlVoltage','schematicPreset'];
const clone=x=>JSON.parse(JSON.stringify(x));
const byId=id=>document.getElementById(id);
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=(x,min=-1e5,max=1e5)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const requireValid=(test,message)=>{if(!test)throw new Error(message);};
const cleanComponent=c=>Object.fromEntries(componentFields.filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
const cleanWire=w=>({start:clone(w.start),end:clone(w.end),bends:clone(w.bends||[]),realBends:w.realBends?clone(w.realBends):null,view:w.view||'both',autoSchematic:!!w.autoSchematic,...(w.fault?{fault:w.fault}:{}),...(w.reverseBackup?{reverseBackup:clone(w.reverseBackup)}:{}),...(w.connectionBackup?{connectionBackup:clone(w.connectionBackup)}:{}),...(w.editControls?{editControls:clone(w.editControls)}:{})});
const uid=c=>`${c.label||COMPONENT_DEFS[c.type].name} (${c.id})`;
const blankClassroom=()=>({records:[],recordU:null,recordI:null,predictionHidden:false,predictionText:'',faultHidden:false});
function validateEditControls(raw) {
 requireValid(raw&&typeof raw==='object'&&!Array.isArray(raw),'导线控制点数据无效。');
 requireValid(Object.keys(raw).every(k=>['real','schematic'].includes(k)),'导线控制点视图无效。');
 const result={};
 for(const mode of Object.keys(raw)){
  const item=raw[mode];
  requireValid(item&&typeof item==='object'&&!Array.isArray(item),'导线控制点数据无效。');
  requireValid(Array.isArray(item.points)&&item.points.length===3&&item.points.every(p=>p&&finite(p.x)&&finite(p.y)),'每根导线必须具有3个有效控制点。');
  requireValid(typeof item.manual==='boolean'&&(item.sampled===undefined||typeof item.sampled==='boolean'),'导线控制点状态无效。');
  result[mode]={points:item.points.map(p=>({x:p.x,y:p.y})),manual:item.manual,sampled:!!item.sampled};
 }
 return result;
}
function validateGraph(graph) {
 requireValid(graph&&Array.isArray(graph.components)&&graph.components.length<=150&&Array.isArray(graph.wires)&&graph.wires.length<=500,'元件或导线数据不完整，最多支持 150 个元件、500 根导线。');
 const ids=new Map();
 const components=graph.components.map(raw=>{
  requireValid(raw&&typeof raw==='object'&&Object.hasOwn(COMPONENT_DEFS,raw.type),'文件包含不支持的元件。');
  requireValid(typeof raw.id==='string'&&/^C\d{1,8}$/.test(raw.id)&&!ids.has(raw.id),'元件编号重复或无效。');
  const c={rotation:0,...clone(COMPONENT_DEFS[raw.type].defaults),...cleanComponent(raw)};
  requireValid(finite(c.x)&&finite(c.y),'元件位置无效。');
  for(const k of ['rotation','realRotation','schematicRotation'])if(c[k]!==undefined)requireValid(finite(c[k],-3600,3600),'元件方向无效。');
  for(const k of ['realX','realY'])if(c[k]!==undefined)requireValid(finite(c[k]),'实物图位置无效。');
  for(const k of ['voltage','resistance','ratedCurrent','forwardVoltage'])if(c[k]!==undefined)requireValid(finite(c[k],0,1e8),'电压、电阻或额定电流无效。');
  if(c.type==='led')requireValid(finite(c.forwardVoltage,.1,10)&&finite(c.resistance,.01,1e8)&&finite(c.ratedCurrent,.001,1),'二极管参数无效。');
  if(c.bulbModel!==undefined)requireValid(c.type==='bulb'&&['fixed','filament'].includes(c.bulbModel)&&(c.bulbModel!=='filament'||c.resistance>=.01),'灯泡模型无效。');
  if(c.experimentRole!==undefined)requireValid((c.type==='resistor'&&['iu-load','ir-load'].includes(c.experimentRole))||(c.type==='bulb'&&c.experimentRole==='filament-load'),'探究对象无效。');
  if(c.controlVoltage!==undefined)requireValid(c.experimentRole==='ir-load'&&finite(c.controlVoltage,.01,15),'控制电压无效。');
  if(c.position!==undefined)requireValid(finite(c.position,0,1),'滑片位置应在 0 到 1 之间。');
  if(c.state!==undefined)requireValid(['open','closed'].includes(c.state),'开关状态无效。');
  if(c.range!==undefined)requireValid((c.type==='ammeter'?[.6,3]:[3,15]).includes(c.range),'电表量程无效。');
  if(c.schematicPreset!==undefined)requireValid(typeof c.schematicPreset==='boolean','电路图模板设置无效。');
  if(c.labelMode!==undefined)requireValid(['auto','custom'].includes(c.labelMode),'元件命名方式无效。');
  if(c.label!==undefined)requireValid(typeof c.label==='string'&&c.label.length<=80,'元件名称过长。');
  for(const k of ['realFlipX','schematicFlipX'])if(c[k]!==undefined)requireValid(typeof c[k]==='boolean','元件朝向无效。');
  if(c.potUpperSide!==undefined)requireValid([-1,1].includes(c.potUpperSide),'变阻器引线位置无效。');
  if(c.potContactMode!==undefined)requireValid(['auto','pinned','mapped'].includes(c.potContactMode),'变阻器接线方式无效。');
  if(c.fault!==undefined)requireValid((['resistor','bulb','potentiometer','ammeter','voltmeter','led','motor','bell'].includes(c.type)&&['open','short'].includes(c.fault))||(['ammeter','voltmeter'].includes(c.type)&&c.fault==='reverse')||(c.type==='potentiometer'&&['upper','lower'].includes(c.fault)),'元件故障类型无效。');
  ids.set(c.id,c);return c;
 });
 const points=pts=>{
  requireValid(Array.isArray(pts)&&pts.length<=200&&pts.every(p=>p&&finite(p.x)&&finite(p.y)),'导线路径无效。');
  return pts.map(p=>({x:p.x,y:p.y}));
 };
 const wires=graph.wires.map(w=>{
  requireValid(w&&typeof w==='object','导线数据无效。');
  for(const end of [w.start,w.end]){
   const c=end&&ids.get(end.compId);
   requireValid(c&&COMPONENT_DEFS[c.type].terminals(c).some(t=>t.id===end.termId),'导线连接了不存在的元件或接线柱。');
  }
  requireValid(['schematic','real','both',undefined].includes(w.view),'导线视图无效。');
  requireValid(w.autoSchematic===undefined||typeof w.autoSchematic==='boolean','导线整理设置无效。');
  requireValid(w.fault===undefined||w.fault==='open','导线故障类型无效。');
  const editControls=w.editControls===undefined?undefined:validateEditControls(w.editControls);
  let backup;
  if(w.reverseBackup){const b=w.reverseBackup;requireValid(['ammeter','voltmeter'].includes(ids.get(b.owner)?.type)&&[w.start.compId,w.end.compId].includes(b.owner)&&typeof b.autoSchematic==='boolean','反接导线备份无效。');if(b.start||b.end)for(const e of [b.start,b.end])requireValid(e&&ids.has(e.compId)&&COMPONENT_DEFS[ids.get(e.compId).type].terminals(ids.get(e.compId)).some(t=>t.id===e.termId),'反接备份端点无效。');backup={owner:b.owner,...(b.start?{start:clone(b.start),end:clone(b.end)}:{}),bends:points(b.bends),realBends:b.realBends===null?null:points(b.realBends),autoSchematic:b.autoSchematic,...(b.editControls?{editControls:validateEditControls(b.editControls)}:{})};}
  if(w.connectionBackup){const b=w.connectionBackup;requireValid(ids.get(b.owner)?.type==='potentiometer'&&[w.start.compId,w.end.compId].includes(b.owner)&&typeof b.autoSchematic==='boolean','接线备份无效。');for(const e of [b.start,b.end])requireValid(e&&ids.has(e.compId)&&COMPONENT_DEFS[ids.get(e.compId).type].terminals(ids.get(e.compId)).some(t=>t.id===e.termId),'接线备份端点无效。');requireValid([b.start.compId,b.end.compId].includes(b.owner),'接线备份所属元件无效。');w={...w,connectionBackup:{owner:b.owner,start:clone(b.start),end:clone(b.end),bends:points(b.bends),realBends:b.realBends===null?null:points(b.realBends),autoSchematic:b.autoSchematic,...(b.editControls?{editControls:validateEditControls(b.editControls)}:{})}};}
  const cleaned=cleanWire(w);delete cleaned.fault;
  return {...cleaned,bends:points(w.bends||[]),realBends:w.realBends===null||w.realBends===undefined?null:points(w.realBends),...(backup?{reverseBackup:backup}:{}),...(editControls?{editControls}:{})};
 });
 return {components,wires};
}
function validateClassroom(raw={}) {
 const result=blankClassroom();
 requireValid(raw&&typeof raw==='object','课堂数据无效。');
 const records=raw.records||[];
 requireValid(Array.isArray(records)&&records.length<=1000,'最多支持 1000 条实验记录。');
 result.records=records.map(r=>{
  requireValid(r&&finite(r.U,-1e8,1e8)&&finite(r.I,-1e8,1e8)&&typeof r.series==='string'&&r.series.length<=30000&&typeof r.label==='string'&&r.label.length<=160,'实验记录数据无效。');
  requireValid(typeof r.time==='string'&&r.time.length<=40&&['closed','open','unknown'].includes(r.state),'实验记录状态无效。');
  requireValid(Array.isArray(r.meters)&&r.meters.length<=150&&r.meters.every(m=>m&&typeof m.id==='string'&&['A','V'].includes(m.unit)&&typeof m.label==='string'&&m.label.length<=100&&finite(m.value,-1e8,1e8)),'电表记录无效。');
  requireValid(Array.isArray(r.sliders)&&r.sliders.length<=150&&r.sliders.every(p=>p&&typeof p.id==='string'&&finite(p.position,0,1)),'滑片记录无效。');
  if(r.loadResistance!==undefined)requireValid(finite(r.loadResistance,.01,1e8),'记录的接入电阻无效。');
  return {...(r.loadResistance!==undefined?{loadResistance:r.loadResistance}:{}),U:r.U,I:r.I,series:r.series,label:r.label,time:r.time,state:r.state,meters:clone(r.meters),sliders:clone(r.sliders)};
 });
 for(const k of ['recordU','recordI']){requireValid(raw[k]==null||(typeof raw[k]==='string'&&raw[k].length<40),'测量对象无效。');result[k]=raw[k]??null;}
 for(const k of ['predictionHidden','faultHidden']){requireValid(raw[k]===undefined||typeof raw[k]==='boolean','课堂模式无效。');result[k]=k==='faultHidden'?false:!!raw[k];}
 requireValid(raw.predictionText===undefined||(typeof raw.predictionText==='string'&&raw.predictionText.length<=2000),'预测文字过长。');
 result.predictionText=raw.predictionText||'';return result;
}
function validateExperiment(input) {
 requireValid(input&&input.format==='elec-lab-experiment'&&input.version===1,'请选择本实验室保存的实验 JSON 文件（版本 1）。');
 const graph=validateGraph(input),reference=input.schematicReference?validateGraph(input.schematicReference):null;
 requireValid(graph.components.filter(c=>c.fault).length+graph.wires.filter(w=>w.fault).length<=1,'每个实验最多设置一处故障。');
 const nextId=[...graph.components,...(reference?.components||[])].reduce((n,c)=>Math.max(n,Number(c.id.slice(1))+1),0);
 requireValid(input.idCounter===undefined||(Number.isInteger(input.idCounter)&&input.idCounter>=nextId&&input.idCounter<=1e8),'元件编号计数无效。');
 requireValid(['schematic','real'].includes(input.viewMode),'实验视图无效。');
 const camera=input.camera||{};
 requireValid(finite(camera.panX)&&finite(camera.panY)&&finite(camera.scale,.05,5),'画布显示比例无效。');
 requireValid(input.activeExperiment==null||(Number.isInteger(input.activeExperiment)&&input.activeExperiment>=0&&input.activeExperiment<EXPERIMENTS.length),'内置实验编号无效。');
 requireValid(typeof input.darkMode==='boolean'&&typeof input.showGrid==='boolean'&&typeof input.showPotPrinciple==='boolean','显示设置无效。');
 requireValid(input.name===undefined||(typeof input.name==='string'&&input.name.length<=80),'实验名称过长。');
 return {...graph,savedAt:typeof input.savedAt==='string'?input.savedAt:'',name:input.name||'',idCounter:input.idCounter??nextId,format:input.format,version:1,viewMode:input.viewMode,camera:{panX:camera.panX,panY:camera.panY,scale:camera.scale},activeExperiment:input.activeExperiment??null,schematicReference:reference,darkMode:input.darkMode,showGrid:input.showGrid,showPotPrinciple:input.showPotPrinciple,classroom:validateClassroom(input.classroom)};
}
Object.assign(CircuitSimulator.prototype, {
 initClassroom() {
  this.restoreClassroom();this._classroomReady=true;
  const bar=document.createElement('div');bar.className='classroom-toolbar';
  bar.innerHTML=`<button class="tool-button" id="experiment-file-btn">导出实验</button><button class="tool-button" id="import-experiment-btn">导入实验</button><button class="tool-button" id="meter-zoom-btn">放大读表</button><button class="tool-button" id="library-toggle" aria-expanded="true">元件库</button><button class="tool-button" id="properties-toggle" aria-expanded="true">属性面板</button><button class="tool-button" id="export-image-btn">导出图片</button><button class="tool-button" id="record-btn">实验记录</button><button class="tool-button" id="prediction-btn" aria-pressed="false">课堂预测</button><span id="classroom-status" role="status">自动保存已开启</span>`;
  const main=document.querySelector('.main-content');main.insertBefore(bar,byId('canvas-container'));
  const prediction=document.createElement('div');prediction.id='prediction-banner';prediction.hidden=true;prediction.setAttribute('role','status');main.insertBefore(prediction,byId('canvas-container'));
  const recovery=document.createElement('div');recovery.id='recovery-banner';recovery.hidden=true;main.insertBefore(recovery,byId('canvas-container'));
  const dialog=document.createElement('dialog');dialog.id='classroom-dialog';dialog.setAttribute('aria-labelledby','classroom-dialog-title');dialog.innerHTML='<header><h2 id="classroom-dialog-title"></h2><button class="dialog-close" aria-label="关闭">×</button></header><div class="dialog-body"></div>';document.body.appendChild(dialog);
  dialog.querySelector('.dialog-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>this._dialogKind=null);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  const message=document.createElement('div');message.id='classroom-message';message.hidden=true;message.setAttribute('role','status');document.body.appendChild(message);
  byId('experiment-file-btn').onclick=()=>this.openFileDialog();
  byId('import-experiment-btn').onclick=()=>{this.openFileDialog();byId('load-experiment').click();};
  byId('meter-zoom-btn').onclick=()=>this.openMeterDialog();
  for(const [selector,cls] of [['.component-library','library-collapsed'],['.properties-panel','properties-collapsed']]){const close=document.createElement('button');close.className='panel-close';close.textContent='收起';close.onclick=()=>{document.body.classList.add(cls);byId(cls==='library-collapsed'?'library-toggle':'properties-toggle').setAttribute('aria-expanded','false');this.resizeCanvas();};document.querySelector(selector).prepend(close);}
  const miniTitle=document.querySelector('#schematic-mini .mini-title');miniTitle.textContent='参考电路图 · 点击收起 / 展开';miniTitle.style.cursor='pointer';miniTitle.tabIndex=0;miniTitle.setAttribute('role','button');miniTitle.setAttribute('aria-expanded','true');const toggleMini=()=>{const closed=byId('schematic-mini').classList.toggle('mini-collapsed');miniTitle.setAttribute('aria-expanded',String(!closed));};miniTitle.onclick=toggleMini;miniTitle.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleMini();}};
  for(const [id,cls] of [['library-toggle','library-collapsed'],['properties-toggle','properties-collapsed']])byId(id).onclick=()=>{const collapsed=document.body.classList.toggle(cls);byId(id).setAttribute('aria-expanded',String(!collapsed));this.resizeCanvas();};
  const compact=window.matchMedia('(max-width:1099px)');const collapsePanels=()=>{if(compact.matches){document.body.classList.add('library-collapsed','properties-collapsed');byId('library-toggle').setAttribute('aria-expanded','false');byId('properties-toggle').setAttribute('aria-expanded','false');}};collapsePanels();compact.addEventListener('change',collapsePanels);
  byId('export-image-btn').onclick=()=>this.openExportDialog();byId('record-btn').onclick=()=>this.openRecordsDialog();byId('prediction-btn').onclick=()=>{if(this.predictionHidden){this.predictionHidden=false;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();}else this.openPredictionDialog();};
  try {const saved=localStorage.getItem(STORAGE_KEY);if(saved){const restored=validateExperiment(JSON.parse(saved));this._recoveryData=restored;this._recoveryPending=true;this.renderRecovery();}}catch(_){byId('classroom-status').textContent='上次缓存无法读取，可打开已保存的文件。';}
  document.addEventListener('pointerup',()=>this.scheduleAutosave());
  this.canvas.addEventListener('wheel',()=>this.scheduleAutosave(),{passive:true});
  window.addEventListener('pagehide',()=>this.flushAutosave());
  if(typeof ResizeObserver!=='undefined'){this._canvasObserver=new ResizeObserver(()=>{const box=byId('canvas-container');if(this._canvasWidth!==box.clientWidth||this._canvasHeight!==box.clientHeight)this.resizeCanvas();});this._canvasObserver.observe(byId('canvas-container'));}
  this.resizeCanvas();this.refreshClassroom();
 },
 classroomSnapshot() {return {records:clone(this.records||[]),recordU:this.recordU??null,recordI:this.recordI??null,predictionHidden:!!this.predictionHidden,predictionText:this.predictionText||'',faultHidden:false};},
 restoreClassroom(raw) {Object.assign(this,raw?clone(raw):blankClassroom());this._solutionState='unknown';this._mainMeasurements=null;this._currentSeries=null;},
 experimentData() {
  return {format:'elec-lab-experiment',version:1,name:this.experimentName||'',savedAt:new Date().toISOString(),idCounter:this.idCounter,components:this.components.map(cleanComponent),wires:this.wires.map(cleanWire),viewMode:this.viewMode,camera:{panX:this.panX,panY:this.panY,scale:this.scale},activeExperiment:this.activeExperiment??null,schematicReference:this.schematicReference?{components:this.schematicReference.components.map(cleanComponent),wires:this.schematicReference.wires.map(cleanWire)}:null,darkMode:!!this.darkMode,showGrid:!!this.showGrid,showPotPrinciple:!!this.showPotPrinciple,classroom:this.classroomSnapshot()};
 },
 importExperiment(input) {
  const data=validateExperiment(input); // Validate completely before changing the current experiment.
  this.saveUndo();this.components=data.components;this.wires=data.wires;
  this.idCounter=data.idCounter;this.experimentName=data.name;
  this.viewMode=data.viewMode;Object.assign(this,data.camera);this.activeExperiment=data.activeExperiment;this.schematicReference=data.schematicReference;
  this.darkMode=data.darkMode;this.showGrid=data.showGrid;this.showPotPrinciple=data.showPotPrinciple;this.restoreClassroom(data.classroom);
  this._realLayoutSignature=null;this._schematicLayoutSignature=null;this._routeKey=null;this._routes=null;this._flowGeometryKey=null;
  this.selectedComponent=null;this.selectedWire=null;this.dragging=false;this.draggingControlPoint=null;this.isPanning=false;this._switchPress=null;this._dragBaseline=null;this._dragOrigin=null;this.wireDrawing=false;this.draftWire=null;
  this._recoveryPending=false;this._recoveryData=null;if(byId('recovery-banner'))byId('recovery-banner').hidden=true;if(byId('classroom-status'))byId('classroom-status').textContent='实验已恢复，自动保存已开启';
  this.applyTheme();try{localStorage.setItem('elec-lab-theme',this.darkMode?'dark':'light');}catch(_){}
  this.syncViewButton();this.togglePotPrinciple(this.showPotPrinciple);this.restoreGuide();this.updateMiniSchematicVisibility();this.updatePropertiesPanel();this.recalc();
  this.resizeCanvas();this.draw();
 },
 restoreGuide() {
  const g=byId('guide-panel'),exp=EXPERIMENTS[this.activeExperiment];
  if(!exp){g.classList.remove('show');return;}
  g.innerHTML=`<h4>${escape(exp.title)}<span class="close-g">✕</span></h4><div class="goal">🎯 <b>实验目的：</b>${escape(exp.goal)}</div><ol>${exp.steps.map(s=>`<li>${escape(s)}</li>`).join('')}</ol>`;
  g.classList.add('show');g.querySelector('.close-g').onclick=()=>{g.classList.remove('show');this.scheduleAutosave();};
 },
 renderRecovery() {
  const banner=byId('recovery-banner');banner.hidden=false;banner.innerHTML='发现上次自动保存的实验。<button id="recover-last">恢复上次实验</button><button id="discard-last">使用当前实验</button>';
  byId('recover-last').onclick=()=>{try{this.importExperiment(this._recoveryData);this.notify('已恢复上次实验。');}catch(e){this.notify(e.message);}};
  byId('discard-last').onclick=()=>{this._recoveryPending=false;this._recoveryData=null;banner.hidden=true;this.resizeCanvas();this.flushAutosave();};
  byId('classroom-status').textContent='上次实验等待恢复';
 },
 scheduleAutosave() {
  if(!this._classroomReady||this._recoveryPending)return;
  clearTimeout(this._autosaveTimer);this._autosaveTimer=setTimeout(()=>this.flushAutosave(),650);
 },
 flushAutosave() {
  if(!this._classroomReady||this._recoveryPending)return;
  clearTimeout(this._autosaveTimer);
  try {const data=this.experimentData();validateExperiment(data);localStorage.setItem(STORAGE_KEY,JSON.stringify(data));byId('classroom-status').textContent='已自动保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
  catch(_){byId('classroom-status').textContent='自动保存失败，请下载实验文件保存。';}
 },
 notify(text) {const dialog=byId('classroom-dialog');if(dialog?.open){const inline=byId('classroom-dialog-message');if(inline){inline.textContent=text;inline.hidden=false;return;}}const el=byId('classroom-message');if(!el)return;el.textContent=text;el.hidden=false;clearTimeout(this._messageTimer);this._messageTimer=setTimeout(()=>el.hidden=true,5000);},
 showClassroomDialog(kind,title,markup) {
  const d=byId('classroom-dialog');this._dialogKind=kind;byId('classroom-dialog-title').textContent=title;d.querySelector('.dialog-body').innerHTML='<p id="classroom-dialog-message" role="status" class="classroom-dialog-feedback" hidden></p>'+markup;if(!d.open)d.showModal();
 },
 downloadBlob(blob,name) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);},
 fileName(ext) {
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(/[-: ]/g,'');
  const name=(this.experimentName||'电学实验').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,80)||'电学实验';
  return name+'_'+date+'.'+ext;
 },
 openFileDialog() {
  this.showClassroomDialog('file','保存与恢复实验',`<p>保存两个视图的元件位置、接线柱、参数、课堂模式及记录数据。换电脑后导入此文件即可继续实验。</p><div class="classroom-fields"><label>实验名称<input id="experiment-name" maxlength="80" value="${escape(this.experimentName||'')}" placeholder="例如：并联电路电流规律"></label></div><div class="classroom-actions"><button class="primary" id="save-experiment">下载实验文件</button><label>导入实验<input id="load-experiment" type="file" accept=".json,application/json" aria-label="打开实验文件"></label></div><p class="classroom-note">打开文件会替换当前实验，可用“撤销”恢复。自动保存保存在当前浏览器；跨电脑使用请下载 JSON 文件。</p><p id="file-result" role="status"></p>`);
  byId('save-experiment').onclick=()=>{try{this.experimentName=byId('experiment-name').value.trim();const data=this.experimentData();validateExperiment(data);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});requireValid(blob.size<=MAX_FILE_BYTES,'记录数据过多，请先导出 CSV 并清空记录，再保存实验。');this.downloadBlob(blob,this.fileName('json'));this.flushAutosave();byId('file-result').textContent='实验文件已生成。';}catch(e){byId('file-result').textContent='保存失败：'+e.message;}};
  byId('load-experiment').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{requireValid(f.size<=MAX_FILE_BYTES,'文件过大，最多支持 2 MB。');const data=JSON.parse(await f.text());this.importExperiment(data);byId('classroom-dialog').close();this.resizeCanvas();this.fitView(byId('guide-panel').classList.contains('show')?310:20);this.notify('已打开实验，原实验可通过“撤销”恢复。');}catch(error){byId('file-result').textContent='打开失败：'+error.message;}finally{e.target.value='';}};
 },
 openMeterDialog() {
  const meters=this.components.filter(c=>['ammeter','voltmeter'].includes(c.type));
  if(!meters.length){this.notify('请先添加电流表或电压表。');return;}
  const selected=meters.includes(this.selectedComponent)?this.selectedComponent:meters[0];
  this.showClassroomDialog('meter','放大读表',`<div class="classroom-fields"><label>选择电表<select id="zoom-meter">${meters.map(c=>`<option value="${escape(c.id)}" ${c===selected?'selected':''}>${escape(c.label||COMPONENT_DEFS[c.type].name)} · ${escape(c.id)}</option>`).join('')}</select></label></div><canvas id="meter-detail" width="900" height="620" style="display:block;width:100%;max-height:65vh;object-fit:contain"></canvas><p class="classroom-note">与实验中的量程、指针及读数同步；调整参数后可重新打开读表。</p>`);
  const render=async()=>{
   const c=this.components.find(c=>c.id===byId('zoom-meter')?.value);if(!c)return;
   const canvas=byId('meter-detail'),ctx=canvas.getContext('2d');
   const art=this._art?.get('meter-'+(c.type==='ammeter'?'A':'V'));if(art?.decode)await art.decode();
   if(!canvas.isConnected)return;
   ctx.clearRect(0,0,900,620);ctx.save();ctx.translate(450,305);ctx.scale(2.8,2.8);ctx.textBaseline='middle';
   const previous=this.ctx;this.ctx=ctx;try{this.drawMeterReal(c,c.type==='ammeter'?'A':'V');}finally{this.ctx=previous;ctx.restore();}
  };
  byId('zoom-meter').onchange=render;render();
 },
 imageBounds() {
  requireValid(this.components.length>0,'请先放入元件。');
  const boxes=this.components.map(c=>this.realComponentBox(c,35));
  const points=this.activeWires().flatMap(w=>this.viewMode==='real'?this.sampleRealWirePath(this.resolveRealWire(w)):this.resolveWire(w));
  if(!this.faultHidden&&!this.predictionHidden)for(const c of this.components.filter(c=>c.fault)){const p=this.componentPos(c),a=this.componentAngle(c)*Math.PI/180,k=this.componentSize(c),x=p.x+115*k*Math.sin(a),y=p.y-115*k*Math.cos(a);boxes.push({left:x-65*k,right:x+65*k,top:y-15*k,bottom:y+15*k});}
  return {left:Math.min(...boxes.map(b=>b.left),...points.map(p=>p.x)),right:Math.max(...boxes.map(b=>b.right),...points.map(p=>p.x)),top:Math.min(...boxes.map(b=>b.top),...points.map(p=>p.y)),bottom:Math.max(...boxes.map(b=>b.bottom),...points.map(p=>p.y))};
 },
 async exportImage() {
  requireValid(this.components.length>0,'请先放入元件。');this.draw();
  await Promise.all([...(this._art?.values()||[])].map(img=>img.decode?img.decode():Promise.resolve()));
  const b=this.imageBounds(),w=Math.max(120,b.right-b.left),h=Math.max(100,b.bottom-b.top),pad=40;
  const factor=Math.min(3,Math.max(1,2400/(w+pad*2)),8192/(w+pad*2),8192/(h+pad*2),Math.sqrt(24e6/((w+pad*2)*(h+pad*2))));
  const canvas=document.createElement('canvas');canvas.width=Math.ceil((w+pad*2)*factor);canvas.height=Math.ceil((h+pad*2)*factor);
  const saved={canvas:this.canvas,ctx:this.ctx,scale:this.scale,panX:this.panX,panY:this.panY,showGrid:this.showGrid,selectedComponent:this.selectedComponent,selectedWire:this.selectedWire,wireDrawing:this.wireDrawing,exportingImage:this.exportingImage};
  try {Object.assign(this,{canvas,ctx:canvas.getContext('2d'),scale:factor,panX:(pad-b.left)*factor,panY:(pad-b.top)*factor,showGrid:false,selectedComponent:null,selectedWire:null,wireDrawing:false,exportingImage:true});this.draw();}
  finally {Object.assign(this,saved);this.draw();}
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片生成失败。')),'image/png'));
 },
 openExportDialog() {
  const view=this.viewMode==='real'?'实物图':'电路图';
  this.showClassroomDialog('export','导出高清图片',`<p>导出当前${view}的完整电路，自动去掉网格与选中框，不受当前缩放和画布边缘限制。</p><p class="classroom-note">保留当前明暗主题；课堂预测尚未揭示时，图片也会隐藏结果。</p><div class="classroom-actions"><button class="primary" id="download-image">下载${view} PNG</button></div><p id="image-result" role="status"></p>`);
  byId('download-image').onclick=async()=>{const button=byId('download-image'),result=byId('image-result');button.disabled=true;result.textContent='正在生成图片…';try{const blob=await this.exportImage();this.downloadBlob(blob,this.fileName('png'));result.textContent='图片已生成。';}catch(e){result.textContent=e.message;}finally{button.disabled=false;}};
 },
 measurementOptions(unit) {
  return [...this.components.filter(c=>c.type==='battery').map(c=>({value:'source:'+c.id,label:(unit==='V'?'电源电压':'干路电流')+' · '+uid(c)})),...this.components.filter(c=>c.type===(unit==='V'?'voltmeter':'ammeter')).map(c=>({value:c.id,label:uid(c)}))];
 },
 ensureRecordSelections() {
  for(const [key,unit] of [['recordU','V'],['recordI','A']]){const opts=this.measurementOptions(unit);if(!opts.some(o=>o.value===this[key]))this[key]=opts.find(o=>!o.value.startsWith('source:'))?.value||opts[0]?.value||null;}
 },
 measurementValue(key,unit) {
  const source=key?.startsWith('source:'),id=source?key.slice(7):key,c=this.components.find(c=>c.id===id);
  requireValid(c&&(source?c.type==='battery':c.type===(unit==='V'?'voltmeter':'ammeter')),'请选择有效的测量对象。');
  const value=source?(unit==='V'?c.voltage:c._current||0):c.measurement;
  requireValid(Number.isFinite(value),'当前测量值无效。');
  if(!source)requireValid(Math.abs(value)<=c.range+1e-6,uid(c)+' 超量程，请改接合适量程后再记录。');return value;
 },
 recordLoad() {
  const loads=this.components.filter(c=>['iu-load','ir-load','filament-load'].includes(c.experimentRole));return loads.length===1?loads[0]:null;
 },
 recordSeries() {
  // Voltage and slider position are variables; topology, loads and selected meters define a series.
  const load=this.recordLoad();
  const signature=c=>{const row=[c.id,c.type,c===load&&c.experimentRole==='ir-load'?null:c.resistance,c.fault||null];if(c.bulbModel==='filament'||c.experimentRole)row.push(c.bulbModel||'fixed',c.experimentRole||null,c.controlVoltage??null);return row;};
  return JSON.stringify([this.viewMode,this.recordU,this.recordI,this.components.map(signature),this.activeWires().map(w=>[w.start,w.end,w.fault||null])]);
 },
 recordSample() {
  requireValid(!this.predictionHidden,'请先揭示结果，再记录测量数据。');requireValid(this.components.some(c=>c.type==='battery'),'请先接入电源。');requireValid((this.records||[]).length<1000,'记录已达到 1000 条，请先导出并清空。');
  this.ensureRecordSelections();this.solveCircuit();requireValid(['closed','open'].includes(this._solutionState),'当前电路没有可记录的有效结果，请先检查接线。');
  const uLabel=this.measurementOptions('V').find(o=>o.value===this.recordU)?.label,iLabel=this.measurementOptions('A').find(o=>o.value===this.recordI)?.label;
  const record={time:new Date().toISOString(),U:this.measurementValue(this.recordU,'V'),I:this.measurementValue(this.recordI,'A'),series:this.recordSeries(),label:`${uLabel} / ${iLabel}`,state:this._solutionState||'unknown',meters:this.components.filter(c=>['ammeter','voltmeter'].includes(c.type)).map(c=>({id:c.id,label:uid(c),unit:c.type==='ammeter'?'A':'V',value:c.measurement||0})),sliders:this.components.filter(c=>c.type==='potentiometer').map(c=>({id:c.id,position:c.position}))};
  const load=this.recordLoad();
  if(load?.experimentRole==='ir-load'){
   const target=load.controlVoltage||2;
   requireValid(record.state==='closed'&&!this.recordU.startsWith('source:')&&Math.abs(Math.abs(record.U)-target)<=target*.01&&Math.abs(Math.abs(load._voltage||0)-target)<=target*.01,'请先调节变阻器，使待测电阻两端电压恢复 '+target+' V（允许1%偏差），再记录。');
   record.loadResistance=load.resistance;
  }
  this.records.push(record);this._currentSeries=record.series;this.scheduleAutosave();return record;
 },
 openRecordsDialog() {
  this.ensureRecordSelections();const options=(unit,key)=>this.measurementOptions(unit).map(o=>`<option value="${escape(o.value)}" ${o.value===this[key]?'selected':''}>${escape(o.label)}</option>`).join('');
  this.showClassroomDialog('records','实验记录与 '+(this.recordLoad()?.experimentRole==='ir-load'?'I-R':this.recordLoad()?'I-U':'U-I')+' 图像',`<p>选定测量对象，调整电源或滑片后记录一次。每次同时保存全部电表读数。</p><div class="classroom-fields"><label>电压 U<select id="record-u">${options('V','recordU')}</select></label><label>电流 I<select id="record-i">${options('A','recordI')}</select></label></div><div class="classroom-actions"><button class="primary" id="take-record">记录当前数据</button><button id="record-remove">删除最后一条</button><button id="record-csv">导出 CSV</button><button id="record-plot-png">导出图像</button><button class="danger" id="record-clear">清空记录</button><button id="record-return">返回电路调节</button></div><p id="record-caption" class="classroom-note"></p><div id="record-table-wrap"><table id="record-table"><thead><tr><th>次数</th><th>测量对象</th><th>U / V</th><th>I / A</th><th>R / Ω</th><th>P / W</th><th>滑片位置</th><th>全部电表读数</th></tr></thead><tbody></tbody></table></div><canvas id="record-plot" width="1000" height="540" aria-label="电压 U 随电流 I 的实验散点图"></canvas><p class="classroom-note">${this.recordLoad()?.experimentRole==='ir-load'?'横轴为 R，纵轴为 I；每次记录前须恢复相同的控制电压。':this.recordLoad()?'横轴为 U，纵轴为 I；保持接线和探究对象不变。':'横轴为 I，纵轴为 U；更换测量对象、接线或负载电阻后作为另一组数据。'}断路数据仍可记录，但不用于推断闭合电路的电阻。</p>`);
  byId('record-u').onchange=e=>{this.recordU=e.target.value;this.renderRecords();this.scheduleAutosave();};byId('record-i').onchange=e=>{this.recordI=e.target.value;this.renderRecords();this.scheduleAutosave();};
  byId('take-record').onclick=()=>{try{this.recordSample();this.renderRecords();}catch(e){this.notify(e.message);}};
  byId('record-remove').onclick=()=>{this.records.pop();this.renderRecords();this.scheduleAutosave();};
  byId('record-clear').onclick=()=>{this.records=[];this.renderRecords();this.scheduleAutosave();};
  byId('record-csv').onclick=()=>{if(!this.records.length)return this.notify('请先记录实验数据。');this.downloadBlob(new Blob(['\ufeff'+this.recordsCSV()],{type:'text/csv;charset=utf-8'}),this.fileName('csv'));};
  byId('record-plot-png').onclick=()=>byId('record-plot').toBlob(blob=>{if(blob)this.downloadBlob(blob,this.fileName('png'));},'image/png');
  byId('record-return').onclick=()=>byId('classroom-dialog').close();this.renderRecords();
 },
 recordsCSV() {
  const quote=x=>'"'+String(x).replace(/"/g,'""')+'"';
  const text=x=>/^[=+\-@\t\r]/.test(String(x))?'\''+x:x;
  return [['次数','时间','测量对象','U (V)','I (A)','电路状态','滑片位置','全部电表读数','R (Ω)','P (W)','接入电阻 (Ω)'],...this.records.map((r,i)=>[i+1,r.time,text(r.label),r.U,r.I,r.state,r.sliders.map(p=>p.id+':'+Math.round(p.position*100)+'%').join(';'),text(r.meters.map(m=>m.label+':'+m.value+' '+m.unit).join(';')),Math.abs(r.I)>1e-12?Math.abs(r.U/r.I):'',r.U*r.I,r.loadResistance??''])].map(row=>row.map(quote).join(',')).join('\r\n');
 },
 renderRecords() {
  if(this._dialogKind!=='records')return;
  const matching=this.records.filter(r=>r.series===this.recordSeries());
  byId('record-caption').textContent=this.predictionHidden?'预测中，记录数据需先揭示结果。':`共 ${this.records.length} 条记录；当前测量组 ${matching.length} 条。`;
  byId('take-record').disabled=this.predictionHidden||!this.recordU||!this.recordI;
  byId('record-table-wrap').hidden=!!this.predictionHidden;byId('record-plot').hidden=!!this.predictionHidden;byId('record-csv').disabled=!!this.predictionHidden;byId('record-plot-png').disabled=!!this.predictionHidden;
  byId('record-table').querySelector('tbody').innerHTML=(this.predictionHidden?[]:this.records).map((r,i)=>`<tr><td>${i+1}</td><td>${escape(r.label)}</td><td>${r.U.toFixed(3)}</td><td>${r.I.toFixed(4)}</td><td>${Math.abs(r.I)>1e-12?Math.abs(r.U/r.I).toFixed(2):'—'}</td><td>${(r.U*r.I).toFixed(3)}</td><td>${escape(r.sliders.map(p=>p.id+': '+Math.round(p.position*100)+'%').join('，')||'—')}</td><td>${escape(r.meters.map(m=>`${m.label}: ${m.value.toFixed(3)} ${m.unit}`).join('，'))}</td></tr>`).join('');
  this.drawRecordPlot(byId('record-plot'),this.predictionHidden?[]:matching);
 },
 drawRecordPlot(canvas,records) {
  const ctx=canvas.getContext('2d'),dark=!!this.darkMode,ink=dark?'#e2e8f0':'#243247',grid=dark?'#42536a':'#dce5ee';
  ctx.fillStyle=dark?'#1e293b':'#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='20px Microsoft YaHei';ctx.fillStyle=ink;ctx.textAlign='center';const load=this.recordLoad(),ir=load?.experimentRole==='ir-load',iu=!!load&&!ir;ctx.fillText(ir?'I-R 实验数据':iu?'I-U 实验数据':'U-I 实验数据',500,32);
  const domain=values=>{let lo=Math.min(0,...values),hi=Math.max(0,...values);if(hi===lo)hi=lo+1;const raw=(hi-lo)/5,p=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].find(n=>n*p>=raw)*p;return {lo:Math.floor(lo/step)*step,hi:Math.ceil(hi/step)*step,step};};
  const xx=r=>ir?r.loadResistance:(iu?r.U:r.I),yy=r=>(ir||iu)?r.I:r.U;
  records=records.filter(r=>Number.isFinite(xx(r))&&Number.isFinite(yy(r)));
  const xs=domain(records.map(xx)),ys=domain(records.map(yy));
  const x=v=>100+(v-xs.lo)/(xs.hi-xs.lo)*820,y=v=>450-(v-ys.lo)/(ys.hi-ys.lo)*370;
  const tick=v=>Math.abs(v)<1e-10?'0':Number(v.toPrecision(4)).toString();
  ctx.lineWidth=1;ctx.strokeStyle=grid;ctx.font='17px Arial';
  for(let v=xs.lo,j=0;v<=xs.hi+xs.step*.1&&j<15;v+=xs.step,j++){ctx.beginPath();ctx.moveTo(x(v),80);ctx.lineTo(x(v),450);ctx.stroke();ctx.textAlign='center';ctx.fillStyle=ink;ctx.fillText(tick(v),x(v),478);}
  for(let v=ys.lo,j=0;v<=ys.hi+ys.step*.1&&j<15;v+=ys.step,j++){ctx.beginPath();ctx.moveTo(100,y(v));ctx.lineTo(920,y(v));ctx.stroke();ctx.textAlign='right';ctx.fillStyle=ink;ctx.fillText(tick(v),88,y(v)+6);}
  ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.strokeRect(100,80,820,370);ctx.textAlign='center';ctx.font='20px Arial';ctx.fillText(ir?'R / Ω':iu?'U / V':'I / A',510,520);ctx.save();ctx.translate(28,265);ctx.rotate(-Math.PI/2);ctx.fillText(ir||iu?'I / A':'U / V',0,0);ctx.restore();
  records.forEach((r,i)=>{ctx.fillStyle=r.state==='open'?'#e29125':'#268be3';ctx.beginPath();ctx.arc(x(xx(r)),y(yy(r)),6,0,Math.PI*2);ctx.fill();ctx.font='14px Arial';ctx.fillText(String(i+1),Math.min(910,x(xx(r))+14),Math.max(95,y(yy(r))-10));});
  if(!records.length){ctx.fillStyle=ink;ctx.font='22px Microsoft YaHei';ctx.fillText('记录数据后，在这里显示散点',510,260);}
 },
 openPredictionDialog() {
  this.showClassroomDialog('prediction','课堂预测',`<p>先写下或口头说明电表读数、灯泡亮度、电流方向的预测，再揭示实验结果。</p><textarea id="prediction-text" maxlength="2000" placeholder="例如：滑片向左移动，接入电阻怎样变化？电流和灯泡亮度会怎样变化？" aria-label="课堂预测内容"></textarea><div class="classroom-actions"><button class="primary" id="hide-results">隐藏结果，开始预测</button><button id="reveal-results">揭示结果</button></div><p class="classroom-note">隐藏数字、实物电表指针、电流箭头、变阻器电流路径及灯泡亮度。元件参数和接线保留，揭示时使用当前参数重新计算。</p>`);
  byId('prediction-text').value=this.predictionText||'';byId('prediction-text').oninput=e=>{this.predictionText=e.target.value;this.scheduleAutosave();};
  byId('hide-results').onclick=()=>{this.predictionText=byId('prediction-text').value;this.predictionHidden=true;this.updatePropertiesPanel();this.recalc();this.renderRecords();byId('classroom-dialog').close();this.notify('预测已开始；点击“揭示结果”查看当前电路的现象。');};
  byId('reveal-results').onclick=()=>{this.predictionHidden=false;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();byId('classroom-dialog').close();};
 },
 currentFault() {const c=this.components.find(c=>c.fault);return c?{kind:c.fault,component:c}:null;},
 faultKinds(c) {return ['resistor','bulb','potentiometer','ammeter','voltmeter','led','motor','bell'].includes(c?.type)?['open','short',...(c.type==='potentiometer'?['upper','lower']:['ammeter','voltmeter'].includes(c.type)?['reverse']:[])]:[];},
 wiringPlan(c,kind) {
  const views=['schematic','real'],plans=new Map();
  for(const view of views){const wires=this.wires.filter(w=>!w.view||w.view==='both'||w.view===view),ports=[...new Set(wires.flatMap(w=>[w.start,w.end].filter(e=>e.compId===c.id).map(e=>e.termId)))].sort();
   if(!ports.length&&view!==this.viewMode)continue;
   requireValid(ports.length===2,'请先在当前视图用两个接线柱完成接线。');
   if(kind==='reverse')requireValid(ports.includes('neg')&&ports.filter(p=>p!=='neg').length===1,'请只连接负接线柱和一个量程接线柱。');
   const dest=kind==='upper'?['c','d']:kind==='lower'?['a','b']:[...ports].reverse();plans.set(view,new Map(ports.map((p,i)=>[p,dest[i]])));
  }return plans;
 },
 faultTargets(kind) {return this.components.filter(c=>this.faultKinds(c).includes(kind)).map(c=>({value:c.id,label:uid(c)}));},
 applyFault(kind,target) {return this.replaceFault(kind,target);},
 restoreFaultState() {
  for(const c of this.components)if(c.fault==='reverse')this.swapMeterConnections(c,true);
  for(const graph of [this,this.schematicReference].filter(Boolean)){
   for(const w of graph.wires){if(w.connectionBackup){const b=w.connectionBackup;w.start=clone(b.start);w.end=clone(b.end);w.bends=clone(b.bends);w.realBends=clone(b.realBends);w.autoSchematic=b.autoSchematic;if(b.editControls)w.editControls=clone(b.editControls);else delete w.editControls;delete w.connectionBackup;delete w._realSmoothCache;delete w._realEditRevision;}delete w.fault;}
   graph.components.forEach(c=>delete c.fault);
  }this.faultHidden=false;this._routeKey=null;
 },
 removeFault(target) {
  if(!this.currentFault()||(target&&this.currentFault().component.id!==target))return;
  this.saveUndo();this.restoreFaultState();this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();
 },
 replaceFault(kind,target) {
  const c=this.components.find(c=>c.id===target);requireValid(this.faultKinds(c).includes(kind),'该元件不支持此故障。');
  if(c.fault===kind)return;
  // Validate against the restored topology before creating an undo entry or mutating state.
  const prior=this.currentFault();let plans;
  if(['reverse','upper','lower'].includes(kind)){
   const wires=clone(this.wires);
   for(const w of wires){if(w.connectionBackup){w.start=clone(w.connectionBackup.start);w.end=clone(w.connectionBackup.end);}if(w.reverseBackup?.start){w.start=clone(w.reverseBackup.start);w.end=clone(w.reverseBackup.end);}else if(w.reverseBackup){const owner=this.components.find(o=>o.id===w.reverseBackup.owner),positive=this.meterActiveTerminal(owner).id;for(const e of [w.start,w.end])if(e.compId===owner.id)e.termId=e.termId==='neg'?positive:e.termId===positive?'neg':e.termId;}}
   plans=this.wiringPlan.call({wires,viewMode:this.viewMode},c,kind);
  }
  this.saveUndo();this.restoreFaultState();const object=this.components.find(o=>o.id===target);
  if(kind==='reverse')this.swapMeterConnections(object,false,plans);
  if(['upper','lower'].includes(kind))for(const graph of [this,this.schematicReference].filter(Boolean))for(const w of graph.wires){const map=plans.get(w.view==='real'?'real':w.view==='schematic'?'schematic':this.viewMode);if(!map||![w.start,w.end].some(e=>e.compId===target))continue;
   w.connectionBackup={owner:target,start:clone(w.start),end:clone(w.end),bends:clone(w.bends||[]),realBends:clone(w.realBends||null),autoSchematic:!!w.autoSchematic,...(w.editControls?{editControls:clone(w.editControls)}:{})};
   for(const e of [w.start,w.end])if(e.compId===target)e.termId=map.get(e.termId)||e.termId;
   w.bends=[];w.realBends=null;w.autoSchematic=true;delete w.editControls;delete w._realSmoothCache;
  }
  object.fault=kind;const ref=this.schematicReference?.components.find(o=>o.id===target);if(ref)ref.fault=kind;
  this.selectedComponent=object;this.faultHidden=false;this._routeKey=null;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();
  if(prior&&prior.component.id!==target)this.notify('已恢复上一元件；当前电路仅保留这一处异常。');
 },
 swapMeterConnections(comp,restore=false,plans=null) {
  const positive=this.meterActiveTerminal(comp).id;
  const swap=w=>{
   if(!restore)w.reverseBackup={owner:comp.id,start:clone(w.start),end:clone(w.end),bends:clone(w.bends||[]),realBends:w.realBends?clone(w.realBends):null,autoSchematic:!!w.autoSchematic,...(w.editControls?{editControls:clone(w.editControls)}:{})};
   const map=plans?.get(w.view==='real'?'real':w.view==='schematic'?'schematic':this.viewMode);
   if(restore&&w.reverseBackup?.start){w.start=clone(w.reverseBackup.start);w.end=clone(w.reverseBackup.end);}
   else for(const end of [w.start,w.end])if(end.compId===comp.id){if(map)end.termId=map.get(end.termId)||end.termId;else if(end.termId==='neg')end.termId=positive;else if(end.termId===positive)end.termId='neg';}
   if(restore&&w.reverseBackup?.owner===comp.id){
    const backup=w.reverseBackup;w.bends=backup.bends;w.realBends=backup.realBends;w.autoSchematic=backup.autoSchematic;
    if(backup.editControls)w.editControls=clone(backup.editControls);else delete w.editControls;
    delete w.reverseBackup;
   }else{w.bends=[];w.realBends=null;w.autoSchematic=true;delete w.editControls;}
   w._realSmoothCache=null;delete w._realEditRevision;
  };
  this.wires.filter(w=>[w.start.compId,w.end.compId].includes(comp.id)).forEach(swap);
  if(this.schematicReference){this.schematicReference.wires.filter(w=>[w.start.compId,w.end.compId].includes(comp.id)).forEach(swap);}
 },
 drawFaultComponent(comp) {
  if(!comp.fault||this.faultHidden||this.predictionHidden)return;
  this.label(comp,{open:'断路',short:'短路',reverse:'正负接反',upper:'同接上接线柱',lower:'同接下接线柱'}[comp.fault],0,this.viewMode==='schematic'?-52:-115,{font:'bold 15px Microsoft YaHei',color:'#e74c3c'});
 },
 drawFaultWire(w,pts) {
  if(w.fault!=='open'||this.faultHidden||this.predictionHidden||!pts.length)return;
  let distance=pts.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-pts[i].x,p.y-pts[i].y),0)/2,middle=pts[0];
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(distance<=length){const t=length?distance/length:0;middle={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};break;}distance-=length;}const ctx=this.ctx;ctx.save();ctx.strokeStyle='#e74c3c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(middle.x-7,middle.y-7);ctx.lineTo(middle.x+7,middle.y+7);ctx.moveTo(middle.x+7,middle.y-7);ctx.lineTo(middle.x-7,middle.y+7);ctx.stroke();ctx.restore();
 },
 refreshClassroom() {
  if(!this._classroomReady)return;
  if(this.faultHidden&&!this.currentFault())this.faultHidden=false;
  const prediction=byId('prediction-banner'),changed=prediction.hidden===!!this.predictionHidden;prediction.hidden=!this.predictionHidden;prediction.textContent=this.predictionText||'请先预测电表读数、灯泡亮度和电流方向，再揭示结果。';
  if(changed){this.resizeCanvas();this.fitView(byId('guide-panel').classList.contains('show')?310:20);}
  const button=byId('prediction-btn');button.textContent=this.predictionHidden?'揭示结果':'课堂预测';button.setAttribute('aria-pressed',String(this.predictionHidden));button.classList.toggle('active',this.predictionHidden);
  if(this.predictionHidden){byId('measurement-results').textContent='测量结果待揭示';byId('circuit-state').textContent='请先预测电路现象，再揭示结果。';}
  else if(this.faultHidden)byId('circuit-state').textContent='故障探究中：请观察灯泡和电表，选择怀疑的元件或导线。';
  if(this.predictionHidden&&this._dialogKind==='records')this.renderRecords();
 }
});
// Keep a stable result state for recording, including open and short circuits.
const report=CircuitSimulator.prototype.reportMeasurements;
CircuitSimulator.prototype.reportMeasurements=function(U,I,R){this._solutionState='closed';this._mainMeasurements={U,I,R};return report.call(this,U,I,R);};
const reportState=CircuitSimulator.prototype.reportState;
CircuitSimulator.prototype.reportState=function(kind,U){this._solutionState=kind;this._mainMeasurements=null;return reportState.call(this,kind,U);};
// Miniature and exported views also use these same drawing methods.
for(const name of ['drawFlow','drawFlowDotsOnPolyline']){const original=CircuitSimulator.prototype[name];CircuitSimulator.prototype[name]=function(...args){if(!this.predictionHidden)return original.apply(this,args);};}
window.addEventListener('DOMContentLoaded',()=>window.sim.initClassroom());
// Export validators for regression tests without starting an application.
CircuitSimulator.validateExperiment=validateExperiment;
})();
