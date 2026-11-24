/* Monthly activity presentation and consultant rankings. No embedded business data. */
'use strict';
(() => {
const H=HP,DAY=864e5,EPS=1e-9;
const columns=[
 {key:'house',metric:'newhouse',label:'新增买卖房源',unit:'原表量'},
 {key:'owner',metric:'ownermeet',label:'业主面见',unit:'原表量'},
 {key:'hmall',metric:'hmallassist',label:'hmall陪带次数',unit:'次'},
 {key:'channel',metric:'channel',label:'重点渠道新增',unit:'原表量'},
 {key:'entered',metric:'channelMonthEntered',label:'重点渠道当月进入带看',unit:'原表量'},
 {key:'rate',metric:'channelMonthRate',label:'重点渠道进入带看率',unit:'%'},
 {key:'view',metric:'view',label:'买卖带看次数',unit:'次'}
];
H.monthlyColumns=columns.map(c=>({...c}));
const keys=columns.map(c=>c.key),metricKey=new Map(columns.filter(c=>c.key!=='rate').map(c=>[c.metric,c.key]));
metricKey.set('channelWeekEntered','entered');
const validMonth=x=>/^\d{4}-\d{2}$/.test(String(x||''))&&!!H.date(x+'-01');
const monthStart=m=>m+'-01',monthEnd=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
const unique=values=>[...new Set(values)];
// Current-person display is an explicit roster decision. Historical facts never
// create a new current employee, and hiding a row never deletes its contribution.
H.monthlyIsCurrentStaff=(r,asOf=H.today())=>{
 if(!r)return false;
 if(['active','isActive','employed','isEmployed'].some(k=>r[k]===false)||['departed','isDeparted','terminated','isTerminated','resigned','isResigned'].some(k=>r[k]===true))return false;
 const fields=['employmentStatus','employmentState','employeeStatus','staffStatus','workStatus','relationshipStatus','status','用工关系状态','员工状态','在职状态','用工状态'];
 if(fields.some(k=>/^(离职|離職|已离职|已離職|正式离职|离职员工|离职人员|已办理离职|已离任|已?解除劳动关系|已?终止劳动关系|未入职|inactive|terminated|resigned|departed|former|left|not employed)$/i.test(String(r[k]||'').trim())))return false;
 if(['exitDate','departureDate','terminationDate','resignationDate','employmentEndDate','离职日期','离职时间'].some(k=>H.date(r[k])&&H.date(r[k])<=asOf))return false;
 return !H.date(r.joinDate)||H.date(r.joinDate)<=asOf;
};
H.monthlyIsCurrentConsultant=r=>H.monthlyIsCurrentStaff(r)&&r.role==='顾问';
const normalizeOrder=order=>unique([...(Array.isArray(order)?order:[]).filter(k=>keys.includes(k)),...keys]);
H.getMonthlyColumnOrder=()=>normalizeOrder(H.data.monthlyBoard?.columnOrder);
const empty=H.empty,clean=H.cleanBackup;
H.empty=()=>({...empty(),monthlyBoard:{columnOrder:keys.slice()}});
H.cleanBackup=source=>{const data=clean(source);data.monthlyBoard={columnOrder:normalizeOrder(source?.monthlyBoard?.columnOrder)};return data;};
H.monthlyMonths=(endMonth,count=3)=>{
 if(!validMonth(endMonth))endMonth=H.today().slice(0,7);
 const y=Number(endMonth.slice(0,4)),m=Number(endMonth.slice(5,7));
 return Array.from({length:count},(_,i)=>new Date(Date.UTC(y,m-count+i,1)).toISOString().slice(0,7));
};
const monthly=f=>f.periodType==='monthly'||/^monthly/.test(f.sourceKind||'');
const factMonth=(f,anchor='start')=>monthly(f)?(validMonth(f.month)?f.month:String(f.start||'').slice(0,7)):String(f.periodType==='weekly'&&anchor==='end'?f.end:f.start||'').slice(0,7);
const sourceId=f=>JSON.stringify([f.sourceHash||f.sourceFile||f.source||'未标注来源',f.sourceSheet||'',f.sourceKind||'']);
const importedTime=f=>{const t=Date.parse(f.importedAt||f.importedOn||'');return Number.isFinite(t)?t:0;};
const coverageKey=(store,key,month)=>JSON.stringify([store,key,month]);
const sourceStores=(f,allStores)=>unique([...(Array.isArray(f.importScopeStores)?f.importScopeStores:Array.isArray(f.sourceStores)?f.sourceStores:[]),...(f.store?[f.store]:[])]).filter(Boolean).length?unique([...(Array.isArray(f.importScopeStores)?f.importScopeStores:Array.isArray(f.sourceStores)?f.sourceStores:[]),...(f.store?[f.store]:[])]).filter(Boolean):allStores;
function monthlyCoverage(facts,extraStores=[]){
 const stores=unique([...extraStores,...facts.map(f=>f.store).filter(Boolean)]),map=new Map();
 for(const f of facts){
  if(f.category!=='activity'||!monthly(f))continue;
  const months=unique([...(Array.isArray(f.sourceMonths)?f.sourceMonths:[]),factMonth(f)]).filter(validMonth);
  const metrics=unique([...(Array.isArray(f.sourceMetrics)?f.sourceMetrics:[]),f.metric]).map(m=>metricKey.get(m)).filter(Boolean);
  for(const store of sourceStores(f,stores))for(const key of metrics)for(const month of months){
   const id=coverageKey(store,key,month),time=importedTime(f),source=sourceId(f);let entry=map.get(id);
   if(!entry||time>entry.time){entry={time,sources:new Set(),facts:[]};map.set(id,entry);}
   if(time===entry.time){entry.sources.add(source);entry.facts.push(f);}
  }
 }
 return {stores,map};
}
const monthsOverlapped=f=>{
 const a=String(f.start||'').slice(0,7),b=String(f.end||'').slice(0,7);if(!validMonth(a)||!validMonth(b)||a>b)return [];
 const out=[];let y=Number(a.slice(0,4)),m=Number(a.slice(5,7));
 for(let i=0;i<240;i++){const s=new Date(Date.UTC(y,m-1+i,1)).toISOString().slice(0,7);if(s>b)break;out.push(s);}
 return out;
};
// Source-wide precedence happens before an individual is looked up. A missing
// person in a newly imported monthly source is never filled from an old week.
H.monthlyPreferredFacts=(facts,options={})=>{
 const coverage=monthlyCoverage(facts,options.stores||[]),anchor=options.weekMonth||H.weekMonth?.()||'start';
 return facts.filter(f=>{
  const key=metricKey.get(f.metric);if(f.category!=='activity'||!key)return true;
  const stores=f.store?[f.store]:sourceStores(f,coverage.stores);
  if(monthly(f)){
   const month=factMonth(f);if(!validMonth(month))return true;
   return stores.every(store=>{const entry=coverage.map.get(coverageKey(store,key,month));return !entry||entry.sources.has(sourceId(f));});
  }
  const months=f.periodType==='weekly'?[factMonth(f,anchor)]:monthsOverlapped(f);
  return !stores.some(store=>months.some(month=>(!options.month||month===options.month)&&(!options.store||store===options.store)&&coverage.map.has(coverageKey(store,key,month))));
 });
};
const through=f=>{
 const end=H.date(f.end);if(!end)return '';
 const date=H.date(f.observedThrough)||H.date(f.sourceEnd);
 if(date)return date<end?date:end;
 if(f.coverageConfirmed===false)return '';
 return end<=H.today()?end:'';
};
const sourceDescription=f=>[f.sourceFile||f.source||'已导入底表',f.sourceSheet].filter(Boolean).join(' / ');
function makeContext(options={}){
 const allFacts=H.data.facts||[],roster=H.data.novRoster||[],anchor=H.weekMonth?.()||'start';
 const currentRoster=roster.filter(r=>H.monthlyIsCurrentStaff(r)),currentConsultants=currentRoster.filter(r=>H.monthlyIsCurrentConsultant(r));
 const rosterStores=roster.map(r=>r.store).filter(Boolean),coverage=monthlyCoverage(allFacts,rosterStores),facts=H.monthlyPreferredFacts(allFacts,{stores:rosterStores,weekMonth:anchor});
 const availableMonths=unique(facts.filter(f=>f.category==='activity'&&metricKey.has(f.metric)&&f.periodType!=='rolling30').flatMap(f=>monthly(f)?[...(f.sourceMonths||[]),factMonth(f)]:[factMonth(f,anchor)])).filter(validMonth).sort();
 const endMonth=validMonth(options.endMonth)?options.endMonth:availableMonths.at(-1)||H.today().slice(0,7),months=H.monthlyMonths(endMonth);
 const order=['新天地一店','新天地二店','黄浦滨江店','复兴香园店'],stores=unique([...rosterStores,...facts.map(f=>f.store).filter(Boolean)]).sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);return (ai<0?99:ai)-(bi<0?99:bi)||a.localeCompare(b,'zh-CN');});
 const rosterIds=new Map(),rosterNames=new Map(),currentRosterNames=new Map();
 for(const r of roster){if(r.personId){if(!rosterIds.has(r.personId))rosterIds.set(r.personId,[]);rosterIds.get(r.personId).push(r);}const key=JSON.stringify([r.store,r.person]);if(!rosterNames.has(key))rosterNames.set(key,[]);rosterNames.get(key).push(r);}
 for(const r of currentRoster){const key=JSON.stringify([r.store,r.person]);if(!currentRosterNames.has(key))currentRosterNames.set(key,[]);currentRosterNames.get(key).push(r);}
 const staffFor=f=>{
  const records=f.personId?(rosterIds.get(f.personId)||[]):(rosterNames.get(JSON.stringify([f.store,f.person]))||[]);
  const ids=unique(records.map(r=>r.personId).filter(Boolean));return ids.length===1?records.find(r=>r.personId===ids[0]):null;
 };
 const nodes=new Map(),index=new Map(),children=new Map(),periods=new Map();
 const add=(level,store='',group='',person='',personId='',staff=null)=>{
  const id=[level,store,group,level==='person'?(personId||person):''].join('|');
  if(!nodes.has(id)){
   const parent=level==='region'?null:level==='store'?'region|||':level==='group'?['store',store,'',''].join('|'):['group',store,group,''].join('|');
   nodes.set(id,{id,level,store,group,person,personId:personId||'',role:staff?.role||'',joinDate:staff?.joinDate||'',label:level==='region'?'黄浦大区合计':level==='store'?store:level==='group'?(group.startsWith(store)?group.slice(store.length):group):person,parent,...(level==='group'?{managerNames:unique(currentRoster.filter(r=>r.store===store&&r.group===group&&/^(店经理|经理|门店经理)$/.test(r.role||'')).map(r=>r.person).filter(Boolean))}:{}),months:Object.fromEntries(months.map(m=>[m,{}])),cellMeta:Object.fromEntries(months.map(m=>[m,{}]))});
   if(parent){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(id);}
  }
  return nodes.get(id);
 };
 add('region');for(const store of stores)add('store',store);
 const addEntity=f=>{
  if(f.level==='region')return add('region');if(!f.store)return null;add('store',f.store);
  if(f.level==='store')return add('store',f.store);if(!f.group)return null;add('group',f.store,f.group);
  if(f.level==='group')return add('group',f.store,f.group);if(!f.person)return null;
  const staff=staffFor(f);return add('person',f.store,f.group,f.person,f.personId||staff?.personId||'',staff||f);
 };
 for(const r of roster)if(r.store&&r.group&&r.person)addEntity({...r,level:'person'});
 for(const f of facts){
  const key=metricKey.get(f.metric),month=factMonth(f,anchor);if(f.category!=='activity'||!key||!months.includes(month)||f.periodType==='rolling30')continue;
  const grain=monthly(f)?'monthly':f.periodType==='weekly'?'weekly':f.start===monthStart(month)&&H.date(f.end)&&f.end<=monthEnd(month)?'snapshot':'';if(!grain)continue;
  const node=addEntity(f);if(!node)continue;const id=JSON.stringify([node.id,key,month]);if(!index.has(id))index.set(id,[]);index.get(id).push({...f,_grain:grain});
  const pk=coverageKey(f.store||'*',key,month);if(!periods.has(pk))periods.set(pk,[]);periods.get(pk).push({...f,_grain:grain});
 }
 const isVisiblePerson=node=>currentConsultants.some(r=>r.store===node.store&&(node.personId?r.personId===node.personId:!r.personId&&r.group===node.group&&r.person===node.person));
 const ctx={options,allFacts,facts,roster,currentRoster,currentConsultants,rosterIds,rosterNames,currentRosterNames,coverage,anchor,months,endMonth,stores,nodes,index,children,periods,cache:new Map(),staffFor,isVisiblePerson};
 return ctx;
}
const missingCell=note=>({n:null,facts:[],grain:'',status:'missing',note:note||'未提供对应月份数据',asterisk:false,signature:'',comparable:false});
const conflictCell=(facts,note)=>({n:null,facts,grain:facts[0]?._grain||'',status:'conflict',note,asterisk:true,signature:'',comparable:false});
function pickDirect(facts,node,key,month,ctx){
 if(!facts.length)return null;
 const hasMonthly=node.store?ctx.coverage.map.has(coverageKey(node.store,key,month)):facts.some(f=>f._grain==='monthly');
 const scope=ctx.periods.get(coverageKey(node.store||'*',key,month))||[];
 const grain=hasMonthly?'monthly':scope.some(f=>f._grain==='weekly')?'weekly':facts.some(f=>f._grain==='weekly')?'weekly':'snapshot';
 facts=facts.filter(f=>f._grain===grain);if(!facts.length)return null;
 if(facts.some(f=>!Number.isFinite(f.value)))return conflictCell(facts,'来源包含无效数值，待核对');
 let selected=[];
 if(grain==='monthly'){
  const values=unique(facts.map(f=>f.value));if(values.length!==1)return conflictCell(facts,'同一对象同月存在不同数值的月度来源，待核对');
  selected=[facts.slice().sort((a,b)=>importedTime(b)-importedTime(a)||through(b).localeCompare(through(a)))[0]];
 }else{
  const map=new Map();for(const f of facts){const k=f.start+'|'+f.end,previous=map.get(k);if(previous&&Math.abs(previous.value-f.value)>EPS)return conflictCell(facts,'同一周期存在不同数值，待核对');if(!previous||through(f)>through(previous))map.set(k,f);}
  selected=[...map.values()].sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=1;i<selected.length;i++)if(selected[i].start<=selected[i-1].end)return conflictCell(facts,'来源期间重叠，不能重复累计');
 }
 const observed=unique(selected.map(through)),observationKnown=selected.every(f=>!!through(f)),lastObserved=observed.filter(Boolean).sort().at(-1)||'',sourceNotes=unique(selected.map(f=>f.coverageNote||'').filter(Boolean)),unknown=selected.some(f=>f.coverageConfirmed===false),partial=grain==='weekly'||unknown||selected.some(f=>f.periodComplete===false||through(f)&&through(f)<monthEnd(month));
 const expected=grain==='weekly'?unique(scope.filter(f=>f._grain==='weekly').map(f=>f.start+'|'+f.end+'@'+through(f))).sort():[];
 const given=selected.map(f=>f.start+'|'+f.end+'@'+through(f)).sort(),missing=expected.filter(p=>!given.includes(p));
 const signature=grain==='monthly'?'monthly|'+month+'|'+(observed[0]||'unknown'):grain+'|'+given.join(';');
 let note=sourceNotes.join('；');if(grain==='weekly')note=[note,'按已导入周累计；'+(missing.length?'缺少'+missing.length+'个共同周记录':'保留原周归月规则')].filter(Boolean).join('；');
 if(!observationKnown)note=[note,'来源未明确日级截止'].filter(Boolean).join('；');
 return {n:selected.reduce((sum,f)=>sum+f.value,0),facts:selected,grain,status:unknown?'unconfirmed':partial?'partial':'ok',note,asterisk:selected.some(f=>f.displayAsterisk===true),observedThrough:lastObserved,signature,comparable:!unknown&&observationKnown&&(grain!=='monthly'||observed.length===1)&&!missing.length,missingPeriods:missing,sourceKinds:unique(selected.map(f=>f.sourceKind||f.periodType||''))};
}
function combined(values,note=''){
 const conflicts=values.filter(v=>v.status==='conflict');if(conflicts.length)return conflictCell(conflicts.flatMap(v=>v.facts),unique(conflicts.map(v=>v.note)).join('；'));
 const known=values.filter(v=>v.n!==null&&Number.isFinite(v.n));if(!known.length)return missingCell(note||'未提供对应月份数据');
 const facts=known.flatMap(v=>v.facts),grains=unique(known.map(v=>v.grain)),signatures=unique(known.map(v=>v.signature)),dates=unique(known.map(v=>v.observedThrough||'')),notes=unique(known.map(v=>v.note).filter(Boolean));
 if(known.length<values.length)notes.push('仅累计已提供记录，未出现的人员记录不补0');
 if(dates.length>1)notes.push('成员来源截止不一致，保留已提供数值');
 return {n:known.reduce((sum,v)=>sum+v.n,0),facts,grain:grains.length===1?grains[0]:'mixed',status:known.some(v=>v.status==='unconfirmed')?'unconfirmed':known.length<values.length||known.some(v=>v.status!=='ok')?'partial':'ok',note:unique([note,...notes].filter(Boolean)).join('；'),asterisk:known.some(v=>v.asterisk),observedThrough:dates.length===1?dates[0]:'',signature:signatures.length===1?signatures[0]:'mixed',comparable:known.length===values.length&&known.every(v=>v.comparable)&&signatures.length===1,sourceKinds:unique(known.flatMap(v=>v.sourceKinds||[]))};
}
function cell(node,key,month,ctx){
 const id=JSON.stringify([node.id,key,month]);if(ctx.cache.has(id))return ctx.cache.get(id);
 let result;
 if(key==='rate'){
  const denominator=cell(node,'channel',month,ctx),numerator=cell(node,'entered',month,ctx);
  if(denominator.status==='conflict'||numerator.status==='conflict')result=conflictCell([...denominator.facts,...numerator.facts],'新增或进入带看存在冲突，暂不计算比率');
  else if(denominator.n===null||numerator.n===null)result=missingCell('缺少对应新增量或进入带看量，不计算比率');
  else if(denominator.n<=0)result={...missingCell('重点渠道新增为0，进入带看率不适用'),status:'not-applicable'};
  else {
   const coverage=v=>unique(v.facts.map(f=>[f.level,f.store,f.group,f.personId||f.person||'',f.start,f.end,through(f)].join('|'))).sort().join(';');
   if(coverage(denominator)!==coverage(numerator))result=missingCell('分子和分母的人员或统计期间不同，不计算比率');
   else result={...combined([numerator,denominator]),n:numerator.n/denominator.n,numerator:numerator.n,denominator:denominator.n,comparable:false};
  }
 }else{
  const direct=pickDirect(ctx.index.get(id)||[],node,key,month,ctx);
  if(direct)result=direct;
  else if(node.level==='person')result=missingCell();
  else result=combined((ctx.children.get(node.id)||[]).map(child=>cell(ctx.nodes.get(child),key,month,ctx)));
 }
 ctx.cache.set(id,result);return result;
}
const cellMetadata=value=>({status:value.status,note:value.note||'',asterisk:!!value.asterisk,observedThrough:value.observedThrough||'',sourceKind:(value.sourceKinds||[]).join(' / '),grain:value.grain||'',sources:unique((value.facts||[]).map(sourceDescription)),sourcePeriods:unique((value.facts||[]).map(f=>[f.sourceStart||f.start||'',f.sourceEnd||f.end||''].join('至'))),comparable:!!value.comparable});
const median=values=>{const a=values.slice().sort((x,y)=>x-y),mid=Math.floor(a.length/2);return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;};
function ranking(store,month,ctx){
 const result={store,month,count:0,eligible:0,eligibleCount:0,missing:[],notJoined:[],all:[],top:[],bottom:[],status:'none',rule:{metrics:['view','channel'],weights:[1,1],method:'percentileMean'},through:'',tieNote:'第三位并列全部保留，人数可能超过3人'};
 if(!store){result.status='select-store';return result;}
 const candidates=new Map();for(const r of ctx.currentConsultants)if(r.store===store){const key=r.personId||JSON.stringify([r.store,r.group,r.person]);if(!candidates.has(key))candidates.set(key,r);}
 const scopeFacts=ctx.facts.filter(f=>f.store===store&&['view','channel'].includes(metricKey.get(f.metric))&&factMonth(f,ctx.anchor)===month),cutoffs=scopeFacts.map(through).filter(Boolean).sort(),cutoff=cutoffs.at(-1)||monthEnd(month);result.through=cutoff;
 const complete=[];
 for(const r of candidates.values()){
  if(r.joinDate&&r.joinDate>cutoff){result.notJoined.push(r.person);continue;}
  const group=String(r.group||'').startsWith(store)?r.group.slice(store.length):r.group;
  const identities=unique((ctx.currentRosterNames.get(JSON.stringify([store,r.person]))||[]).map(p=>p.personId).filter(Boolean));
  if(!r.personId||identities.length!==1){result.missing.push({name:r.person,group,personId:r.personId||'',missing:['身份需核对']});continue;}
  const nodes=[...ctx.nodes.values()].filter(n=>n.level==='person'&&n.store===store&&n.personId===r.personId),values={},sourceValues={},missing=[];
  for(const key of ['view','channel']){
   const records=nodes.map(n=>cell(n,key,month,ctx)).filter(v=>v.n!==null||v.status==='conflict');
   const value=combined(records);sourceValues[key]=value;
   if(value.n===null)missing.push(key==='view'?'买卖带看'+(value.status==='conflict'?'来源冲突':''):'重点渠道新增'+(value.status==='conflict'?'来源冲突':''));
   else if(value.n<0)missing.push((key==='view'?'买卖带看':'重点渠道新增')+'为负数待核');
   else if(!value.comparable)missing.push((key==='view'?'买卖带看':'重点渠道新增')+'周期／截止待补齐');
   else values[key]=value.n;
  }
  if(!missing.length&&sourceValues.view.signature!==sourceValues.channel.signature)missing.push('两项指标统计周期或截止不一致');
  if(missing.length){result.missing.push({name:r.person,group,personId:r.personId,missing,values:{view:sourceValues.view.n,channel:sourceValues.channel.n}});continue;}
  complete.push({personId:r.personId,name:r.person,group,values,signature:sourceValues.view.signature,sourceGroups:unique(nodes.filter(n=>['view','channel'].some(k=>cell(n,k,month,ctx).n!==null)).map(n=>n.group))});
 }
 const signatures=unique(complete.map(p=>p.signature));
 if(signatures.length>1){for(const p of complete)result.missing.push({name:p.name,group:p.group,personId:p.personId,missing:['比较对象的统计截止不一致'],values:p.values});complete.length=0;}
 result.count=complete.length;result.eligible=complete.length+result.missing.length;result.eligibleCount=result.eligible;
 for(const p of complete){p.parts={};for(const key of ['view','channel']){const lower=complete.filter(q=>q.values[key]<p.values[key]).length,equal=complete.filter(q=>q.values[key]===p.values[key]).length,percentile=complete.length===1?50:100*(lower+(equal-1)/2)/(complete.length-1);p.parts[key]={percentile,rank:1+complete.filter(q=>q.values[key]>p.values[key]).length,tied:equal>1,median:median(complete.map(q=>q.values[key]))};}p.score=(p.parts.view.percentile+p.parts.channel.percentile)/2;}
 for(const p of complete){p.rank=1+complete.filter(q=>q.score>p.score+EPS).length;p.bottomRank=1+complete.filter(q=>q.score<p.score-EPS).length;p.ties=complete.filter(q=>Math.abs(q.score-p.score)<EPS).length;}
 complete.sort((a,b)=>b.score-a.score||a.group.localeCompare(b.group,'zh-CN')||a.personId.localeCompare(b.personId));result.all=complete;
 if(!complete.length)return result;
 if(complete.every(p=>Math.abs(p.score-complete[0].score)<EPS)){result.status='tied';return result;}
 if(complete.length<6){result.status='small';return result;}
 const ascending=complete.slice().sort((a,b)=>a.score-b.score||a.group.localeCompare(b.group,'zh-CN')||a.personId.localeCompare(b.personId)),top=complete[2].score,bottom=ascending[2].score;
 if(top<=bottom+EPS){result.status='overlap';return result;}
 result.status='separate';result.top=complete.filter(p=>p.score>=top-EPS);result.bottom=ascending.filter(p=>p.score<=bottom+EPS);return result;
}
H.monthlyRanking=({store=H.ui.monthlyBoard?.store||H.ui.store||'',month,endMonth}={})=>{
 const ctx=makeContext({endMonth:validMonth(month)?month:endMonth||H.ui.monthlyBoard?.endMonth});return ranking(store,validMonth(month)?month:ctx.endMonth,ctx);
};
H.monthlyView=(options={})=>{
 const selectedStore=options.store??H.ui.monthlyBoard?.store??H.ui.store??'',ctx=makeContext({endMonth:options.endMonth||H.ui.monthlyBoard?.endMonth}),rankings={},notes=new Set();
 const sorted=[],walk=id=>{const node=ctx.nodes.get(id);if(!node)return;sorted.push(node);const children=(ctx.children.get(id)||[]).slice().sort((a,b)=>{const x=ctx.nodes.get(a),y=ctx.nodes.get(b);if(x.level==='store')return ctx.stores.indexOf(x.store)-ctx.stores.indexOf(y.store);return (x.group||'').localeCompare(y.group||'','zh-CN')||(x.person||'').localeCompare(y.person||'','zh-CN');});for(const child of children)walk(child);};walk('region|||');
 for(const node of sorted)for(const month of ctx.months)for(const key of keys){const value=cell(node,key,month,ctx);node.months[month][key]=value.n;node.cellMeta[month][key]=cellMetadata(value);if(value.status==='conflict'||value.asterisk||value.status==='unconfirmed')if(value.note)notes.add(value.note);}
 for(const store of ctx.stores){rankings[store]={};for(const month of ctx.months)rankings[store][month]=ranking(store,month,ctx);}
 const used=ctx.facts.filter(f=>f.category==='activity'&&metricKey.has(f.metric)&&ctx.months.includes(factMonth(f,ctx.anchor))&&(!selectedStore||f.store===selectedStore)),cutoffs=used.map(through).filter(Boolean).sort(),sourceCutoff=cutoffs.at(-1)||'';
 const displayNodes=sorted.filter(n=>(n.level!=='person'||ctx.isVisiblePerson(n))&&(n.level==='region'||!selectedStore||n.store===selectedStore));
 const displayCounts=Object.fromEntries(ctx.stores.map(store=>{const people=sorted.filter(n=>n.level==='person'&&n.store===store&&ctx.isVisiblePerson(n));return [store,{personRows:people.length,uniqueConsultants:unique(people.map(n=>n.personId||n.person)).length,groups:sorted.filter(n=>n.level==='group'&&n.store===store).length}];}));
 const organizationTotalsNote='门店、店组保留当期历史合计；个人仅显示当前在职顾问。';notes.add(organizationTotalsNote);
 return {months:ctx.months,endMonth:ctx.endMonth,stores:ctx.stores,nodes:displayNodes,rows:displayNodes,displayCounts,organizationTotalsNote,rankings,rankingRule:{metrics:['view','channel'],weights:[1,1],method:'percentileMean',pool:'当前在职顾问名单',tiePolicy:'保留边界全部同分',identityRule:'按唯一员工编码汇总同人在本店各源店组记录'},columns:H.getMonthlyColumnOrder().map(key=>({...columns.find(c=>c.key===key)})),columnOrder:H.getMonthlyColumnOrder(),notes:[...notes],coverage:{sourceCutoff,weekMonth:ctx.anchor,organizationTotals:'historical-source',people:'current-consultants'},sourceCutoff,selectedStore};
};
})();
