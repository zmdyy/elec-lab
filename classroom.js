/* Persistence, export, recording, prediction and fault exploration.
   Circuit topology and routing remain owned by CircuitSimulator. */
'use strict';
(() => {
const STORAGE_KEY='elec-lab-experiment-v1';
const MAX_FILE_BYTES=2*1024*1024;
const componentFields=['id','type','x','y','rotation','realX','realY','realRotation','schematicRotation','realFlipX','schematicFlipX','voltage','resistance','ratedCurrent','position','state','range','label','potUpperSide','potContactMode','fault'];
const clone=x=>JSON.parse(JSON.stringify(x));
const byId=id=>document.getElementById(id);
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=(x,min=-1e5,max=1e5)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const requireValid=(test,message)=>{if(!test)throw new Error(message);};
const cleanComponent=c=>Object.fromEntries(componentFields.filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
const cleanWire=w=>({start:clone(w.start),end:clone(w.end),bends:clone(w.bends||[]),realBends:w.realBends?clone(w.realBends):null,view:w.view||'both',autoSchematic:!!w.autoSchematic,...(w.fault?{fault:w.fault}:{}),...(w.reverseBackup?{reverseBackup:clone(w.reverseBackup)}:{})});
const uid=c=>`${c.label||COMPONENT_DEFS[c.type].name} (${c.id})`;
const blankClassroom=()=>({records:[],recordU:null,recordI:null,predictionHidden:false,predictionText:'',faultHidden:false});
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
  for(const k of ['voltage','resistance','ratedCurrent'])if(c[k]!==undefined)requireValid(finite(c[k],0,1e8),'电压、电阻或额定电流无效。');
  if(c.position!==undefined)requireValid(finite(c.position,0,1),'滑片位置应在 0 到 1 之间。');
  if(c.state!==undefined)requireValid(['open','closed'].includes(c.state),'开关状态无效。');
  if(c.range!==undefined)requireValid((c.type==='ammeter'?[.6,3]:[3,15]).includes(c.range),'电表量程无效。');
  if(c.label!==undefined)requireValid(typeof c.label==='string'&&c.label.length<=80,'元件名称过长。');
  for(const k of ['realFlipX','schematicFlipX'])if(c[k]!==undefined)requireValid(typeof c[k]==='boolean','元件朝向无效。');
  if(c.potUpperSide!==undefined)requireValid([-1,1].includes(c.potUpperSide),'变阻器引线位置无效。');
  if(c.potContactMode!==undefined)requireValid(['auto','pinned'].includes(c.potContactMode),'变阻器接线方式无效。');
  if(c.fault!==undefined)requireValid((['resistor','bulb'].includes(c.type)&&['open','short'].includes(c.fault))||(c.type==='ammeter'&&c.fault==='reverse'),'元件故障类型无效。');
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
  let backup;
  if(w.reverseBackup){const b=w.reverseBackup;requireValid(ids.get(b.owner)?.type==='ammeter'&&[w.start.compId,w.end.compId].includes(b.owner)&&typeof b.autoSchematic==='boolean','反接导线备份无效。');backup={owner:b.owner,bends:points(b.bends),realBends:b.realBends===null?null:points(b.realBends),autoSchematic:b.autoSchematic};}
  return {...cleanWire(w),bends:points(w.bends||[]),realBends:w.realBends===null||w.realBends===undefined?null:points(w.realBends),...(backup?{reverseBackup:backup}:{})};
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
  return {U:r.U,I:r.I,series:r.series,label:r.label,time:r.time,state:r.state,meters:clone(r.meters),sliders:clone(r.sliders)};
 });
 for(const k of ['recordU','recordI']){requireValid(raw[k]==null||(typeof raw[k]==='string'&&raw[k].length<40),'测量对象无效。');result[k]=raw[k]??null;}
 for(const k of ['predictionHidden','faultHidden']){requireValid(raw[k]===undefined||typeof raw[k]==='boolean','课堂模式无效。');result[k]=!!raw[k];}
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
 return {...graph,idCounter:input.idCounter??nextId,format:input.format,version:1,viewMode:input.viewMode,camera:{panX:camera.panX,panY:camera.panY,scale:camera.scale},activeExperiment:input.activeExperiment??null,schematicReference:reference,darkMode:input.darkMode,showGrid:input.showGrid,showPotPrinciple:input.showPotPrinciple,classroom:validateClassroom(input.classroom)};
}
Object.assign(CircuitSimulator.prototype, {
 initClassroom() {
  this.restoreClassroom();this._classroomReady=true;
  const bar=document.createElement('div');bar.className='classroom-toolbar';
  bar.innerHTML=`<button class="tool-button" id="experiment-file-btn">保存 / 打开</button><button class="tool-button" id="export-image-btn">导出图片</button><button class="tool-button" id="record-btn">实验记录</button><button class="tool-button" id="prediction-btn" aria-pressed="false">课堂预测</button><button class="tool-button" id="fault-btn">故障探究</button><span id="classroom-status" role="status">自动保存已开启</span>`;
  const main=document.querySelector('.main-content');main.insertBefore(bar,byId('canvas-container'));
  const prediction=document.createElement('div');prediction.id='prediction-banner';prediction.hidden=true;prediction.setAttribute('role','status');main.insertBefore(prediction,byId('canvas-container'));
  const recovery=document.createElement('div');recovery.id='recovery-banner';recovery.hidden=true;main.insertBefore(recovery,byId('canvas-container'));
  const dialog=document.createElement('dialog');dialog.id='classroom-dialog';dialog.setAttribute('aria-labelledby','classroom-dialog-title');dialog.innerHTML='<header><h2 id="classroom-dialog-title"></h2><button class="dialog-close" aria-label="关闭">×</button></header><div class="dialog-body"></div>';document.body.appendChild(dialog);
  dialog.querySelector('.dialog-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>this._dialogKind=null);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  const message=document.createElement('div');message.id='classroom-message';message.hidden=true;message.setAttribute('role','status');document.body.appendChild(message);
  byId('experiment-file-btn').onclick=()=>this.openFileDialog();byId('export-image-btn').onclick=()=>this.openExportDialog();byId('record-btn').onclick=()=>this.openRecordsDialog();byId('prediction-btn').onclick=()=>{if(this.predictionHidden){this.predictionHidden=false;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();}else this.openPredictionDialog();};byId('fault-btn').onclick=()=>this.openFaultDialog();
  try {const saved=localStorage.getItem(STORAGE_KEY);if(saved){const restored=validateExperiment(JSON.parse(saved));this._recoveryData=restored;this._recoveryPending=true;this.renderRecovery();}}catch(_){byId('classroom-status').textContent='上次缓存无法读取，可打开已保存的文件。';}
  document.addEventListener('pointerup',()=>this.scheduleAutosave());
  this.canvas.addEventListener('wheel',()=>this.scheduleAutosave(),{passive:true});
  window.addEventListener('pagehide',()=>this.flushAutosave());
  if(typeof ResizeObserver!=='undefined'){this._canvasObserver=new ResizeObserver(()=>{const box=byId('canvas-container');if(this.canvas.width!==box.clientWidth||this.canvas.height!==box.clientHeight)this.resizeCanvas();});this._canvasObserver.observe(byId('canvas-container'));}
  this.resizeCanvas();this.refreshClassroom();
 },
 classroomSnapshot() {return {records:clone(this.records||[]),recordU:this.recordU??null,recordI:this.recordI??null,predictionHidden:!!this.predictionHidden,predictionText:this.predictionText||'',faultHidden:!!this.faultHidden};},
 restoreClassroom(raw) {Object.assign(this,raw?clone(raw):blankClassroom());this._solutionState='unknown';this._mainMeasurements=null;this._currentSeries=null;},
 experimentData() {
  return {format:'elec-lab-experiment',version:1,savedAt:new Date().toISOString(),idCounter:this.idCounter,components:this.components.map(cleanComponent),wires:this.wires.map(cleanWire),viewMode:this.viewMode,camera:{panX:this.panX,panY:this.panY,scale:this.scale},activeExperiment:this.activeExperiment??null,schematicReference:this.schematicReference?{components:this.schematicReference.components.map(cleanComponent),wires:this.schematicReference.wires.map(cleanWire)}:null,darkMode:!!this.darkMode,showGrid:!!this.showGrid,showPotPrinciple:!!this.showPotPrinciple,classroom:this.classroomSnapshot()};
 },
 importExperiment(input) {
  const data=validateExperiment(input); // Validate completely before changing the current experiment.
  this.saveUndo();this.components=data.components;this.wires=data.wires;
  this.idCounter=data.idCounter;
  this.viewMode=data.viewMode;Object.assign(this,data.camera);this.activeExperiment=data.activeExperiment;this.schematicReference=data.schematicReference;
  this.darkMode=data.darkMode;this.showGrid=data.showGrid;this.showPotPrinciple=data.showPotPrinciple;this.restoreClassroom(data.classroom);
  this._realLayoutSignature=null;this._schematicLayoutSignature=null;this._routeKey=null;this._routes=null;this._flowGeometryKey=null;
  this.selectedComponent=null;this.selectedWire=null;this.dragging=false;this.wireDrawing=false;this.draftWire=null;
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
 fileName(ext) {return '电学实验-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext;},
 openFileDialog() {
  this.showClassroomDialog('file','保存与恢复实验',`<p>保存两个视图的元件位置、接线柱、参数、课堂模式及记录数据。</p><div class="classroom-actions"><button class="primary" id="save-experiment">下载实验文件</button><label><input id="load-experiment" type="file" accept=".json,application/json" aria-label="打开实验文件"></label></div><p class="classroom-note">打开文件会替换当前实验，可用“撤销”恢复。自动保存保存在当前浏览器；跨电脑使用请下载 JSON 文件。</p><p id="file-result" role="status"></p>`);
  byId('save-experiment').onclick=()=>{try{const data=this.experimentData();validateExperiment(data);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});requireValid(blob.size<=MAX_FILE_BYTES,'记录数据过多，请先导出 CSV 并清空记录，再保存实验。');this.downloadBlob(blob,this.fileName('json'));this.flushAutosave();byId('file-result').textContent='实验文件已生成。';}catch(e){byId('file-result').textContent='保存失败：'+e.message;}};
  byId('load-experiment').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{requireValid(f.size<=MAX_FILE_BYTES,'文件过大，最多支持 2 MB。');const data=JSON.parse(await f.text());this.importExperiment(data);byId('classroom-dialog').close();this.notify('已打开实验，原实验可通过“撤销”恢复。');}catch(error){byId('file-result').textContent='打开失败：'+error.message;}finally{e.target.value='';}};
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
 recordSeries() {
  // Voltage and slider position are variables; topology, loads and selected meters define a series.
  return JSON.stringify([this.viewMode,this.recordU,this.recordI,this.components.map(c=>[c.id,c.type,c.resistance,c.fault||null]),this.activeWires().map(w=>[w.start,w.end,w.fault||null])]);
 },
 recordSample() {
  requireValid(!this.predictionHidden,'请先揭示结果，再记录测量数据。');requireValid(this.components.some(c=>c.type==='battery'),'请先接入电源。');requireValid((this.records||[]).length<1000,'记录已达到 1000 条，请先导出并清空。');
  this.ensureRecordSelections();this.solveCircuit();requireValid(['closed','open'].includes(this._solutionState),'当前电路没有可记录的有效结果，请先检查接线。');
  const uLabel=this.measurementOptions('V').find(o=>o.value===this.recordU)?.label,iLabel=this.measurementOptions('A').find(o=>o.value===this.recordI)?.label;
  const record={time:new Date().toISOString(),U:this.measurementValue(this.recordU,'V'),I:this.measurementValue(this.recordI,'A'),series:this.recordSeries(),label:`${uLabel} / ${iLabel}`,state:this._solutionState||'unknown',meters:this.components.filter(c=>['ammeter','voltmeter'].includes(c.type)).map(c=>({id:c.id,label:uid(c),unit:c.type==='ammeter'?'A':'V',value:c.measurement||0})),sliders:this.components.filter(c=>c.type==='potentiometer').map(c=>({id:c.id,position:c.position}))};
  this.records.push(record);this._currentSeries=record.series;this.scheduleAutosave();return record;
 },
 openRecordsDialog() {
  this.ensureRecordSelections();const options=(unit,key)=>this.measurementOptions(unit).map(o=>`<option value="${escape(o.value)}" ${o.value===this[key]?'selected':''}>${escape(o.label)}</option>`).join('');
  this.showClassroomDialog('records','实验记录与 U-I 图像',`<p>选定测量对象，调整电源或滑片后记录一次。每次同时保存全部电表读数。</p><div class="classroom-fields"><label>电压 U<select id="record-u">${options('V','recordU')}</select></label><label>电流 I<select id="record-i">${options('A','recordI')}</select></label></div><div class="classroom-actions"><button class="primary" id="take-record">记录当前数据</button><button id="record-remove">删除最后一条</button><button id="record-csv">导出 CSV</button><button id="record-plot-png">导出图像</button><button class="danger" id="record-clear">清空记录</button><button id="record-return">返回电路调节</button></div><p id="record-caption" class="classroom-note"></p><div id="record-table-wrap"><table id="record-table"><thead><tr><th>次数</th><th>测量对象</th><th>U / V</th><th>I / A</th><th>滑片位置</th><th>全部电表读数</th></tr></thead><tbody></tbody></table></div><canvas id="record-plot" width="1000" height="540" aria-label="电压 U 随电流 I 的实验散点图"></canvas><p class="classroom-note">横轴为 I，纵轴为 U；更换测量对象、接线或负载电阻后作为另一组数据，不混在同一图中。断路数据仍可记录，但不用于推断闭合电路的电阻。</p>`);
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
  return [['次数','时间','测量对象','U (V)','I (A)','电路状态','滑片位置','全部电表读数'],...this.records.map((r,i)=>[i+1,r.time,text(r.label),r.U,r.I,r.state,r.sliders.map(p=>p.id+':'+Math.round(p.position*100)+'%').join(';'),text(r.meters.map(m=>m.label+':'+m.value+' '+m.unit).join(';'))])].map(row=>row.map(quote).join(',')).join('\r\n');
 },
 renderRecords() {
  if(this._dialogKind!=='records')return;
  const matching=this.records.filter(r=>r.series===this.recordSeries());
  byId('record-caption').textContent=this.predictionHidden?'预测中，记录数据需先揭示结果。':`共 ${this.records.length} 条记录；当前测量组 ${matching.length} 条。`;
  byId('take-record').disabled=this.predictionHidden||!this.recordU||!this.recordI;
  byId('record-table-wrap').hidden=!!this.predictionHidden;byId('record-plot').hidden=!!this.predictionHidden;byId('record-csv').disabled=!!this.predictionHidden;byId('record-plot-png').disabled=!!this.predictionHidden;
  byId('record-table').querySelector('tbody').innerHTML=(this.predictionHidden?[]:this.records).map((r,i)=>`<tr><td>${i+1}</td><td>${escape(r.label)}</td><td>${r.U.toFixed(3)}</td><td>${r.I.toFixed(4)}</td><td>${escape(r.sliders.map(p=>p.id+': '+Math.round(p.position*100)+'%').join('，')||'—')}</td><td>${escape(r.meters.map(m=>`${m.label}: ${m.value.toFixed(3)} ${m.unit}`).join('，'))}</td></tr>`).join('');
  this.drawRecordPlot(byId('record-plot'),this.predictionHidden?[]:matching);
 },
 drawRecordPlot(canvas,records) {
  const ctx=canvas.getContext('2d'),dark=!!this.darkMode,ink=dark?'#e2e8f0':'#243247',grid=dark?'#42536a':'#dce5ee';
  ctx.fillStyle=dark?'#1e293b':'#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='20px Microsoft YaHei';ctx.fillStyle=ink;ctx.textAlign='center';ctx.fillText('U-I 实验数据',500,32);
  const domain=values=>{let lo=Math.min(0,...values),hi=Math.max(0,...values);if(hi===lo)hi=lo+1;const raw=(hi-lo)/5,p=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].find(n=>n*p>=raw)*p;return {lo:Math.floor(lo/step)*step,hi:Math.ceil(hi/step)*step,step};};
  const xs=domain(records.map(r=>r.I)),ys=domain(records.map(r=>r.U));
  const x=v=>100+(v-xs.lo)/(xs.hi-xs.lo)*820,y=v=>450-(v-ys.lo)/(ys.hi-ys.lo)*370;
  const tick=v=>Math.abs(v)<1e-10?'0':Number(v.toPrecision(4)).toString();
  ctx.lineWidth=1;ctx.strokeStyle=grid;ctx.font='17px Arial';
  for(let v=xs.lo,j=0;v<=xs.hi+xs.step*.1&&j<15;v+=xs.step,j++){ctx.beginPath();ctx.moveTo(x(v),80);ctx.lineTo(x(v),450);ctx.stroke();ctx.textAlign='center';ctx.fillStyle=ink;ctx.fillText(tick(v),x(v),478);}
  for(let v=ys.lo,j=0;v<=ys.hi+ys.step*.1&&j<15;v+=ys.step,j++){ctx.beginPath();ctx.moveTo(100,y(v));ctx.lineTo(920,y(v));ctx.stroke();ctx.textAlign='right';ctx.fillStyle=ink;ctx.fillText(tick(v),88,y(v)+6);}
  ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.strokeRect(100,80,820,370);ctx.textAlign='center';ctx.font='20px Arial';ctx.fillText('I / A',510,520);ctx.save();ctx.translate(28,265);ctx.rotate(-Math.PI/2);ctx.fillText('U / V',0,0);ctx.restore();
  records.forEach((r,i)=>{ctx.fillStyle=r.state==='open'?'#e29125':'#268be3';ctx.beginPath();ctx.arc(x(r.I),y(r.U),6,0,Math.PI*2);ctx.fill();ctx.font='14px Arial';ctx.fillText(String(i+1),Math.min(910,x(r.I)+14),Math.max(95,y(r.U)-10));});
  if(!records.length){ctx.fillStyle=ink;ctx.font='22px Microsoft YaHei';ctx.fillText('记录数据后，在这里显示散点',510,260);}
 },
 openPredictionDialog() {
  this.showClassroomDialog('prediction','课堂预测',`<p>先写下或口头说明电表读数、灯泡亮度、电流方向的预测，再揭示实验结果。</p><textarea id="prediction-text" maxlength="2000" placeholder="例如：滑片向左移动，接入电阻怎样变化？电流和灯泡亮度会怎样变化？" aria-label="课堂预测内容"></textarea><div class="classroom-actions"><button class="primary" id="hide-results">隐藏结果，开始预测</button><button id="reveal-results">揭示结果</button></div><p class="classroom-note">隐藏数字、实物电表指针、电流箭头、变阻器电流路径及灯泡亮度。元件参数和接线保留，揭示时使用当前参数重新计算。</p>`);
  byId('prediction-text').value=this.predictionText||'';byId('prediction-text').oninput=e=>{this.predictionText=e.target.value;this.scheduleAutosave();};
  byId('hide-results').onclick=()=>{this.predictionText=byId('prediction-text').value;this.predictionHidden=true;this.updatePropertiesPanel();this.recalc();this.renderRecords();byId('classroom-dialog').close();this.notify('预测已开始；点击“揭示结果”查看当前电路的现象。');};
  byId('reveal-results').onclick=()=>{this.predictionHidden=false;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();byId('classroom-dialog').close();};
 },
 currentFault() {const c=this.components.find(c=>c.fault);if(c)return {kind:c.fault,component:c};const w=this.wires.find(w=>w.fault);return w?{kind:w.fault,wire:w}:null;},
 applyFault(kind,target) {
  requireValid(!this.currentFault(),'请先解除当前故障，再设置新的故障。');
  let object;
  if(kind==='wire-open'){object=this.wires[Number(target)];requireValid(object&&this.activeWires().includes(object),'请选择当前视图中的导线。');}
  else {object=this.components.find(c=>c.id===target);requireValid(object&&(kind==='reverse'?object.type==='ammeter':['resistor','bulb'].includes(object.type)),'请选择有效的故障元件。');}
  this.saveUndo();
  if(kind==='wire-open')object.fault='open';
  else if(kind==='reverse'){this.swapMeterConnections(object);object.fault='reverse';}
  else object.fault=kind;
  this.faultHidden=false;this.predictionHidden=false;this._routeKey=null;this.updatePropertiesPanel();this.recalc();
 },
 swapMeterConnections(comp,restore=false) {
  const positive=this.meterActiveTerminal(comp).id;
  const swap=w=>{if(!restore)w.reverseBackup={owner:comp.id,bends:clone(w.bends||[]),realBends:w.realBends?clone(w.realBends):null,autoSchematic:!!w.autoSchematic};for(const end of [w.start,w.end])if(end.compId===comp.id){if(end.termId==='neg')end.termId=positive;else if(end.termId===positive)end.termId='neg';}if(restore&&w.reverseBackup?.owner===comp.id){w.bends=w.reverseBackup.bends;w.realBends=w.reverseBackup.realBends;w.autoSchematic=w.reverseBackup.autoSchematic;delete w.reverseBackup;}else{w.bends=[];w.realBends=null;w.autoSchematic=true;}};
  this.wires.filter(w=>[w.start.compId,w.end.compId].includes(comp.id)).forEach(swap);
  if(this.schematicReference){this.schematicReference.wires.filter(w=>[w.start.compId,w.end.compId].includes(comp.id)).forEach(swap);}
 },
 removeFault() {
  const fault=this.currentFault();if(!fault)return;
  this.saveUndo();if(fault.component?.fault==='reverse')this.swapMeterConnections(fault.component,true);
  this.components.forEach(c=>delete c.fault);this.wires.forEach(w=>delete w.fault);this.faultHidden=false;this._routeKey=null;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();
 },
 openFaultDialog() {
  this.showClassroomDialog('fault','故障探究',`<p>教师先设置一处故障，再开始探究。学生观察测量现象，返回画布选中怀疑的元件或导线，随后判断位置。</p><div class="classroom-fields"><label>故障类型<select id="fault-kind"><option value="open">灯泡 / 电阻内部断路</option><option value="short">灯泡 / 电阻内部短路</option><option value="wire-open">导线断路</option><option value="reverse">电流表反接</option></select></label><label>设置位置<select id="fault-target"></select></label></div><div class="classroom-actions"><button id="fault-apply">设置故障</button><button class="primary" id="fault-start">开始探究，隐藏位置</button><button id="fault-check">判断画布中所选位置</button><button id="fault-reveal">揭示故障</button><button id="fault-remove">解除故障</button><button id="fault-return">返回电路观察</button></div><p id="fault-summary" role="status"></p><p class="classroom-note">断路不改变正常参数；内部短路按零电阻连接处理。电流表反接交换该表两端导线，不移动分流点。解除故障后恢复正常计算。</p>`);
  const fillTargets=()=>{const kind=byId('fault-kind').value,options=kind==='wire-open'?this.activeWires().map(w=>({value:this.wires.indexOf(w),label:`导线 ${this.wires.indexOf(w)+1} · ${w.start.compId}—${w.end.compId}`})):this.components.filter(c=>kind==='reverse'?c.type==='ammeter':['resistor','bulb'].includes(c.type)).map(c=>({value:c.id,label:uid(c)}));byId('fault-target').innerHTML=options.map(o=>`<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('');};
  byId('fault-kind').onchange=fillTargets;fillTargets();
  byId('fault-apply').onclick=()=>{try{this.applyFault(byId('fault-kind').value,byId('fault-target').value);this.renderFaultSummary();}catch(e){this.notify(e.message);}};
  byId('fault-start').onclick=()=>{if(!this.currentFault())return this.notify('请先设置故障。');this.faultHidden=true;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();byId('classroom-dialog').close();this.notify('请观察电表和灯泡，并选中怀疑的元件或导线。');};
  byId('fault-check').onclick=()=>{const f=this.currentFault();byId('fault-summary').textContent=!f?'当前未设置故障。':(f.component===this.selectedComponent&&!!f.component)||(f.wire===this.selectedWire&&!!f.wire)?'判断正确！已找到故障位置。':'尚未找到故障位置，请继续观察或更换所选对象。';};
  byId('fault-reveal').onclick=()=>{this.faultHidden=false;this.updatePropertiesPanel();this.recalc();this.updateMiniSchematicVisibility();this.renderFaultSummary();};
  byId('fault-remove').onclick=()=>{this.removeFault();this.renderFaultSummary();};byId('fault-return').onclick=()=>byId('classroom-dialog').close();this.renderFaultSummary();
 },
 renderFaultSummary() {
  const f=this.currentFault(),kind={open:'断路',short:'短接',reverse:'电流表反接'};
  byId('fault-summary').textContent=!f?'当前未设置故障。':this.faultHidden?'故障位置已隐藏。请在画布选择怀疑的位置。':`${f.component?uid(f.component):'导线 '+(this.wires.indexOf(f.wire)+1)}：${kind[f.kind]}`;
  for(const id of ['fault-kind','fault-target','fault-apply'])byId(id).hidden=!!f&&this.faultHidden;
 },
 drawFaultComponent(comp) {
  if(!comp.fault||this.faultHidden||this.predictionHidden)return;
  this.label(comp,{open:'断路',short:'短接',reverse:'反接'}[comp.fault],0,-115,{font:'bold 15px Microsoft YaHei',color:'#e74c3c'});
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
