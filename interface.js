/* Compact controls and selection actions. Keep the original button nodes so their
   handlers and state continue to be shared by keyboard, menus and properties. */
'use strict';
(() => {
const byId=id=>document.getElementById(id);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const originalPanel=CircuitSimulator.prototype.updatePropertiesPanel;
CircuitSimulator.prototype.updatePropertiesPanel=function(){
 // Detach shared controls before replacing the property HTML.
 const controls=['rotate-btn','delete-btn','pot-principle-toggle'].map(byId).filter(Boolean);
 controls.forEach(el=>el.remove());
 originalPanel.call(this);
 const props=byId('component-properties'),c=this.selectedComponent;
 if(c){
  const names=document.createElement('div');names.className='component-naming';
  names.innerHTML=`<div class="property-control"><label for="p-name">元件名称${c.labelMode==='auto'?' · 自动':''}</label><input id="p-name" maxlength="80" value="${escape(c.label)}"></div><button class="tool-button" id="restore-auto-name">恢复自动命名</button>`;
  props.prepend(names);
  byId('p-name').onchange=e=>{
   const name=e.target.value.trim();this.saveUndo();
   c.labelMode=name?'custom':'auto';if(name)c.label=name;
   this.recalc();this.updatePropertiesPanel();
  };
  byId('restore-auto-name').onclick=()=>{this.saveUndo();c.labelMode='auto';this.recalc();this.updatePropertiesPanel();};
 }
 const actions=document.createElement('div');actions.className='selection-actions';
 for(const el of controls){
  const visible=el.id==='pot-principle-toggle'?c?.type==='potentiometer':el.id==='rotate-btn'?!!c:!!(c||this.selectedWire);
  el.hidden=!visible;actions.appendChild(el);
 }
 props.appendChild(actions);
};
// Recovery is a one-time decision, never a third toolbar row.
CircuitSimulator.prototype.renderRecovery=function(){
 const d=document.createElement('dialog');d.id='recovery-dialog';
 const date=new Date(this._recoveryData.savedAt),time=Number.isNaN(+date)?'':date.toLocaleString('zh-CN',{hour12:false});
 d.setAttribute('aria-labelledby','recovery-title');
 d.innerHTML=`<h2 id="recovery-title">恢复上次实验</h2><p>发现自动保存的实验${time?'（'+escape(time)+'）':''}。</p><div class="recovery-actions"><button class="tool-button" id="recover-last">恢复上次实验</button><button class="tool-button" id="discard-last">使用当前实验</button></div>`;
 document.body.appendChild(d);byId('recovery-banner').hidden=true;
 const discard=()=>{this._recoveryPending=false;this._recoveryData=null;d.close();d.remove();this.flushAutosave();};
 byId('discard-last').onclick=discard;
 byId('recover-last').onclick=()=>{try{this.importExperiment(this._recoveryData);d.close();d.remove();this.notify('已恢复上次实验。');}catch(e){this.notify(e.message);}};
 d.addEventListener('cancel',e=>{e.preventDefault();discard();});
 byId('classroom-status').textContent='上次实验等待恢复';d.showModal();
};
window.addEventListener('DOMContentLoaded',()=>{
 const sim=window.sim,bar=document.querySelector('.toolbar'),secondary=document.querySelector('.classroom-toolbar');
 const top=document.createElement('div');top.className='control-row primary-controls';
 const bottom=document.createElement('div');bottom.className='control-row secondary-controls';
 // Portal dropdowns into body so scrolling toolbars cannot clip them.
 const menus=[];
 const closeMenus=except=>menus.forEach(({button,menu})=>{if(menu!==except){menu.classList.remove('show');button.setAttribute('aria-expanded','false');}});
 const position=(button,menu)=>{
  const r=button.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=(r.bottom+5)+'px';menu.style.maxHeight=Math.max(80,innerHeight-r.bottom-16)+'px';
 };
 function menuButton(id,text,items,existing){
  const button=existing?byId(id):document.createElement('button');
  button.id=id;button.className='tool-button';button.textContent=text;
  button.setAttribute('aria-haspopup','true');button.setAttribute('aria-expanded','false');
  const menu=existing?byId('exp-menu'):document.createElement('div');
  menu.id=existing?'exp-menu':id+'-menu';menu.classList.add('control-menu');
  if(!existing)menu.classList.add('menu-dropdown');
  button.setAttribute('aria-controls',menu.id);document.body.appendChild(menu);
  for(const item of items||[]){const el=byId(item);if(el)menu.appendChild(el);}
  if(existing)for(const el of menu.querySelectorAll('button')){el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});}
  button.addEventListener('click',e=>{
   e.stopPropagation();
   // The experiment button has its original toggle listener already attached.
   if(!existing)menu.classList.toggle('show');
   const open=menu.classList.contains('show');closeMenus(menu);button.setAttribute('aria-expanded',String(open));
   if(open)position(button,menu);
  });
  menu.addEventListener('click',e=>{if(e.target.closest('button,[role="button"]')){menu.classList.remove('show');button.setAttribute('aria-expanded','false');}});
  menus.push({button,menu});return button;
 }
 const experiment=menuButton('exp-menu-btn','实验 ▾',[],true);
 const arrange=menuButton('arrange-menu-btn','整理 ▾',['arrange-real','arrange-schematic']);
 const file=menuButton('file-menu-btn','文件 ▾',['import-experiment-btn','experiment-file-btn','export-image-btn','clear-all']);
 const teaching=menuButton('teaching-menu-btn','课堂 ▾',['prediction-btn','fault-btn','bell-sound']);
 const display=menuButton('display-menu-btn','显示 ▾',['theme-toggle','toggle-grid','zoom-in','zoom-out','input-mode-btn']);
 byId('fit-view').textContent='完整显示';byId('properties-toggle').textContent='属性';
 byId('export-image-btn').textContent='导出 PNG';
 top.append(experiment,byId('select-tool'),byId('wire-tool'),byId('undo-btn'),byId('view-toggle'),arrange,byId('fit-view'),byId('fullscreen-toggle'));
 bottom.append(file,byId('meter-zoom-btn'),byId('record-btn'),teaching,display,byId('library-toggle'),byId('properties-toggle'),byId('classroom-status'));
 const feedback=byId('fullscreen-feedback'),status=byId('simulation-status');
 status.classList.add('canvas-status');byId('canvas-container').append(status,feedback);
 sim.updatePropertiesPanel(); // Move selection controls out before replacing the old bar.
 bar.replaceChildren(top,bottom);bar.classList.add('compact-toolbar');secondary.remove();
 document.addEventListener('click',()=>closeMenus());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const active=menus.find(({menu})=>menu.classList.contains('show'));closeMenus();active?.button.focus();}});
 for(const row of [top,bottom])row.addEventListener('scroll',()=>closeMenus(),{passive:true});
 window.addEventListener('resize',()=>closeMenus());
 sim.updatePropertiesPanel();sim.resizeCanvas();
});
})();
