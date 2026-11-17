/* V3.3: all columns visible without horizontal scrolling. Display only. */
'use strict';
(() => {
const H=HP;
H.version='3.3';
const baseTable=H.tableHTML;
// Relative widths retain the user's column priorities without forcing a minimum table width.
H.fitColumnShares=model=>{
 const widths=H.tableWidths(model),count=widths.length;
 if(count===1)return [100];
 const object=Math.max(count>9?16:24,Math.min(count>9?20:36,widths[0]/widths.reduce((a,b)=>a+b,0)*100));
 const rest=widths.slice(1),total=rest.reduce((a,b)=>a+b,0);
 const shares=[object,...rest.map(w=>(100-object)*w/total)];
 shares[shares.length-1]=100-shares.slice(0,-1).reduce((a,b)=>a+b,0);
 return shares;
};
const fitted=model=>{
 let i=0;const shares=H.fitColumnShares(model);
 return baseTable(model)
  .replace('class="table-scroll data-table-scroll"','class="table-scroll data-table-scroll fit-scroll"')
  .replace('aria-label="数据表格，可横向滚动"','aria-label="完整数据表格，所有列自动适应页面"')
  .replace(/style="min-width:[0-9.]+px"/,'style="width:100%;min-width:0"')
  .replace(/<col style="width:[0-9.]+px">/g,()=>`<col style="width:${shares[i++].toFixed(6)}%">`);
};
// Keep every metric, its order, values and click actions when the screen is narrow.
H.fitSubmodels=model=>{
 const groups=[];
 model.columns.slice(1).forEach((column,index)=>{
  const g=column.g||'result',last=groups.at(-1);
  if(last&&last.g===g&&last.indices.length<4)last.indices.push(index+1);
  else groups.push({g,indices:[index+1]});
 });
 return groups.map(({indices})=>({...model,
  columns:[model.columns[0],...indices.map(i=>model.columns[i])],
  rows:model.rows.map(r=>({...r,cells:[r.cells[0],...indices.map(i=>r.cells[i])]}))
 }));
};
H.tableHTML=model=>{
 const wide=fitted(model);
 if(model.columns.length<=8)return `<div class="fit-surface">${wide}</div>`;
 const parts=H.fitSubmodels(model);
 // More than 16 columns stays grouped even on desktop rather than hiding added columns.
 return `<div class="fit-surface fit-adaptive ${model.columns.length>16?'fit-many':''}"><div class="fit-wide">${wide}</div><div class="fit-stacked"><p class="fit-caption">全部指标已展开 · 按分组上下显示</p>${parts.map(m=>`<section class="fit-part">${fitted(m)}</section>`).join('')}</div></div>`;
};
const editDisplay=H.editDisplay;
H.editDisplay=()=>{
 editDisplay();
 const note=document.querySelector('#dialog-body .subtle');
 if(note)note.textContent='网页自动适应页面宽度；这里的列宽用于分配相对宽度，不再产生横向滚动。窄屏按分组上下显示。图片仍导出完整表格，保留清晰字号。';
};
const render=H.render;
H.render=()=>{
 render();
 const badge=document.querySelector('.topbar .pill');
 if(badge)badge.textContent='组织管理版 V3.3';
 const toolbar=document.querySelector('#main .table-toolbar');
 if(H.ui.page==='activity'&&toolbar){
  const actions=toolbar.querySelector('.actions');
  if(actions&&!actions.querySelector('.fit-indicator'))actions.insertAdjacentHTML('afterbegin','<span class="fit-indicator">全列显示</span>');
 }
};
})();
