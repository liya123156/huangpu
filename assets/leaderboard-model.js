/* TOP5 uses one activity metric at a time. No private data is embedded. */
'use strict';
(() => {
const H=HP,DAY=864e5;
const day=s=>new Date(s+'T00:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
H.lbSettings=()=>{
 if(!H.ui.leaderboard)H.ui.leaderboard={mode:'month',anchor:H.ui.end||H.today(),level:'both',role:'顾问',metrics:null};
 return H.ui.leaderboard;
};
H.lbRange=(settings=H.lbSettings())=>{
 const anchor=H.date(settings.anchor)||H.today(),d=day(anchor),y=d.getUTCFullYear(),m=d.getUTCMonth();
 let start,end,label;
 if(settings.mode==='week'){
  const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);
  start=iso(monday);end=iso(sunday);label='周榜 · '+start+'—'+end;
 }else if(settings.mode==='year'){
  start=y+'-01-01';end=y+'-12-31';label=y+'年 · 年度榜';
 }else{
  start=iso(new Date(Date.UTC(y,m,1)));end=iso(new Date(Date.UTC(y,m+1,0)));label=y+'年'+(m+1)+'月 · 月榜';
 }
 return {start,end,label,mode:settings.mode||'month',anchor};
};
H.lbMetrics=()=>H.metrics().filter(m=>['house','customer'].includes(m.g)&&m.kind!=='text'&&m.kind!=='rate'&&m.unit!=='%');
H.lbSpans=rows=>{
 const spans=[...new Set(rows.map(f=>f.start+'|'+f.end))].map(s=>s.split('|')).sort((a,b)=>a[0].localeCompare(b[0]));
 const merged=[];
 for(const [a,b]of spans){const last=merged.at(-1);if(last&&day(a).getTime()<=day(last[1]).getTime()+DAY){if(b>last[1])last[1]=b;}else merged.push([a,b]);}
 return merged;
};
const signature=rows=>H.lbSpans(rows).map(s=>s.join('/')).join(';');
H.lbPool=(level,settings=H.lbSettings(),range=H.lbRange(settings))=>H.entities().filter(e=>{
 if(e.level!==level||!H.within(e,H.root()))return false;
 if(level!=='person')return true;
 const staff=H.staff(e);
 return !H.isLeader(staff)&&(settings.role==='all'||staff.role===settings.role)&&(!staff.joinDate||staff.joinDate<=range.end);
});
H.lbBuildMetric=(metric,level,settings=H.lbSettings())=>{
 const range=H.lbRange(settings),pool=H.lbPool(level,settings,range),entities=H.entities();
 const all=H.data.facts.filter(f=>f.category==='activity'&&f.metric===metric.id&&H.within(f,H.root()));
 const dated=all.filter(f=>f.periodType!=='rolling30'&&H.date(f.start)&&H.date(f.end)&&f.start>=range.start&&f.end<=range.end);
 const cache=new Map();
 function get(entity,depth=0){
  const key=H.key(entity);if(cache.has(key))return cache.get(key);
  if(depth>4)return {n:null,rows:[],reason:'层级待核'};
  const exact=dated.filter(f=>H.same(f,entity)),latest=H.latest(exact);
  let value;
  if(latest.reason)value={n:null,rows:[],reason:latest.reason};
  else if(latest.rows.length){
   const n=latest.rows.reduce((s,f)=>s+f.value,0);
   value=Number.isFinite(n)&&n>=0?{n,rows:latest.rows}:{n:null,rows:latest.rows,reason:'活动量负数或无效，待核对'};
  }else if(entity.level==='person')value={n:null,rows:[],reason:'未提供个人数据'};
  else{
   const next={region:'store',store:'group',group:'person'}[entity.level];
   const children=entities.filter(e=>e.level===next&&H.within(e,entity)&&(next!=='person'||!H.isLeader(H.staff(e))));
   const vals=children.map(e=>get(e,depth+1));
   if(!children.length||vals.some(v=>v.n===null))value={n:null,rows:[],reason:'缺少完整组汇总或成员数据，暂不排名'};
   else if(new Set(vals.map(v=>signature(v.rows))).size>1)value={n:null,rows:[],reason:'组内成员统计周期不同，暂不汇总排名'};
   else value={n:vals.reduce((s,v)=>s+v.n,0),rows:vals.flatMap(v=>v.rows)};
  }
  cache.set(key,value);return value;
 }
 const items=pool.map(entity=>({entity,...get(entity)})),known=items.filter(x=>x.n!==null),spans=H.lbSpans(known.flatMap(x=>x.rows));
 const result={metric,level,range,poolCount:pool.length,knownCount:known.length,missingCount:pool.length-known.length,rows:[],spans,partial:true,status:'empty',message:'',sources:[...new Set(known.flatMap(x=>x.rows).map(f=>f.source||'已导入底表'))]};
 if(!known.length){
  result.message=all.some(f=>f.periodType==='rolling30')&&!all.some(f=>f.periodType!=='rolling30')?'仅有近30天快照，不计入自然周／月／年榜':all.length&&!dated.length?'现有汇总无法拆入本周期；请导入对应周期数据':dated.length?'缺少可比较的'+(level==='group'?'店组':'个人')+'数据':'尚未导入此项活动量';
  return result;
 }
 if(new Set(known.map(x=>signature(x.rows))).size>1){result.status='mismatch';result.message='各对象统计周期不同，暂不混排；请统一数据范围';return result;}
 result.partial=!(spans.length===1&&spans[0][0]===range.start&&spans[0][1]===range.end);
 const positives=known.filter(x=>x.n>0).sort((a,b)=>b.n-a.n||H.label(a.entity).localeCompare(H.label(b.entity),'zh-CN')||H.key(a.entity).localeCompare(H.key(b.entity)));
 if(!positives.length){result.status='zero';result.message='已提供的数据均为0，暂无正数活动量标杆';return result;}
 // Retain all ties at the fifth position. Equal values are not split by employee ID.
 const cutoff=positives[Math.min(4,positives.length-1)].n;
 result.rows=positives.filter(x=>x.n>=cutoff).map(x=>({...x,rank:1+positives.filter(y=>y.n>x.n).length}));
 result.status='ready';result.positiveCount=positives.length;result.tieExtra=Math.max(0,result.rows.length-5);result.max=positives[0].n;
 result.message=result.partial?'按已导入部分统计，非完整'+({week:'周',month:'月',year:'年'}[range.mode]||'周期')+'排名':'统计周期完整';
 return result;
};
H.lbModel=()=>{
 const s=H.lbSettings(),range=H.lbRange(s),allMetrics=H.lbMetrics(),root=H.root();
 const available=allMetrics.filter(m=>H.data.facts.some(f=>f.category==='activity'&&f.metric===m.id&&H.within(f,root)));
 const calendar=available.filter(m=>H.data.facts.some(f=>f.category==='activity'&&f.metric===m.id&&f.periodType!=='rolling30'&&H.within(f,root)));
 const selected=Array.isArray(s.metrics)?allMetrics.filter(m=>s.metrics.includes(m.id)):(calendar.length?calendar:available);
 const levels=s.level==='both'?['group','person']:[s.level],cards=selected.flatMap(m=>levels.map(l=>H.lbBuildMetric(m,l,s)));
 const rolling=available.filter(m=>!calendar.some(c=>c.id===m.id)).map(m=>m.label);
 return {title:'单项活动量标杆 TOP5',scope:H.label(root),range,level:s.level,role:s.role,selected,cards,allMetrics,rolling,notes:['各项单独排名，不合成总分；同量同名次，第5位同量全部保留。','仅排名已提供且大于0的数据；缺失不补0，不能拆分的跨周期汇总不入榜。','数量排名是标杆采访线索，不替代质量与转化核实。']};
};
H.lbPeriodText=card=>card.spans.length?card.spans.map(([a,b])=>a+'—'+b).join('；'):'暂无可用周期数据';
// Compact a large tie into one rank row while retaining every name and organization.
H.lbDisplayRows=card=>{
 const out=[];for(let i=0;i<card.rows.length;){let j=i+1;while(j<card.rows.length&&card.rows[j].rank===card.rows[i].rank)j++;
  const same=card.rows.slice(i,j);if(same.length>3)out.push({...same[0],members:same});else out.push(...same);i=j;
 }return out;
};
H.lbName=entity=>entity.level==='group'?entity.group:entity.person;
H.lbMeta=entity=>entity.level==='group'?entity.store:(entity.store+' · '+(entity.group||'').replace(entity.store,''));
})();
