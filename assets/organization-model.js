/* Organizational review rules. Public code only; never embed staff or business data. */
'use strict';
(() => {
const H=HP;
H.version='3.1';
H.nav=[['activity','活动量看板'],['focus','重点组和人'],['follow','提升方向及待办'],['import','数据导入']];
H.defaultOrgRules=()=>({version:1,confirmed:true,perfMetric:'actual',perfThreshold:0,perfOperator:'gt',activities:[{id:'view',weight:1},{id:'channel',weight:1}],topPercent:50,tiePolicy:'high',rankScope:'current',method:'percentileMean',basis:'2026-11-17用户确认：有业绩为高、0业绩为低；活动量前50%／后50%。默认活动组合可编辑。'});
H.orgRules=()=>{
 const r=H.data.focusRules;
 if(r?.schema==='org-rank-v1')return r;
 return {...H.defaultOrgRules(),schema:'org-rank-v1'};
};
H.orgLabels={HH:'绩效高 · 活动量高',LH:'绩效低 · 活动量高',HL:'绩效高 · 活动量低',LL:'绩效低 · 活动量低',pending:'待补／待核／待分类'};
H.orgGuides={HH:'核实有效方法，安排标杆采访、分享或更高挑战。',LH:'检查方向、质量和转化卡点，安排具体带教与协同。',HL:'核实历史积累与后续机会，补充持续经营安排。',LL:'优先排查人效风险，及时沟通和支持；核实不适配后提交岗位适配／退出建议。',pending:'先补齐数据与事实，不把缺数据当作低绩效。'};
H.actionTypes=['风险排查','目标牵引','业务赋能','激发与支持','组织标杆分享','阶段答疑','岗位适配／退出建议','其他'];
H.actionStates=['待讨论','已确认安排','执行中','待复查','已改善','继续支持','适配复核','已关闭'];
// Consecutive source periods can be compared; gaps and overlapping sources stay explicit.
H.periodSignature=value=>{
 const rows=value.rows||[];if(!rows.length)return '';
 const kinds=[...new Set(rows.map(f=>f.periodType==='rolling30'?'rolling30':'dated'))];
 if(kinds.length!==1)return 'mixed';
 const spans=[...new Set(rows.map(f=>f.start+'|'+f.end))].map(s=>s.split('|')).sort((a,b)=>a[0].localeCompare(b[0]));
 if(kinds[0]==='rolling30')return 'rolling30:'+spans.map(s=>s.join('/')).join(';');
 const merged=[];
 for(const [a,b]of spans){const last=merged.at(-1);if(last&&new Date(a+'T00:00:00Z').getTime()<=new Date(last[1]+'T00:00:00Z').getTime()+864e5){if(b>last[1])last[1]=b}else merged.push([a,b])}
 return merged.map(s=>s.join('/')).join(';');
};
H.orgPool=(level=H.ui.focusLevel,rule=H.orgRules())=>{
 const root=rule.rankScope==='region'?{level:'region',store:'',group:'',person:'',personId:''}:H.root();
 return H.entities().filter(e=>e.level===level&&H.within(e,root)&&(level!=='person'||(H.ui.role==='all'||H.staff(e).role===H.ui.role))&&(level!=='person'||!H.staff(e).joinDate||H.staff(e).joinDate<=H.ui.end));
};
H.orgVisible=e=>H.within(e,H.root())&&(e.level!=='person'||H.ui.tenure==='all'||H.tenure(H.staff(e)).key===H.ui.tenure);
H.rankActivities=(items,rule)=>{
 const valid=items.filter(x=>!x.activityReason);
 const columns=rule.activities||[];
 for(const x of valid){x.score=0;x.parts=[];let sum=0;for(let j=0;j<columns.length;j++){const n=x.activities[j].n,lower=valid.filter(y=>y.activities[j].n<n).length,equal=valid.filter(y=>y.activities[j].n===n).length,percentile=valid.length===1?50:100*(lower+(equal-1)/2)/(valid.length-1),weight=Number(columns[j].weight)||1;x.parts.push({id:columns[j].id,n,percentile,weight});x.score+=percentile*weight;sum+=weight}x.score=sum?x.score/sum:null}
 const order=valid.slice().sort((a,b)=>b.score-a.score||H.key(a.entity).localeCompare(H.key(b.entity)));
 if(order.length<2){for(const x of order)x.rankReason='可比较对象不足2个，暂不分前后半';return {order,count:order.length,cutScore:null,targetCount:0}}
 const targetCount=Math.max(1,Math.min(order.length,Math.ceil(order.length*rule.topPercent/100))),cutScore=order[targetCount-1].score;
 const allEqual=order.every(x=>Math.abs(x.score-order[0].score)<1e-8);
 for(const x of order){x.rankFirst=1+order.filter(y=>y.score>x.score+1e-8).length;x.rankLast=order.filter(y=>y.score>=x.score-1e-8).length;x.rankCount=order.length;
  if(allEqual){x.rankReason='所有可比较对象活动量同分，无法区分前后半';continue}
  const cross=x.rankFirst<=targetCount&&x.rankLast>targetCount;
  x.boundaryTie=cross;
  if(cross&&rule.tiePolicy==='pending'){x.rankReason='临界同分，按规则待确认';continue}
  x.activityHigh=cross?rule.tiePolicy==='high':x.rankLast<=targetCount;
 }
 return {order,count:order.length,cutScore,targetCount};
};
H.buildOrgAnalysis=(level=H.ui.focusLevel)=>{
 const rule=H.orgRules(),pool=H.orgPool(level,rule),items=pool.map(entity=>{
  const perf=H.value(entity,rule.perfMetric),activities=rule.activities.map(a=>H.value(entity,a.id));
  let activityReason='',performanceReason='';
  if(!activities.length)activityReason='尚未选择活动量指标';
  else if(activities.some(v=>v.n===null||!Number.isFinite(v.n)))activityReason='关键活动量待补／待核';
  else if(activities.some(v=>v.n<0))activityReason='活动量负数待核对';
  else if(activities.some(v=>v.partial))activityReason='活动量范围不完整';
  const signature=activities.length?H.periodSignature(activities[0]):'';
  if(!activityReason&&(signature==='mixed'||activities.some(v=>H.periodSignature(v)!==signature)))activityReason='所选活动量周期不一致';
  if(perf.n===null||!Number.isFinite(perf.n))performanceReason='实际绩效数据待补／待核';
  else if(perf.n<0)performanceReason='负业绩调整待核实，不按0业绩处理';
  else if(perf.partial)performanceReason='绩效范围不完整';
  else if(!activityReason&&H.periodSignature(perf)!==signature)performanceReason='绩效与活动量周期不一致';
  return {entity,performance:perf.n,perf,activities,signature,activityReason,performanceReason,key:'pending'};
 });
 const signatures=[...new Set(items.filter(x=>!x.activityReason).map(x=>x.signature))];
 // No implicit ranking across incompatible time spans, even when a store filter hides them.
 if(signatures.length>1)for(const x of items)if(!x.activityReason)x.activityReason='比较对象的活动量周期不一致，请统一底表周期';
 const rank=H.rankActivities(items,rule);
 for(const x of items){const reasons=[x.performanceReason,x.activityReason,x.rankReason].filter(Boolean);if(reasons.length){x.reason=reasons.join('；');continue}const high=rule.perfOperator==='gte'?x.performance>=rule.perfThreshold:x.performance>rule.perfThreshold;x.key=(high?'H':'L')+(x.activityHigh?'H':'L');x.reason='按规则v'+rule.version+'计算；分类是管理线索，不是人员处置结论'}
 return {rule,items,rank,visible:items.filter(x=>H.orgVisible(x.entity)),scope:rule.rankScope==='region'?'黄浦大区同层级、同岗位范围':H.label(H.root())+'同层级、同岗位范围',periods:signatures};
};
H.focusClass=e=>{const x=H.buildOrgAnalysis(e.level==='group'?'group':'person').items.find(x=>H.key(x.entity)===H.key(e));return x||{key:'pending',reason:'不在当前同层级／同岗位比较范围'};};
H.orgSnapshot=(items,analysis)=>({rule:H.clone(analysis.rule),scope:analysis.scope,selectedStart:H.ui.start,selectedEnd:H.ui.end,periods:H.clone(analysis.periods),createdAt:new Date().toISOString(),objects:items.map(x=>({entity:H.clone(x.entity),quadrant:x.key,performance:x.performance,activityScore:x.score??null,rankFirst:x.rankFirst??null,rankLast:x.rankLast??null,rankCount:x.rankCount??null,reason:x.reason,activities:(x.parts||[]).map(p=>({...p})),sources:[...new Set([...(x.perf?.rows||[]),...x.activities.flatMap(v=>v.rows||[])].map(f=>f.source||'已导入底表'))]}))});
H.orgRuleText=(r=H.orgRules())=>{const m=H.meta(r.perfMetric);return '高绩效：'+m.label+(r.perfOperator==='gt'?' > ':' ≥ ')+r.perfThreshold+(m.unit||'')+'；高活动量：前'+r.topPercent+'%；活动指标：'+r.activities.map(a=>H.meta(a.id).label+'（权重'+a.weight+'）').join('＋')};
})();
