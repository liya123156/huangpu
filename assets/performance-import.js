/* Cumulative performance reports. No personnel or business values are embedded. */
'use strict';
(() => {
const H=HP,E=H.esc,previousPrepare=H.prepare,previousNormalize=H.normalize,previousReview=H.review;
const text=v=>String(v??'').trim();
const present=v=>v!==undefined&&v!==null&&text(v)!=='';
const headerIndex=rows=>rows.findIndex(r=>r.some(v=>text(v)==='姓名')&&r.some(v=>/^(员工编号|员工编码|工号)$/.test(text(v)))&&r.some(v=>/^年度业绩/.test(text(v))));
const sourceRow=(q,i)=>q.rowNumbers?.[i]||i+1;
const emptyResult=()=>({facts:[],roster:[],flows:[],channels:[],issues:[],errors:[],check:{},rowCount:0});
const roleName=role=>role==='店经理'?'经理':role;
const roles=['顾问','店经理','店总'];
H.performancePeriod=rows=>{
 const title=rows.slice(0,12).flat().map(text).find(t=>/业绩统计/.test(t)&&/\d{4}年/.test(t))||'';
 const m=title.match(/(\d{4})年\s*(\d{1,2})\s*[-—–~～至]\s*(\d{1,2})月/);
 if(!m)return null;
 const y=Number(m[1]),first=Number(m[2]),last=Number(m[3]);
 if(first<1||last>12||first>last)return null;
 const start=H.date(`${y}-${first}-01`),end=new Date(Date.UTC(y,last,0)).toISOString().slice(0,10);
 if(!start)return null;
 return {start,end,title,label:`${y}年${first}—${last}月累计`};
};
H.prepare=(sheet,file,hash)=>{
 const q=previousPrepare(sheet,file,hash),header=headerIndex(sheet.rows);
 if(header<0||!sheet.rows.some(r=>r.some(v=>/年度业绩统计|层级业绩统计/.test(text(v))))&&!/层级业绩统计/.test(sheet.name||''))return q;
 const period=H.performancePeriod(sheet.rows),field=sheet.rows[header].find(v=>/^年度业绩/.test(text(v))),unit=/万元/.test(field)?'万元':/元/.test(field)?'元':'';
 Object.assign(q,{kind:'performanceAnnual',kindLabel:'分角色累计业绩',annual:true,performance:true,category:'activity',header,rowNumbers:sheet.rowNumbers||q.rowNumbers,periodType:'range',periodVerified:!!period,start:period?.start||'',end:period?.end||'',performanceUnit:unit,performanceMultiplier:unit==='元'?0.0001:unit==='万元'?1:null,periodSummary:period?.label||'统计起止待核对',importNote:'顾问业绩进入个人看板；经理和店总按原表管理口径单独保留。累计金额不拆成月度或周度，未提供业绩目标。'});
 q.signature=JSON.stringify(['performanceAnnual',sheet.rows[header]]);
 return q;
};
H.performanceExtract=q=>{
 const rows=[],errors=[];let role='',columns=null;
 for(let i=0;i<q.rows.length;i++){
  const r=q.rows[i]||[],first=text(r.find(present));
  if(/^[一二三四五六七八九十\d]+[、.．]/.test(first)){
   if(/店总/.test(first))role='店总';else if(/经理/.test(first))role='店经理';else if(/顾问/.test(first))role='顾问';
   columns=null;continue;
  }
  if(r.some(v=>text(v)==='姓名')&&r.some(v=>/^年度业绩/.test(text(v)))){
   columns={person:r.findIndex(v=>text(v)==='姓名'),personId:r.findIndex(v=>/^(员工编号|员工编码|工号)$/.test(text(v))),store:r.findIndex(v=>text(v)==='门店'),group:r.findIndex(v=>text(v)==='店组'),amount:r.findIndex(v=>/^年度业绩/.test(text(v)))};
   continue;
  }
  if(!columns||!r.some(present))continue;
  const person=text(r[columns.person]),personId=text(r[columns.personId]);
  if(!person&&!personId)continue;
  if(/^(合计|总计|Total)$/i.test(person)||/^(合计|总计|Total)$/i.test(text(r[0])))continue;
  const row=sourceRow(q,i);
  if(!role){errors.push(`第${row}行未识别顾问、经理或店总分段，请核对原表。`);continue}
  if(!person||!personId){errors.push(`第${row}行缺少姓名或员工编号，不能确定业绩归属。`);continue}
  const amount=H.num(r[columns.amount]);
  if(amount!==null&&!Number.isFinite(amount)){errors.push(`第${row}行业绩数值无效或公式未缓存。`);continue}
  rows.push({person,personId,store:text(r[columns.store]),group:text(r[columns.group]),role,row,rawAmount:amount,value:amount===null?null:amount*q.performanceMultiplier,sourceField:text(q.rows[i-1]?.[columns.amount])||'年度业绩',amountColumn:columns.amount});
 }
 return {rows,errors};
};
H.normalize=q=>{
 if(q.kind!=='performanceAnnual')return previousNormalize(q);
 const out=emptyResult();
 if(!q.periodVerified||!H.date(q.start)||!H.date(q.end)||q.start>q.end){out.errors.push('未能确认原表累计统计起止，不能拆月或猜测年份。');return out}
 if(!Number.isFinite(q.performanceMultiplier)||q.performanceMultiplier<=0){out.errors.push('原表业绩金额单位不明确，请补充元或万元。');return out}
 const parsed=H.performanceExtract(q);out.errors.push(...parsed.errors);
 const base={category:'activity',metric:'actual',start:q.start,end:q.end,periodType:'range',periodLabel:q.periodSummary,periodComplete:q.end<=H.today(),observedThrough:q.end<H.today()?q.end:H.today(),importedOn:H.today(),source:q.file+' / '+q.sheet,sourceFile:q.file,sourceSheet:q.sheet,sourceHash:q.hash,sourceKind:'performanceAnnual',sourceUnit:q.performanceUnit,unit:'万元'};
 const seen=new Map();
 for(const r of parsed.rows){
  const key=r.role+'|'+r.personId,p=seen.get(key);
  if(p){if(p.value!==r.value||p.store!==r.store||p.group!==r.group)out.errors.push(`第${r.row}行 ${r.person} 同一累计期业绩存在冲突。`);continue}
  seen.set(key,r);out.rowCount++;
  const sourceField=(q.rows[q.header]||[])[r.amountColumn]||'年度业绩';
  const record={...base,...r,sourceField,level:'person'};delete record.amountColumn;
  if(r.value===null){out.issues.push({...record,type:'missing-performance',detail:'原表业绩为空，保留待补，不按0业绩处理'});continue}
  if(r.role!=='顾问'){
   out.issues.push({...record,type:'management-performance',detail:'原表管理口径业绩，未与顾问层相加'});
   continue;
  }
  const e=H.entityFor(r.store,r.group,r.person,out.errors,r.row,r.personId);
  if(e)out.facts.push({...e,...record,role:'顾问',level:'person'});
 }
 out.check={period:q.periodSummary,unit:'万元',roles:Object.fromEntries(roles.map(role=>{const rr=[...seen.values()].filter(r=>r.role===role),known=rr.filter(r=>r.value!==null);return [role,{rows:rr.length,known:known.length,missing:rr.length-known.length,total:known.length?known.reduce((s,r)=>s+r.value,0):null}]})),note:'各角色口径单独保存，不把经理、店总与顾问金额合并；无单月、单周和目标数据。'};
 return out;
};
const money=value=>value===null||!Number.isFinite(value)?'待补':Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6});
const roleTable=(rows,role)=>{
 const selected=rows.filter(r=>r.role===role),known=selected.filter(r=>Number.isFinite(r.value)),sum=known.length?known.reduce((s,r)=>s+r.value,0):null,missing=selected.length-known.length;
 if(!selected.length)return '';
 return `<details class="panel performance-role"><summary><b>${E(roleName(role))} · ${selected.length}人</b><span style="margin-left:16px">${missing?'已知金额':'原表金额'} ${E(money(sum))} 万元${missing?` · ${missing}人待补／待核`:''}</span></summary><div class="table-scroll" style="margin-top:14px"><table style="width:100%;min-width:0;table-layout:fixed"><thead><tr><th style="width:18%">姓名</th><th style="width:36%">门店／店组</th><th style="width:24%">累计业绩（万元）</th><th style="width:22%">记录口径</th></tr></thead><tbody>${selected.map(r=>`<tr><td style="white-space:normal;overflow-wrap:anywhere">${E(r.person)}<small style="display:block">${E(r.personId)}</small></td><td style="white-space:normal;overflow-wrap:anywhere">${E(r.group||r.store||'原表未填写门店')}<small style="display:block">源表第${E(r.row)}行</small></td><td style="white-space:normal;overflow-wrap:anywhere">${E(money(r.value))}</td><td style="white-space:normal;overflow-wrap:anywhere">${r.conflict?'多个来源不一致，待核':role==='顾问'?'顾问个人业绩':'管理者汇总口径，待核'}</td></tr>`).join('')}</tbody></table></div></details>`;
};
H.review=id=>{
 const q=H.ui.queue.find(x=>x.id===id);if(q?.kind!=='performanceAnnual')return previousReview(id);
 const result=H.normalize(q),rows=[...result.facts,...result.issues].sort((a,b)=>a.row-b.row);
 H.modal('核对业绩底表',`<p>${E(q.file)} / ${E(q.sheet)}</p><div class="notice"><b>${E(q.periodSummary)}</b>（${E(q.start)} 至 ${E(q.end)}）。原表${E(q.performanceUnit||'单位待核')}已换算为万元。只导入有表头的业绩列；无表头的校核公式不重复计算。</div><p>${E(q.importNote)}</p>${result.errors.length?`<div class="notice warn">${result.errors.map(E).join('<br>')}</div>`:''}${roles.map(role=>roleTable(rows,role)).join('')}<label class="flex" style="margin-top:18px"><input id="import-confirmed" type="checkbox">已核对累计期间与分角色口径。</label><div id="import-validation"></div>`,`<button class="btn" onclick="HP.close()">取消</button><button class="btn primary" onclick="HP.validateQ('${E(id)}')">核对并保存</button>`);
};
H.performanceSummaryHTML=()=>{
 const source=[...H.data.facts.filter(f=>f.sourceKind==='performanceAnnual'&&f.metric==='actual'),...(H.data.novUnassigned||[]).filter(f=>f.sourceKind==='performanceAnnual'&&['management-performance','missing-performance'].includes(f.type))].filter(r=>(!H.ui.store||r.store===H.ui.store)&&(!H.ui.group||r.group===H.ui.group));
 if(!source.length)return '';
 const unique=new Map();
 for(const r of source){
  const key=[r.start,r.end,r.role,r.personId||r.person].join('|'),old=unique.get(key);
  if(!old)unique.set(key,{...r});
  else if(old.value!==r.value||old.store!==r.store||old.group!==r.group){old.value=null;old.conflict=true}
 }
 const periods=new Map();for(const r of unique.values()){const key=r.start+'|'+r.end;if(!periods.has(key))periods.set(key,[]);periods.get(key).push(r)}
 return `<section class="panel performance-summary" aria-label="原表分层业绩"><h2>累计业绩（原表分层）</h2><p class="subtle">下方按原表累计期展示，跟随门店、店组筛选。只有顾问层接入个人实际业绩；经理、店总金额单独保留。无月度、周度拆分，也不把各层金额相加。</p>${[...periods.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([period,rows])=>`<h3>${E(rows[0].periodLabel||period.replace('|',' 至 '))} <span class="pill">原表${rows.length}人</span></h3><p class="subtle">${E(rows[0].start)} 至 ${E(rows[0].end)} · 金额单位：万元</p>${roles.map(role=>roleTable(rows,role)).join('')}`).join('')}</section>`;
};
})();
