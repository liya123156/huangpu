/* Four quadrants: annual performance and independently selected activity dates. */
'use strict';
(() => {
const H=HP,E=H.esc,previousRules=H.orgRules,previousSnapshot=H.orgSnapshot;
const validYear=y=>Number.isInteger(Number(y))&&Number(y)>=2000&&Number(y)<=2100;
H.performanceYears=()=>[...new Set(H.data.facts.filter(f=>f.category==='activity'&&f.metric==='actual'&&H.date(f.start)&&H.date(f.end)&&f.start.slice(0,4)===f.end.slice(0,4)).map(f=>Number(f.end.slice(0,4))))].sort((a,b)=>b-a);
H.orgRules=()=>{const r=previousRules();return {...r,performanceMode:'annual',performanceYear:validYear(r.performanceYear)?Number(r.performanceYear):(H.performanceYears()[0]||Number(H.today().slice(0,4)))};};
H.annualPerformanceFacts=(year,metric='actual')=>{
 const start=year+'-01-01',end=year+'-12-31',groups=new Map();
 for(const f of H.data.facts){if(f.category!=='activity'||f.metric!==metric||f.periodType==='rolling30'||!H.date(f.start)||!H.date(f.end)||f.start<start||f.end>end||f.start>f.end)continue;const key=H.key(f);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 const out=[];
 for(const rows of groups.values()){
  const cumulative=rows.filter(f=>f.start===start||f.sourceKind==='performanceAnnual'||f.periodType==='monthToDate');
  const latest=new Map();for(const f of cumulative)if(!latest.has(f.start)||latest.get(f.start)<f.end)latest.set(f.start,f.end);
  const kept=cumulative.filter(f=>f.end===latest.get(f.start));
  for(const f of rows){
   if(cumulative.includes(f)&&!kept.includes(f))continue;
   // A newer cumulative snapshot already includes its contained month records.
   if(kept.some(p=>p!==f&&p.start<=f.start&&p.end>=f.end&&(p.start!==f.start||p.end!==f.end)))continue;
   out.push(f);
  }
 }
 return out;
};
// A source file can mention historical staff or managers. Neither expands the
// current consultant roster against which a consultant-only group is reviewed.
H.orgConsultantMembers=(entity,asOf=H.ui.end)=>{
 const source=H.data.novRoster.length?H.data.novRoster:H.roster(),seen=new Set();
 return source.filter(p=>/顾问/.test(p.role||'')&&!H.isLeader?.(p)&&H.within(p,entity)&&(!p.joinDate||p.joinDate<=asOf)).map(p=>({...p,level:'person'})).filter(p=>{const key=p.personId||H.key(p);if(seen.has(key))return false;seen.add(key);return true;});
};
const providedThrough=rows=>rows.map(f=>f.observedThrough&&f.observedThrough<f.end?f.observedThrough:f.end).sort().at(-1)||'';
const annualMetricValue=(entity,metric,year)=>{
 const range={start:year+'-01-01',end:year+'-12-31',mode:'year'},facts=H.annualPerformanceFacts(year,metric);
 if(entity.level==='person'||facts.some(f=>H.same(f,entity)))return H.calendarValue(entity,metric,'activity',range,{facts,excludeLeaders:true});
 const sourceThrough=providedThrough(facts.filter(f=>H.within(f,entity))),members=H.orgConsultantMembers(entity,sourceThrough||range.end);
 if(!members.length)return {n:null,rows:[],scopePartial:true,reason:'当前顾问名册待补，无法确认店组范围',memberCoverage:{expected:0,present:0,missing:[]}};
 const values=members.map(person=>({person,value:H.calendarValue(person,metric,'activity',range,{facts,excludeLeaders:true})})),rows=values.flatMap(x=>x.value.rows||[]),through=providedThrough(rows);
 const missing=values.filter(x=>{const v=x.value,cutoff=providedThrough(v.rows||[]);return v.n===null||!Number.isFinite(v.n)||!cutoff||cutoff!==through||H.calendarCoverage((v.rows||[]).map(f=>({...f,sourceCoverageOnly:false})),range.start,cutoff,'range').missing.length;}).map(x=>({person:x.person.person,personId:x.person.personId,reason:x.value.n===null?(x.value.reason||'年度数据待补'):'年度统计截止或范围不完整'}));
 const known=values.filter(x=>x.value.n!==null&&Number.isFinite(x.value.n));
 return {n:known.length?known.reduce((sum,x)=>sum+x.value.n,0):null,rows,partial:!!missing.length,scopePartial:!!missing.length,memberCoverage:{expected:members.length,present:members.length-missing.length,missing},reason:!known.length?'年度顾问数据待补／待核':''};
};
H.annualPerformanceValue=(entity,rule=H.orgRules())=>{
 const year=rule.performanceYear,range={start:year+'-01-01',end:year+'-12-31',mode:'year'};
 const actual=annualMetricValue(entity,'actual',year);
 const rows=actual.rows||[],through=rows.map(f=>f.observedThrough&&f.observedThrough<f.end?f.observedThrough:f.end).sort().at(-1)||'';
 let n=actual.n,reason=actual.n===null?(actual.reason||'年度实际绩效数据待补／待核'):'';
 // Year-to-date is intentional; missing months inside the supplied span are not.
 const coverage=through?H.calendarCoverage(rows.map(f=>({...f,sourceCoverageOnly:false})),range.start,through,'range'):null;
 if(n!==null&&coverage?.missing.length)reason='年度绩效存在缺月／缺段，请核对累计范围';
 if(n!==null&&entity.level!=='person'&&actual.scopePartial)reason='店组年度绩效仅部分成员已提供，待补齐；不把缺失成员计为0';
 if(rule.perfMetric==='achieve'){
  const target=annualMetricValue(entity,'target',year);
  const targetThrough=(target.rows||[]).map(f=>f.observedThrough&&f.observedThrough<f.end?f.observedThrough:f.end).sort().at(-1)||'';
  const targetCoverage=targetThrough?H.calendarCoverage(target.rows,range.start,targetThrough,'range'):null;
  if(n===null||target.n===null||target.n<=0){n=null;reason='年度目标或年度实际绩效待补，无法计算目标完成率';}
  else if(targetThrough!==through||!targetCoverage?.complete||target.scopePartial){n=null;reason='年度目标与实际绩效统计截止或范围不一致，暂不计算目标完成率';}
  else n=n/target.n*100;
 }
 return {...actual,n,reason,annual:{year,start:range.start,end:range.end,through,mode:'annual',providedThrough:through,completeYear:through===range.end,derived:entity.level!=='person'&&rows.length>0&&rows.every(f=>f.level==='person'),valid:!!rows.length&&!reason}};
};
H.orgPerformanceWindow=(rule=H.orgRules())=>{
 const root=rule.rankScope==='region'?{level:'region',store:'',group:'',person:'',personId:''}:H.root();
 const rows=H.annualPerformanceFacts(rule.performanceYear).filter(f=>H.within(f,root));
 const through=rows.map(f=>f.observedThrough&&f.observedThrough<f.end?f.observedThrough:f.end).sort().at(-1)||'';
 return {mode:'annual',year:rule.performanceYear,start:rule.performanceYear+'-01-01',end:rule.performanceYear+'-12-31',through,completeYear:through===rule.performanceYear+'-12-31'};
};
H.orgPeriodLabel=a=>{const p=a?.performanceWindow||H.orgPerformanceWindow(),activity=a?.activityWindow||{start:H.ui.start,end:H.ui.end};return `绩效：${p.year}年累计${p.through?'（截至'+p.through+'）':'（数据待补）'}；活动量：${activity.usedStart||activity.start} 至 ${activity.through||activity.end}`;};
const activityPeriodKey=f=>f.start+'|'+f.end+'|'+(f.periodType==='rolling30'?'rolling30':'dated');
const activityCutoff=f=>{
 if(H.date(f.observedThrough))return f.observedThrough<f.end?f.observedThrough:f.end;
 if(f.end<=H.today()&&f.periodComplete!==false)return f.end;
 if(H.date(f.importedOn))return f.importedOn<f.end?f.importedOn:f.end;
 return '';
};
// The comparison window comes from imported source periods, not from whichever
// weeks happened to contain an event for one person. Every ranked person must
// still have an explicit number (including zero) for every selected period.
H.orgActivityContext=rule=>{
 const requested={start:H.ui.start,end:H.ui.end,mode:H.ui.period},root=rule.rankScope==='region'?{level:'region',store:'',group:'',person:'',personId:''}:H.root();
 const source=H.monthlyPreferredFacts?H.monthlyPreferredFacts(H.data.facts):H.data.facts;
 const metrics=rule.activities.map(a=>{const facts=source.filter(f=>f.category==='activity'&&f.metric===a.id&&H.within(f,root)&&H.periodContains(f,requested.start,requested.end,requested.mode)),periods=new Map();for(const f of facts){const key=activityPeriodKey(f);if(!periods.has(key))periods.set(key,[]);periods.get(key).push(f);}return {...a,facts,periods};});
 const periods=[],excluded=[],allPeriods=new Map();for(const metric of metrics)for(const [key,rows]of metric.periods)if(!allPeriods.has(key))allPeriods.set(key,rows);
 for(const [key,rows]of allPeriods){
  const absent=metrics.filter(m=>!m.periods.has(key));if(absent.length){excluded.push({start:rows[0].start,end:rows[0].end,reason:absent.map(m=>H.meta(m.id).label).join('、')+'未提供该周期，未纳入共同窗口'});continue;}
  const cutoffs=metrics.map(m=>[...new Set(m.periods.get(key).map(activityCutoff))]);
  if(cutoffs.some(c=>c.length!==1||!c[0])||new Set(cutoffs.map(c=>c[0])).size!==1){excluded.push({start:rows[0].start,end:rows[0].end,reason:'同一周期来源统计截止不一致／未确认'});continue;}
  const f=rows[0],through=cutoffs[0][0];if(through<f.start){excluded.push({start:f.start,end:f.end,reason:'统计截止早于周期开始'});continue;}
  periods.push({key,start:f.start,end:f.end,through,periodType:f.periodType});
 }
 periods.sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
 const included=new Set(periods.map(p=>p.key)),usedStart=periods[0]?.start||'',usedEnd=periods.at(-1)?.end||'',through=periods.at(-1)?.through||'';
 for(const m of metrics)m.facts=m.facts.filter(f=>included.has(activityPeriodKey(f)));
 return {metrics,requested,window:{mode:requested.mode,start:usedStart||requested.start,end:usedEnd||requested.end,requestedStart:requested.start,requestedEnd:requested.end,usedStart,usedEnd,through,periods:periods.map(p=>({...p})),excluded,coverageMode:'explicit-period-records'},periods};
};
const personActivity=(entity,metric,context)=>{
 const value=H.calendarValue(entity,metric.id,'activity',context.requested,{facts:metric.facts}),rows=value.rows||[],provided=new Set(rows.map(activityPeriodKey));
 const missing=context.periods.filter(p=>!provided.has(p.key));
 let reason='';
 if(!context.periods.length)reason=context.window.excluded.length?'指标周期或来源统计截止不一致，暂无共同已导入周期':'暂无共同已导入周期';
 else if(value.n===null||!Number.isFinite(value.n))reason=value.reason||'未提供数据';
 else if(value.n<0)reason='活动量负数待核对';
 else if(missing.length)reason='缺少'+missing.map(p=>p.start+'至'+p.end).join('、')+'明确记录';
 return {...value,missingPeriods:missing.map(p=>({start:p.start,end:p.end,through:p.through})),comparisonReason:reason,comparable:!reason};
};
const entityActivity=(entity,metric,context)=>{
 if(entity.level==='person')return personActivity(entity,metric,context);
 const members=H.orgConsultantMembers(entity),values=members.map(person=>({person,value:personActivity(person,metric,context)}));
 const missing=values.filter(x=>!x.value.comparable).map(x=>({person:x.person.person,personId:x.person.personId,reason:x.value.comparisonReason})),known=values.filter(x=>x.value.n!==null&&Number.isFinite(x.value.n)),rows=known.flatMap(x=>x.value.rows||[]);
 let n=known.length?known.reduce((sum,x)=>sum+x.value.n,0):null,reason=members.length?(missing.length?'顾问记录未齐：'+missing.map(x=>x.person+'（'+x.reason+'）').join('；'):''):'当前顾问名册待补，无法确认店组范围';
 if(H.meta(metric.id).kind==='rate'||H.meta(metric.id).unit==='%'){
  const usable=rows.length&&rows.every(f=>Number.isFinite(f.numerator)&&Number.isFinite(f.denominator)&&f.denominator>=0),denominator=usable?rows.reduce((sum,f)=>sum+f.denominator,0):0;
  n=usable&&denominator>0?rows.reduce((sum,f)=>sum+f.numerator,0)/denominator*100:null;
  if(n===null&&!reason)reason='缺少对应分子或分母，不能平均成员比例';
 }
 return {n,rows,partial:!!reason,comparisonReason:reason,comparable:!reason,memberCoverage:{expected:members.length,present:members.length-missing.length,missing}};
};
H.buildOrgAnalysis=(level=H.ui.focusLevel)=>H.withCalendarCache(()=>{
 const configuredRule=H.orgRules(),pool=H.orgPool(level,configuredRule),performanceWindow=H.orgPerformanceWindow(configuredRule),performances=new Map(pool.map(entity=>[H.key(entity),H.annualPerformanceValue(entity,configuredRule)]));
 const analyze=rule=>{
  const context=H.orgActivityContext(rule),activityWindow=context.window,signature=context.periods.map(p=>p.start+'/'+p.end+'@'+p.through).join(';');
  const items=pool.map(entity=>{
   const perf=performances.get(H.key(entity)),activities=context.metrics.map(m=>entityActivity(entity,m,context));let activityReason='',performanceReason='';
   if(!activities.length)activityReason='尚未选择活动量指标';
   else activityReason=activities.map((v,i)=>v.comparisonReason?H.meta(rule.activities[i].id).label+'：'+v.comparisonReason:'').filter(Boolean).join('；');
   if(perf.n===null||!Number.isFinite(perf.n))performanceReason=perf.reason||'年度实际绩效数据待补／待核';
   else if(perf.n<0)performanceReason='负业绩调整待核实，不按0业绩处理';
   else if(!perf.annual.valid)performanceReason=perf.reason||'年度绩效范围待核';
   else if(perf.annual.through!==performanceWindow.through)performanceReason='年度绩效截止日期不一致，请补齐同一截止期';
   const memberCoverage=entity.level==='person'?undefined:{expected:activities[0]?.memberCoverage?.expected||0,present:activities.length?Math.min(...activities.map(v=>v.memberCoverage?.present||0)):0,missing:activities.flatMap(v=>v.memberCoverage?.missing||[])};
   return {entity,performance:perf.n,perf,activities,signature,activityReason,performanceReason,memberCoverage,key:'pending'};
  });
  const rank=H.rankActivities(items,rule);
  for(const x of items){const reasons=[x.performanceReason,x.activityReason,x.rankReason].filter(Boolean);if(reasons.length){x.reason=reasons.join('；');continue;}const high=rule.perfOperator==='gte'?x.performance>=rule.perfThreshold:x.performance>rule.perfThreshold;x.key=(high?'H':'L')+(x.activityHigh?'H':'L');x.reason='按规则v'+rule.version+'计算：年度累计绩效 × 共同已导入周期活动量';}
  return {rule,items,rank,visible:items.filter(x=>H.orgVisible(x.entity)),scope:rule.rankScope==='region'?'黄浦大区同层级、同岗位范围':H.label(H.root())+'同层级、同岗位范围',periods:signature?[signature]:[],performanceWindow,activityWindow};
 };
 const configured=analyze(configuredRule),alreadyView=configuredRule.activities.length===1&&configuredRule.activities[0].id==='view';
 const preview=alreadyView?configured:analyze({...configuredRule,activities:[{id:'view',weight:1}]}),previewAvailable=preview.rank.order.some(x=>x.activityHigh===true)&&preview.rank.order.some(x=>x.activityHigh===false),mode=H.ui.orgActivityMode||'auto';
 const basisPreview=!alreadyView&&(mode==='view'||(mode!=='configured'&&configured.rank.count<2&&previewAvailable)),result=basisPreview?preview:configured;
 const labels=configuredRule.activities.map(a=>H.meta(a.id).label).join('＋'),periods=result.activityWindow.periods;
 const omitted=result.activityWindow.excluded.map(p=>p.start+'至'+p.end+'（'+p.reason+'）').join('；');
 const activitySummary=periods.length?`按共同已导入的${periods.length}个周期比较：${periods.map(p=>p.start+'至'+p.end).join('、')}，统计截至${result.activityWindow.through}；每名参与排名的顾问均有这些周期的明确数值，0保留，缺记录不补0。${omitted?'未纳入比较：'+omitted+'。':''}`:'尚无可用于比较的共同已导入周期。'+(omitted?'未纳入比较：'+omitted+'。':'');
 const previewReason=!basisPreview?'':mode==='view'?`本次手动按带看量预览；原组合（${labels}）及其评选规则未修改。`:`原组合（${labels}）${configured.rank.count<2?'的完整周期记录不足':'暂时无法区分活动量高低'}，当前先按带看量预览；原评选规则未修改。`;
 return {...result,configuredRule,basisPreview,previewAvailable,activityMode:basisPreview?'view':'configured',previewReason,activitySummary,configuredComparableCount:configured.rank.count};
});
H.orgSnapshot=(items,analysis)=>{
 const snapshot=previousSnapshot(items,analysis);snapshot.performanceWindow=H.clone(analysis.performanceWindow);snapshot.activityWindow=H.clone(analysis.activityWindow);
 snapshot.configuredRule=H.clone(analysis.configuredRule||analysis.rule);snapshot.basisPreview=!!analysis.basisPreview;snapshot.activityMode=analysis.activityMode||'configured';snapshot.activitySummary=analysis.activitySummary||'';
 snapshot.objects.forEach((x,i)=>{x.performanceWindow=H.clone(items[i].perf.annual);});return snapshot;
};
H.orgSnapshotPeriodText=s=>s.performanceWindow?H.orgPeriodLabel({performanceWindow:s.performanceWindow,activityWindow:s.activityWindow||{start:s.selectedStart,end:s.selectedEnd}}):`${s.selectedStart||''}—${s.selectedEnd||''}`;
const years=r=>[...new Set([r.performanceYear,...H.performanceYears()])].sort((a,b)=>b-a);
H.orgPerformanceYearField=r=>`<label class="field">绩效年份<select id="org-performance-year">${years(r).map(y=>`<option value="${y}" ${y===r.performanceYear?'selected':''}>${y}年累计</option>`).join('')}</select><small>绩效固定看所选全年累计；活动量仍跟随页面日期。</small></label>`;
H.readOrgPerformanceRule=()=>{const year=Number(document.getElementById('org-performance-year')?.value||H.orgRules().performanceYear);if(!validYear(year)){H.toast('请填写有效绩效年份');return null;}return {performanceMode:'annual',performanceYear:year};};
H.orgAnnualControls=a=>`<label class="field" style="max-width:260px;margin:12px 0">绩效年份<select aria-label="四象限绩效年份" onchange="HP.changePerformanceYear(this.value)">${years(a.rule).map(y=>`<option value="${y}" ${y===a.rule.performanceYear?'selected':''}>${y}年累计</option>`).join('')}</select></label><p class="subtle">${H.ui.focusLevel==='group'?'店组绩效按当前名册中、业绩截止时已入职的顾问累计，不与经理、店总管理口径相加。':'年度累计绩效按实际已提供截止期展示，未提供全年后续月份时不补0。'}</p>`;
H.changePerformanceYear=async year=>{
 if(!validYear(year))return;const before=H.clone(H.orgRules()),next=H.clone(H.data);next.focusRules={...before,performanceMode:'annual',performanceYear:Number(year),version:(before.version||0)+1,updatedAt:new Date().toISOString()};
 next.history.push({id:H.id(),type:'classification-rule-change',at:next.focusRules.updatedAt,before,after:H.clone(next.focusRules)});
 if(await H.changeDataSafely(next)){H.render();H.toast('绩效年份已更新；活动量日期保持不变');}
};
H.orgEntityPerformanceHTML=(x,a)=>x?`<p><b>${E(a.rule.performanceYear)}年累计绩效：${H.fmt(x.performance,a.rule.perfMetric==='achieve')}${a.rule.perfMetric==='achieve'?'':' '+E(H.meta('actual').unit||'')}</b></p><p class="subtle">${E(H.orgPeriodLabel(a))}${x.perf.annual.derived?'；按已提供顾问名单汇总':''}</p>`:'';
})();
