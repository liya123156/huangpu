/* Calendar aggregation for weekly increments and monthly source totals. No business data. */
'use strict';
(() => {
const H=HP,DAY=864e5;
const time=s=>Date.parse(s+'T00:00:00Z');
const iso=t=>new Date(t).toISOString().slice(0,10);
const calendar=f=>f.periodType==='weekly'||f.periodType==='monthly';
const blank=reason=>({n:null,rows:[],reason:reason||''});
const empty=H.empty,clean=H.cleanBackup;
H.empty=()=>({...empty(),calendarSettings:{weekMonth:'start'}});
H.cleanBackup=source=>{const d=clean(source);d.calendarSettings={weekMonth:source?.calendarSettings?.weekMonth==='end'?'end':'start'};return d;};
H.weekMonth=()=>H.data.calendarSettings?.weekMonth==='end'?'end':'start';
H.calendarRuleText=()=>H.weekMonth()==='end'?'跨月周整周计入周结束日所在月；不按天拆分。':'跨月周整周计入周开始日所在月；不按天拆分。';
H.periodContains=(f,start,end,mode='range')=>{
 if(f.category==='roster')return true;
 if(f.periodType==='rolling30')return mode==='batch';
 if(!H.date(f.start)||!H.date(f.end)||f.start>f.end||!H.date(start)||!H.date(end)||start>end)return false;
 if(f.periodType==='weekly'&&['month','year'].includes(mode)){
  const anchor=H.weekMonth()==='end'?f.end:f.start;
  return anchor>=start&&anchor<=end;
 }
 return f.start>=start&&f.end<=end;
};
H.dateIn=f=>H.periodContains(f,H.ui.start,H.ui.end,H.ui.period);
H.expectedWeeks=(start,end,anchor=H.weekMonth())=>{
 if(!H.date(start)||!H.date(end)||start>end)return [];
 const first=time(start),last=time(end),weekday=new Date(first).getUTCDay();
 let monday=first-((weekday+6)%7)*DAY;
 const out=[];
 for(;monday<=last;monday+=7*DAY){const a=iso(monday),b=iso(monday+6*DAY),key=anchor==='end'?b:a;if(key>=start&&key<=end)out.push([a,b]);}
 return out;
};
const spans=rows=>{
 const all=[...new Set(rows.map(f=>f.start+'|'+f.end))].map(s=>s.split('|')).sort((a,b)=>a[0].localeCompare(b[0])),out=[];
 for(const s of all){const last=out.at(-1);if(last&&time(s[0])<=time(last[1])+DAY){if(s[1]>last[1])last[1]=s[1];}else out.push(s.slice());}
 return out;
};
const covers=(parts,a,b)=>parts.some(s=>s[0]<=a&&s[1]>=b);
H.calendarCoverage=(rows,start,end,mode='range')=>{
 if(!rows.length)return {complete:false,partial:true,missing:[],reason:'没有已提供数据'};
 const dated=rows.filter(f=>f.periodType!=='rolling30'&&H.date(f.start)&&H.date(f.end));
 if(!dated.length)return {complete:mode==='batch',partial:mode!=='batch',missing:[],reason:''};
 const unfinished=dated.some(f=>f.periodComplete===false||(f.observedThrough&&f.observedThrough<f.end)||(calendar(f)&&f.end>H.today()));
 const partialSource=dated.some(f=>f.sourceCoverageOnly===true);
 const missing=[];
 let complete;
 if(['month','year'].includes(mode)&&dated.some(f=>f.periodType==='weekly')){
  const weekly=new Set(dated.filter(f=>f.periodType==='weekly').map(f=>f.start+'|'+f.end));
  const other=spans(dated.filter(f=>f.periodType!=='weekly'));
  let cursor=new Date(time(start));cursor.setUTCDate(1);
  while(iso(+cursor)<=end){
   const a=iso(+cursor),b=iso(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0));
   const from=a<start?start:a,to=b>end?end:b;
   if(!covers(other,from,to))for(const pair of H.expectedWeeks(from,to)){if(!weekly.has(pair.join('|'))&&!covers(other,pair[0],pair[1]))missing.push(pair.join('—'));}
   cursor.setUTCMonth(cursor.getUTCMonth()+1);
  }
  complete=!missing.length;
 }else{
  const merged=spans(dated);complete=covers(merged,start,end);
  if(!complete)missing.push(start+'—'+end);
 }
 if(mode==='batch')complete=true;
 const partial=!complete||unfinished||partialSource;
 const reasons=[];
 if(!complete)reasons.push('仅累计已提供周期，缺少部分周／月份');
 if(unfinished)reasons.push('当周／当月尚未结束');
 if(partialSource)reasons.push('来源记录合计，未出现的人员记录不补0');
 return {complete:complete&&!unfinished&&!partialSource,partial,missing,unfinished,partialSource,reason:reasons.join('；')};
};

// Cache only during a synchronous render/model call. Imports and edits cannot leave stale values.
let active=null;
H.withCalendarCache=fn=>{if(active)return fn();active={contexts:new Map(),values:new Map(),entities:null,roster:null};try{return fn();}finally{active=null;}};
const oldEntities=H.entities,oldRoster=H.roster;
H.roster=()=>active?(active.roster||(active.roster=oldRoster())):oldRoster();
H.entities=()=>active?(active.entities||(active.entities=oldEntities())):oldEntities();
const originalLatest=H.latest;
const equalNumber=(a,b)=>a===b||(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9);
const selectedDirect=rows=>{
 if(rows.some(f=>f.periodType==='rolling30')&&rows.some(f=>f.periodType!=='rolling30'))return {rows:[],reason:'近30天快照与周／月数据口径不同，请选择明确的周、月或年'};
 const same=new Map();
 for(const f of rows){const key=f.start+'|'+f.end,prev=same.get(key);if(prev&&(!equalNumber(prev.value,f.value)||(prev.numerator!==undefined&&f.numerator!==undefined&&!equalNumber(prev.numerator,f.numerator))||(prev.denominator!==undefined&&f.denominator!==undefined&&!equalNumber(prev.denominator,f.denominator))))return {rows:[],reason:'同一周期存在冲突数据，需在导入中核对'};if(!prev||calendar(f))same.set(key,f);}
 return originalLatest([...same.values()]);
};
const overlaps=(a,b)=>a.start<=b.end&&a.end>=b.start;
const inside=(a,b)=>a.start>=b.start&&a.end<=b.end;
const periodKey=f=>f.start+'|'+f.end+'|'+(f.periodType==='rolling30'?'rolling30':'dated');
const scopeKey=(range,exclude)=>[range.start,range.end,range.mode||'range',H.weekMonth(),exclude?'strict':'all'].join('|');
const contextFor=(id,category,range,options)=>{
 const key=category+'|'+id+'|'+scopeKey(range,options.excludeLeaders);
 if(!options.facts&&active?.contexts.has(key))return active.contexts.get(key);
 const source=options.facts||H.data.facts;
 const preferred=H.monthlyPreferredFacts?H.monthlyPreferredFacts(source):source;
 const all=preferred.filter(f=>f.category===category&&f.metric===id&&H.periodContains(f,range.start,range.end,range.mode));
 const context={id,category,range,options,all,entities:H.entities(),cache:new Map(),rate:H.meta(id).kind==='rate'||H.meta(id).unit==='%'};
 if(active&&!options.facts)active.contexts.set(key,context);
 return context;
};
const collect=(entity,c,depth=0)=>{
 const key=H.key(entity);if(c.cache.has(key))return c.cache.get(key);
 if(depth>4)return {pieces:[],reason:'组织层级无法汇总'};
 const done=result=>{c.cache.set(key,result);return result;};
 const exact=c.all.filter(f=>H.same(f,entity)),selected=selectedDirect(exact);
 if(selected.reason)return done({pieces:[],reason:selected.reason});
 const direct=selected.rows.map(f=>({...f,rows:[f],partial:!!f.sourceCoverageOnly}));
 if(entity.level==='person'||c.id==='target')return done({pieces:direct});
 const next={region:'store',store:'group',group:'person'}[entity.level];
 const children=c.entities.filter(e=>e.level===next&&H.within(e,entity)&&(!c.options.excludeLeaders||next!=='person'||!H.isLeader?.(H.staff(e))));
 const groups=new Map();
 for(const child of children){
  const result=collect(child,c,depth+1);
  if(result.reason){
   // A complete authoritative parent period can safely cover contradictory detail within it.
   const records=c.all.filter(f=>H.within(f,child));
   if(records.length&&records.every(f=>direct.some(d=>inside(f,d))))continue;
   return done({pieces:[],reason:result.reason});
  }
  for(const piece of result.pieces){
   if(direct.some(d=>inside(piece,d)))continue;
   if(direct.some(d=>overlaps(piece,d)))return done({pieces:[],reason:'父级汇总与子级记录周期交叉，不能拆分或重复相加'});
   const pk=periodKey(piece);if(!groups.has(pk))groups.set(pk,{template:piece,values:[]});groups.get(pk).values.push({piece,child});
  }
 }
 const additions=[];
 for(const {template,values}of groups.values()){
  const expected=children.filter(e=>next!=='person'||!H.staff(e).joinDate||H.staff(e).joinDate<=template.end).length;
  const partial=values.length<expected||values.some(x=>x.piece.partial);
  const p={...template,rows:values.flatMap(x=>x.piece.rows),partial,derived:true};
  if(c.rate){
   if(values.some(x=>!Number.isFinite(x.piece.numerator)||!Number.isFinite(x.piece.denominator)||x.piece.denominator<0)){p.value=null;p.missingRateParts=true;}
   else{p.numerator=values.reduce((s,x)=>s+x.piece.numerator,0);p.denominator=values.reduce((s,x)=>s+x.piece.denominator,0);p.value=p.denominator>0?p.numerator/p.denominator*100:null;}
  }else p.value=values.reduce((s,x)=>s+x.piece.value,0);
  additions.push(p);
 }
 const pieces=[...direct,...additions].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
 for(let i=1;i<pieces.length;i++)if(overlaps(pieces[i-1],pieces[i]))return done({pieces:[],reason:'汇总周期重叠，周值与月累计不能混加'});
 return done({pieces});
};
H.calendarValue=(entity,id,category='activity',range={start:H.ui.start,end:H.ui.end,mode:H.ui.period},options={})=>{
 const c=contextFor(id,category,range,options),result=collect(entity,c);
 if(result.reason)return blank(result.reason);
 const pieces=result.pieces,rows=pieces.flatMap(p=>p.rows);
 if(!pieces.length)return blank('未提供当前周期数据');
 const coverage=H.calendarCoverage(rows,range.start,range.end,range.mode);
 const partial=coverage.partial||pieces.some(p=>p.partial);
 let n;
 if(c.rate){
  if(pieces.every(p=>Number.isFinite(p.numerator)&&Number.isFinite(p.denominator)&&p.denominator>=0)){
   const numerator=pieces.reduce((s,p)=>s+p.numerator,0),denominator=pieces.reduce((s,p)=>s+p.denominator,0);
   if(denominator<=0)return {n:null,rows,partial,reason:'新增量为0，无法计算进入带看率',coverage};
   n=numerator/denominator*100;
  }else if(pieces.length===1&&!pieces[0].derived&&!pieces[0].missingRateParts)n=pieces[0].value;
  else return {n:null,rows,partial,reason:'缺少对应分子或分母，不能平均多周／多月比例',coverage};
 }else n=pieces.reduce((s,p)=>s+p.value,0);
 if(!Number.isFinite(n))return {n:null,rows,partial,reason:'包含无效数值，请核对底表',coverage};
 if(options.strict&&pieces.some(p=>p.partial&&!p.sourceCoverageOnly))return {n:null,rows,partial,reason:'缺少完整组汇总或成员数据，暂不排名',coverage};
 return {n,rows,partial,scopePartial:pieces.some(p=>p.partial),coverage,reason:coverage.reason||(partial?'仅累计已提供记录，缺失未补0':'')};
};
const oldValue=H.value;
H.value=(entity,id,category='activity',depth=0)=>{
 const key=H.key(entity)+'|'+id+'|'+category+'|'+scopeKey({start:H.ui.start,end:H.ui.end,mode:H.ui.period},false);
 if(active?.values.has(key))return active.values.get(key);
 const hasCalendar=H.data.facts.some(f=>f.category===category&&f.metric===id&&calendar(f)&&H.within(f,entity));
 const result=hasCalendar?H.calendarValue(entity,id,category):oldValue(entity,id,category,depth);
 if(active)active.values.set(key,result);return result;
};

// The existing leaderboard still owns ordering and ties; only its period calculation is shared.
const oldBuild=H.lbBuildMetric;
H.lbBuildMetric=(metric,level,settings=H.lbSettings())=>H.withCalendarCache(()=>{
 const result=oldBuild(metric,level,settings);
 if(!H.data.facts.some(f=>f.category==='activity'&&f.metric===metric.id&&calendar(f)&&H.within(f,H.root())))return result;
 if(result.status==='ready'||result.status==='zero'){
  const rows=result.rows.flatMap(x=>x.rows),coverage=H.calendarCoverage(rows,result.range.start,result.range.end,result.range.mode);
  result.partial=coverage.partial;
  if(result.status==='ready')result.message=coverage.partial?'按已导入记录统计；'+coverage.reason:'统计周期完整';
 }
 return result;
});
for(const name of ['render','activityModel','lbModel','buildOrgAnalysis'])if(typeof H[name]==='function'){
 const fn=H[name];H[name]=(...args)=>H.withCalendarCache(()=>fn(...args));
}
})();
