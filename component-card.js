/* Direct operations for a double-clicked component. */
(()=>{
'use strict';
const P=CircuitSimulator.prototype,labels={open:'断路',short:'短路',reverse:'正负接线柱接反',upper:'同接上接线柱',lower:'同接下接线柱'},esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
P.closeComponentCard=function(){this._cardComponentId=null;document.getElementById('component-card')?.remove();};
P.openComponentCard=function(c){if(this.wireDrawing||c.type==='junction')return;this._cardComponentId=c.id;this.renderComponentCard();};
P.renderComponentCard=function(){
 const c=this.components.find(c=>c.id===this._cardComponentId);if(!c)return this.closeComponentCard();
 let el=document.getElementById('component-card');if(!el){el=document.createElement('section');el.id='component-card';el.setAttribute('role','region');el.setAttribute('aria-label','元件操作');document.body.append(el);
 for(const event of ['pointerdown','mousedown','mouseup','dblclick','touchstart','touchend'])el.addEventListener(event,e=>e.stopPropagation());
 el.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){this.closeComponentCard();e.preventDefault();}});
 el.addEventListener('click',e=>{e.stopPropagation();const b=e.target.closest('button');if(!b)return;const id=this._cardComponentId,obj=this.components.find(o=>o.id===id);if(!obj)return this.closeComponentCard();try{
 if(b.dataset.fault)this.replaceFault(b.dataset.fault,id);
 else if(b.dataset.action==='restore')this.removeFault(id);
 else if(b.dataset.action==='close')this.closeComponentCard();
 else if(b.dataset.action==='delete'){this.selectedComponent=obj;this.deleteSelected();}
 else if(b.dataset.action==='more'){this.selectedComponent=obj;this.closeComponentCard();document.body.classList.remove('properties-collapsed');document.getElementById('properties-toggle')?.setAttribute('aria-expanded','true');this.updatePropertiesPanel();this.resizeCanvas();}
 if(this._cardComponentId)this.renderComponentCard();
 }catch(error){this.notify(error.message);}});
 }
 const kinds=this.faultKinds(c),wrong=kinds.filter(k=>!['open','short'].includes(k));let hint='';if(wrong.length)try{this.wiringPlan(c,wrong[0]);}catch(e){hint=e.message;}
 const buttons=ks=>ks.map(k=>`<button data-fault="${k}" ${c.fault===k||(!['open','short'].includes(k)&&hint)?'disabled':''} aria-pressed="${c.fault===k}">${labels[k]}</button>`).join('');
 el.innerHTML=`<div class="card-title"><strong>${esc(c.label||COMPONENT_DEFS[c.type].name||c.id)}</strong><button data-action="close" aria-label="关闭元件卡片">×</button></div>${kinds.length?`<p role="status">当前状态：${labels[c.fault]||'正常'}</p><div class="card-actions">${buttons(kinds.filter(k=>['open','short'].includes(k)))}</div>${wrong.length?`<p>错误接法</p><div class="card-actions">${buttons(wrong)}</div>${hint?`<small>${esc(hint)}</small>`:''}`:''}<button data-action="restore" ${c.fault?'':'disabled'}>恢复正常</button>`:''}<div class="card-footer"><button data-action="more">更多设置</button><button data-action="delete">删除元件</button></div>`;
 const canvas=this.canvas.getBoundingClientRect(),p=this.componentPos(c),scale=this.scale||1,x=canvas.left+this.panX+p.x*scale,y=canvas.top+this.panY+p.y*scale,r=75*this.componentSize(c)*scale;
 const box=el.getBoundingClientRect(),gap=12,w=window.innerWidth,h=window.innerHeight,candidates=[[x+r+gap,y-box.height/2],[x-r-gap-box.width,y-box.height/2],[x-box.width/2,y+r+gap],[x-box.width/2,y-r-gap-box.height]],pos=candidates.find(([a,b])=>a>=8&&b>=8&&a+box.width<=w-8&&b+box.height<=h-8)||candidates[0];
 el.style.left=Math.max(8,Math.min(w-box.width-8,pos[0]))+'px';el.style.top=Math.max(8,Math.min(h-box.height-8,pos[1]))+'px';
};
const update=P.updatePropertiesPanel;P.updatePropertiesPanel=function(...args){const result=update.apply(this,args);if(this._cardComponentId)this.renderComponentCard();return result;};
for(const name of ['setTool','zoom','fitView','rotateSelected','handleWheel','handleContextMenu','undo','deleteSelected','clearAll','importExperiment','toggleViewMode','switchCircuitView','resizeCanvas','showClassroomDialog','loadExperiment']){const original=P[name];if(original)P[name]=function(...args){this.closeComponentCard();return original.apply(this,args);};}
window.addEventListener('resize',()=>window.sim?.closeComponentCard());
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#component-card')&&e.target.tagName!=='CANVAS')window.sim?.closeComponentCard();});
})();
