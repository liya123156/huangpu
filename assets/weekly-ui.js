/* Review whole workbooks once, then use the same dates in every calendar view. */
'use strict';
(() => {
const H=HP,E=H.esc,T=H.token;
const button=(label,action,cls='')=>`<button class="btn ${cls}" onclick="${action}">${label}</button>`;
const option=(value,label,current)=>`<option value="${E(value)}" ${value===current?'selected':''}>${E(label)}</option>`;
H.qTitle=q=>q.kindLabel||H.annualKinds[q.kind]||q.importPurpose||'已核对数据';
H.annualPreview=(q,r)=>{
 const rows=r.facts.filter(f=>f.level==='person'),totals=new Map();
 for(const f of rows){if(H.meta(f.metric).kind==='rate'||f.numerator!==undefined)continue;totals.set(f.metric,(totals.get(f.metric)||0)+f.value);}
 const defs=id=>H.annualMetricDefs.find(m=>m.id===id)||H.meta(id);
 return `<div class="notice"><b>${E(q.periodSummary||q.start+'—'+q.end)}</b><br>${E(q.importNote||'')}</div><div class="import-metrics">${[...totals].map(([id,n])=>`<span><b>${H.fmt(n)}</b> ${E(defs(id).label)}</span>`).join('')}${r.check.datePending?`<span><b>${H.fmt(r.check.view)}</b> 带看（统计日期待补）</span>`:''}</div><p class="subtle">${r.rowCount||0}行记录；${r.facts.length}项分层指标（含店组、门店汇总，展示时不重复叠加）。${r.check.outsideRegion?` 另有${r.check.outsideRegion}行其他大区数据，未纳入。`:''}${r.check.outsideStore?` ${r.check.outsideStore}行其他门店记录已保留待核。`:''}${r.check.duplicates?` ${r.check.duplicates}项重复记录只计一次。`:''}</p>${r.errors.length?`<div class="notice warn">${r.errors.slice(0,15).map(E).join('<br>')}</div>`:''}`;
};
const priorReview=H.review;
H.review=id=>{
 const q=H.ui.queue.find(q=>q.id===id);if(!q)return;
 if(!H.annualKinds[q.kind]&&q.kind!=='verifiedPackage')return priorReview(id);
 const r=H.normalize(q),undated=q.kind==='undatedViewing';
 H.modal('核对底表｜'+H.qTitle(q),`<p>${E(q.file)} / ${E(q.sheet)}</p>${H.annualPreview(q,r)}${q.kind==='verifiedPackage'?'':`<div class="fields">${undated?`<label class="field">统计开始<input id="annual-start" type="date" value="${E(q.start)}"></label><label class="field">统计结束<input id="annual-end" type="date" value="${E(q.end)}"></label><p class="subtle field wide">不知道日期可留空，先保存待补记录；不会计入周、月或年。</p>`:`<label class="field">数据已导出至<input id="annual-observed" type="date" value="${E(q.observedThrough)}"></label>`}<label class="field">门店范围<select id="annual-scope">${option('current','当前黄浦四店',q.includeOtherStores?'all':'current')}${option('all','包含源表其他店组',q.includeOtherStores?'all':'current')}</select></label></div>`}<label class="flex"><input id="import-confirmed" type="checkbox">已核对字段、统计周期与范围。</label><div id="import-validation"></div>`,button('取消','HP.close()')+button('核对并保存',`HP.saveAnnualReview('${id}')`,'primary'));
};
H.saveAnnualReview=id=>{
 const q=H.ui.queue.find(q=>q.id===id);if(!q)return;
 if(!document.getElementById('import-confirmed').checked){H.toast('请勾选核对字段、日期与范围');return;}
 if(q.kind!=='verifiedPackage'){
  q.includeOtherStores=document.getElementById('annual-scope').value==='all';
  if(q.kind==='undatedViewing'){q.start=document.getElementById('annual-start').value;q.end=document.getElementById('annual-end').value;q.periodVerified=!!H.annualPeriod(q);q.periodSummary=q.periodVerified?q.start+'—'+q.end:'统计日期待补，先保存原始记录';}
  else q.observedThrough=document.getElementById('annual-observed').value||H.today();
 }
 const r=H.normalize(q);if(r.errors.length){document.getElementById('import-validation').innerHTML='<div class="notice warn">'+r.errors.slice(0,15).map(E).join('<br>')+'</div>';return;}
 q.result=r;q.status='ready';H.close();H.render();
};
H.autoReviewAll=()=>{
 H.refreshPendingRoster();let count=0;const errors=[];
 for(const q of H.ui.queue.filter(q=>q.annual&&q.status!=='imported'&&q.status!=='error')){
  const r=H.normalize(q);if(r.errors.length){q.status='pending';q.error=r.errors.slice(0,3).join('；');errors.push(q.sheet);continue;}
  q.error='';q.result=r;q.status='ready';count++;
 }
 H.render();H.toast(`已核对${count}张子表${errors.length?'；'+errors.join('、')+'仍需核对':''}，确认入表后统一更新`);
};
const renderImport=H.renderImport;
H.renderImport=()=>{
 let html=renderImport();
 const at=html.indexOf('<section class="panel queue-panel">');
 if(at>=0){const end=html.indexOf('</section>',at)+10;html=html.slice(0,at)+H.workbookQueueHTML()+html.slice(end);}
 const message=H.ui.reading?`<div class="notice" id="read-progress" role="status">${E(H.ui.readProgress||'正在读取文件…')}</div>`:'';
 return html.replace('<section class="dropzone"',message+'<section class="dropzone"').replace('可同时选择多个Excel / CSV；图片可以上传或粘贴，当前仅预览，不会自动识别。','支持一个Excel含多个子表、全年周数据；识别周／月字段后自动累计。图片当前仅预览。').replace('<span>顾问</span>','<span>顾问（含历史记录）</span>');
};
H.workbookQueueHTML=()=>`<section class="panel queue-panel"><div class="flex between"><div><h3>本次文件队列</h3><p class="subtle">各子表分别识别；日期缺失的记录先保存待补。</p></div><div class="actions">${H.ui.queue.some(q=>q.annual&&q.status!=='imported')?button('一键核对已识别子表','HP.autoReviewAll()'):''}<button class="btn primary" onclick="HP.commitImports()" ${H.ui.queue.some(q=>q.status==='ready')?'':'disabled'}>确认入表</button></div></div><div class="filelist">${H.ui.queue.map(q=>`<div class="file-card"><div class="flex between"><div><b>${E(q.sheet||q.file)}</b><p class="subtle">${E(q.file)} · ${E(({pending:'待核对',ready:'已核对，待入表',imported:'已入表',error:'读取失败'})[q.status]||q.status)}</p></div><div class="actions">${q.rows||q.verifiedResult?button('查看与核对',`HP.review('${q.id}')`,'small'):''}${button('移出队列',`HP.removeQ('${q.id}')`,'small')}</div></div>${q.annual?`<p>${E(q.periodSummary||'')}<br><small>${E(q.importNote||'')}</small></p>`:''}${q.result?`<p class="import-status">${q.result.rowCount||0}行已处理${q.result.check?.datePending?' · 已保存为日期待补，不参与月／年计算':''}${q.result.check?.outsideRegion?' · 排除其他大区'+q.result.check.outsideRegion+'行':''}${q.result.check?.outsideStore?' · 其他店组'+q.result.check.outsideStore+'行待核':''}</p>`:''}${q.error?`<p class="warn">${E(q.error)}</p>`:''}</div>`).join('')}</div><p class="subtle">同一对象、同一指标、同一周重复上传只保留一份。移出队列不删除已入表数据。</p></section>`;
H.setCalendar=(mode,anchor)=>{
 const date=H.date(anchor)||(mode==='month'&&/^\d{4}-\d{2}$/.test(anchor)?anchor+'-01':mode==='year'&&/^\d{4}$/.test(anchor)?anchor+'-01-01':H.date(H.ui.start)||H.today());
 const d=new Date(date+'T00:00:00Z');H.ui.period=mode;
 if(mode==='month'){H.ui.start=date.slice(0,7)+'-01';H.ui.end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);}
 else if(mode==='year'){H.ui.start=d.getUTCFullYear()+'-01-01';H.ui.end=d.getUTCFullYear()+'-12-31';}
 else if(mode==='week'){H.ui.start=H.addDays(date,-((d.getUTCDay()+6)%7));H.ui.end=H.addDays(H.ui.start,6);}
 H.render();
};
H.period=mode=>{if(['week','month','year'].includes(mode))H.setCalendar(mode,H.ui.start);else{H.ui.period=mode;H.render();}};
H.shiftCalendar=step=>{const d=new Date(H.ui.start+'T00:00:00Z');if(H.ui.period==='year')d.setUTCFullYear(d.getUTCFullYear()+step);else if(H.ui.period==='month')d.setUTCMonth(d.getUTCMonth()+step);else d.setUTCDate(d.getUTCDate()+7*step);H.setCalendar(H.ui.period,d.toISOString().slice(0,10));};
H.changeWeekMonth=async value=>{const d=H.clone(H.data);d.calendarSettings={weekMonth:value==='end'?'end':'start'};if(await H.changeDataSafely(d))H.render();};
H.filterHTML=()=>{
 const mode=H.ui.period,stores=H.entities().filter(e=>e.level==='store'),groups=H.entities().filter(e=>e.level==='group'&&(!H.ui.store||e.store===H.ui.store));
 const calendar=['week','month','year'].includes(mode);
 return `<section class="panel filters calendar-filters"><div class="seg">${[['batch','原始周期'],['week','周度'],['month','月度'],['year','年度'],['range','自选日期']].map(([v,l])=>`<button class="${mode===v?'active':''}" onclick="HP.period('${v}')">${l}</button>`).join('')}</div><div class="calendar-control">${calendar?button('‹','HP.shiftCalendar(-1)','small')+`<label>${mode==='year'?'年份':mode==='month'?'月份':'选择周'} <input type="${mode==='year'?'number':mode==='month'?'month':'date'}" aria-label="看板${mode==='year'?'年份':mode==='month'?'月份':'周日期'}" ${mode==='year'?'min="2000" max="2100"':''} value="${mode==='year'?H.ui.start.slice(0,4):mode==='month'?H.ui.start.slice(0,7):H.ui.start}" onchange="HP.setCalendar('${mode}',this.value)"></label>`+button('›','HP.shiftCalendar(1)','small'):`<label>开始 <input type="date" aria-label="统计开始" value="${H.ui.start}" onchange="HP.setDate('start',this.value)"></label><label>结束 <input type="date" aria-label="统计结束" value="${H.ui.end}" onchange="HP.setDate('end',this.value)"></label>`}</div><label>门店 <select aria-label="门店" onchange="HP.filter('store',this.value)"><option value="">黄浦大区 · 全部门店</option>${stores.map(e=>option(e.store,e.store,H.ui.store)).join('')}</select></label><label>店组 <select aria-label="店组" onchange="HP.filter('group',this.value)"><option value="">全部店组</option>${groups.map(e=>option(e.group,e.group,H.ui.group)).join('')}</select></label>${H.data.facts.some(f=>f.periodType==='weekly')?`<label class="week-rule">跨月周归属 <select aria-label="跨月周归属" onchange="HP.changeWeekMonth(this.value)">${option('start','周开始日所在月',H.weekMonth())}${option('end','周结束日所在月',H.weekMonth())}</select></label><p class="calendar-caption">${E(H.ui.start)} 至 ${E(H.ui.end)} · ${E(H.calendarRuleText())}</p>`:''}</section>`;
};
const metricPeriod=H.metricPeriod;
H.metricPeriod=id=>{
 const rows=H.data.facts.filter(f=>f.metric===id&&f.category==='activity'&&H.within(f,H.root())&&H.dateIn(f));
 const weekly=rows.filter(f=>f.periodType==='weekly'),monthly=rows.filter(f=>f.periodType==='monthly');
 if(weekly.length){const dates=[...new Set(weekly.map(f=>f.start))].sort();return `${dates.length}个周标 · ${dates[0]}—${dates.at(-1)}${weekly.some(f=>f.periodComplete===false)?' · 当周已导入':''}`;}
 if(monthly.length){const dates=[...new Set(monthly.map(f=>f.start.slice(0,7)))].sort();return `${dates.length}个月份 · ${dates[0]}—${dates.at(-1)}${monthly.some(f=>f.periodComplete===false)?' · 当月已导入':''}`;}
 return metricPeriod(id);
};
const activityModel=H.activityModel;
H.activityModel=()=>{
 const m=activityModel();m.notes=m.notes.filter(n=>!n.includes('近30天快照不按11月'));
 m.notes.splice(1,0,H.calendarRuleText(),'周、月、年均累计已提供记录；* 表示缺周、来源人员未齐或当前周／月尚未结束。');
 if(H.data.facts.some(f=>f.sourceKind==='performanceAnnual'))m.notes.push('本次累计业绩为原表顾问名单金额之和，非官方门店／店组总业绩；管理者口径在下方单独展示。');
 return m;
};
H.undatedHTML=()=>{
 const rows=(H.data.novUnassigned||[]).filter(r=>r.type==='undated-activity'&&H.within(r,H.root()));
 if(!rows.length)return '';
 return `<section class="panel undated-summary"><div class="flex between"><div><h3>待补统计日期的带看</h3><p><b>${H.fmt(rows.reduce((s,r)=>s+r.value,0))}</b> 次 · ${rows.length}条人员记录。已保存原数，尚未计入周／月／年。</p></div>${button('补充统计日期','HP.editUndatedPeriod()')}</div><details><summary>查看这部分原始记录</summary><div class="table-scroll"><table><thead><tr><th>姓名</th><th>店组</th><th>带看量</th><th>源表行</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${E(r.person)}</td><td>${E(r.group)}</td><td>${H.fmt(r.value)}</td><td>${E(r.row)}</td></tr>`).join('')}</tbody></table></div></details></section>`;
};
H.editUndatedPeriod=()=>{
 const rows=H.data.novUnassigned.filter(r=>r.type==='undated-activity'&&H.within(r,H.root()));H.pendingUndated=rows;
 H.modal('补充带看统计日期',`<p>${rows.length}条记录，带看合计${H.fmt(rows.reduce((s,r)=>s+r.value,0))}次。</p><div class="fields"><label class="field">统计开始<input type="date" id="undated-start"></label><label class="field">统计结束<input type="date" id="undated-end"></label></div><p class="subtle">请按源系统导出条件填写；整段累计不会拆成单月或单周。</p>`,button('取消','HP.close()')+button('保存日期并更新看板','HP.saveUndatedPeriod()','primary'));
};
H.saveUndatedPeriod=async()=>{
 const start=document.getElementById('undated-start').value,end=document.getElementById('undated-end').value;
 if(!H.date(start)||!H.date(end)||start>end){H.toast('请填写有效统计起止');return;}
 const rows=H.pendingUndated||[],d=H.clone(H.data),newFacts=rows.map(r=>{const f={...r,category:'activity',metric:'view',start,end,periodType:'range',periodLabel:start+'—'+end+'（补充确认）'};delete f.type;delete f.detail;return f;});
 const map=new Map(d.facts.map(f=>[H.factKey(f),f]));
 if(newFacts.some(f=>map.has(H.factKey(f))&&map.get(H.factKey(f)).value!==f.value)){H.toast('同周期已有不同带看值，请先核对已有来源');return;}
 for(const f of newFacts)map.set(H.factKey(f),f);d.facts=[...map.values()];
 const ids=new Set(rows.map(r=>JSON.stringify([r.sourceFile,r.sourceSheet,r.row])));d.novUnassigned=d.novUnassigned.filter(r=>r.type!=='undated-activity'||!ids.has(JSON.stringify([r.sourceFile,r.sourceSheet,r.row])));
 d.history.push({id:H.id(),type:'period-confirmed',start,end,rows:rows.length,at:new Date().toISOString()});
 if(await H.changeDataSafely(d)){H.pendingUndated=null;H.close();H.render();H.toast('日期已保存，符合所选周期时自动计入');}
};
const activity=H.renderActivity;
H.renderActivity=()=>{
 let html=activity().replace('仅纳入完整落在当前日期范围内的汇总记录，不拆分或估算。','按所选周／月／年累计；跨月周使用下方归属规则，原表月度与累计值不拆分。');
 const extra=(H.performanceSummaryHTML?.()||'')+H.undatedHTML();
 const at=html.indexOf('<section id="activity-leaderboard"');return at>=0?html.slice(0,at)+extra+html.slice(at):html+extra;
};
const render=H.render;
H.render=()=>{render();const badge=document.querySelector('.topbar .pill');if(badge)badge.textContent='组织管理版 V3.4';};
// A reload must keep the last imported calendar month complete, rather than cut
// weekly/monthly totals at today's date through the legacy initial batch range.
const init=H.init;
H.init=async()=>{
 await init();
 const dates=H.data.facts.filter(f=>f.category==='activity'&&['weekly','monthly'].includes(f.periodType)&&H.date(f.start)&&H.date(f.end)&&f.start<=f.end).map(f=>f.periodType==='weekly'&&H.weekMonth()==='end'?f.end:f.start).sort();
 if(!dates.length)return;
 const anchor=dates.at(-1);
 H.ui.leaderboard={...(H.ui.leaderboard||{}),mode:'month',anchor,level:H.ui.leaderboard?.level||'both',role:H.ui.leaderboard?.role||'顾问',metrics:H.ui.leaderboard?.metrics||null};
 H.setCalendar('month',anchor);
};
})();
