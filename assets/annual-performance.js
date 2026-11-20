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
H.annualPerformanceValue=(entity,rule=H.orgRules())=>{
 const year=rule.performanceYear,range={start:year+'-01-01',end:year+'-12-31',mode:'year'};
 const actual=H.calendarValue(entity,'actual','activity',range,{facts:H.annualPerformanceFacts(year,'actual'),excludeLeaders:true});
 const rows=actual.rows||[],through=rows.map(f=>f.observedThrough&&f.observedThrough<f.end?f.observedThrough:f.end).sort().at(-1)||'';
 let n=actual.n,reason=actual.n===null?(actual.reason||'年度实际绩效数据待补／待核'):'';
 // Year-to-date is intentional; missing months inside the supplied span are not.
 const coverage=through?H.calendarCoverage(rows.map(f=>({...f,sourceCoverageOnly:false})),range.start,through,'range'):null;
 if(n!==null&&coverage?.missing.length)reason='年度绩效存在缺月／缺段，请核对累计范围';
 if(n!==null&&entity.level!=='person'&&actual.scopePartial)reason='店组年度绩效仅部分成员已提供，待补齐；不把缺失成员计为0';
 if(rule.perfMetric==='achieve'){
  const target=H.calendarValue(entity,'target','activity',range,{facts:H.annualPerformanceFacts(year,'target'),excludeLeaders:true});
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
H.orgPeriodLabel=a=>{const p=a?.performanceWindow||H.orgPerformanceWindow();const activity=a?.activityWindow||{start:H.ui.start,end:H.ui.end};return `绩效：${p.year}年累计${p.through?'（截至'+p.through+'）':'（数据待补）'}；活动量：${activity.start} 至 ${activity.end}`;};
H.buildOrgAnalysis=(level=H.ui.focusLevel)=>H.withCalendarCache(()=>{
 const rule=H.orgRules(),pool=H.orgPool(level,rule),performanceWindow=H.orgPerformanceWindow(rule),activityWindow={mode:H.ui.period,start:H.ui.start,end:H.ui.end};
 const items=pool.map(entity=>{
  const perf=H.annualPerformanceValue(entity,rule),activities=rule.activities.map(a=>H.value(entity,a.id));let activityReason='',performanceReason='';
  if(!activities.length)activityReason='尚未选择活动量指标';
  else if(activities.some(v=>v.n===null||!Number.isFinite(v.n)))activityReason='关键活动量待补／待核';
  else if(activities.some(v=>v.n<0))activityReason='活动量负数待核对';
  else if(activities.some(v=>v.partial))activityReason='活动量范围不完整';
  const signature=activities.length?H.periodSignature(activities[0]):'';
  if(!activityReason&&(signature==='mixed'||activities.some(v=>H.periodSignature(v)!==signature)))activityReason='所选活动量周期不一致';
  if(perf.n===null||!Number.isFinite(perf.n))performanceReason=perf.reason||'年度实际绩效数据待补／待核';
  else if(perf.n<0)performanceReason='负业绩调整待核实，不按0业绩处理';
  else if(!perf.annual.valid)performanceReason=perf.reason||'年度绩效范围待核';
  else if(perf.annual.through!==performanceWindow.through)performanceReason='年度绩效截止日期不一致，请补齐同一截止期';
  return {entity,performance:perf.n,perf,activities,signature,activityReason,performanceReason,key:'pending'};
 });
 const signatures=[...new Set(items.filter(x=>!x.activityReason).map(x=>x.signature))];
 if(signatures.length>1)for(const x of items)if(!x.activityReason)x.activityReason='比较对象的活动量周期不一致，请统一底表周期';
 const rank=H.rankActivities(items,rule);
 for(const x of items){const reasons=[x.performanceReason,x.activityReason,x.rankReason].filter(Boolean);if(reasons.length){x.reason=reasons.join('；');continue;}const high=rule.perfOperator==='gte'?x.performance>=rule.perfThreshold:x.performance>rule.perfThreshold;x.key=(high?'H':'L')+(x.activityHigh?'H':'L');x.reason='按规则v'+rule.version+'计算：年度累计绩效 × 所选周期活动量';}
 return {rule,items,rank,visible:items.filter(x=>H.orgVisible(x.entity)),scope:rule.rankScope==='region'?'黄浦大区同层级、同岗位范围':H.label(H.root())+'同层级、同岗位范围',periods:signatures,performanceWindow,activityWindow};
});
H.orgSnapshot=(items,analysis)=>{
 const snapshot=previousSnapshot(items,analysis);snapshot.performanceWindow=H.clone(analysis.performanceWindow);snapshot.activityWindow=H.clone(analysis.activityWindow);
 snapshot.objects.forEach((x,i)=>{x.performanceWindow=H.clone(items[i].perf.annual);});return snapshot;
};
H.orgSnapshotPeriodText=s=>s.performanceWindow?H.orgPeriodLabel({performanceWindow:s.performanceWindow,activityWindow:s.activityWindow||{start:s.selectedStart,end:s.selectedEnd}}):`${s.selectedStart||''}—${s.selectedEnd||''}`;
const years=r=>[...new Set([r.performanceYear,...H.performanceYears()])].sort((a,b)=>b-a);
H.orgPerformanceYearField=r=>`<label class="field">绩效年份<select id="org-performance-year">${years(r).map(y=>`<option value="${y}" ${y===r.performanceYear?'selected':''}>${y}年累计</option>`).join('')}</select><small>绩效固定看所选全年累计；活动量仍跟随页面日期。</small></label>`;
H.readOrgPerformanceRule=()=>{const year=Number(document.getElementById('org-performance-year')?.value||H.orgRules().performanceYear);if(!validYear(year)){H.toast('请填写有效绩效年份');return null;}return {performanceMode:'annual',performanceYear:year};};
H.orgAnnualControls=a=>`<label class="field" style="max-width:260px;margin:12px 0">绩效年份<select aria-label="四象限绩效年份" onchange="HP.changePerformanceYear(this.value)">${years(a.rule).map(y=>`<option value="${y}" ${y===a.rule.performanceYear?'selected':''}>${y}年累计</option>`).join('')}</select></label><p class="subtle">${H.ui.focusLevel==='group'?'店组绩效按已提供的顾问名单累计，不与经理、店总管理口径相加。':'年度累计绩效按实际已提供截止期展示，未提供全年后续月份时不补0。'}</p>`;
H.changePerformanceYear=async year=>{
 if(!validYear(year))return;const before=H.clone(H.orgRules()),next=H.clone(H.data);next.focusRules={...before,performanceMode:'annual',performanceYear:Number(year),version:(before.version||0)+1,updatedAt:new Date().toISOString()};
 next.history.push({id:H.id(),type:'classification-rule-change',at:next.focusRules.updatedAt,before,after:H.clone(next.focusRules)});
 if(await H.changeDataSafely(next)){H.render();H.toast('绩效年份已更新；活动量日期保持不变');}
};
H.orgEntityPerformanceHTML=(x,a)=>x?`<p><b>${E(a.rule.performanceYear)}年累计绩效：${H.fmt(x.performance,a.rule.perfMetric==='achieve')}${a.rule.perfMetric==='achieve'?'':' '+E(H.meta('actual').unit||'')}</b></p><p class="subtle">${E(H.orgPeriodLabel(a))}${x.perf.annual.derived?'；按已提供顾问名单汇总':''}</p>`:'';
})();
