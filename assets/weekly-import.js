/* Multi-sheet activity imports. Source records stay in the local browser. */
'use strict';
(() => {
const H=HP, E=H.esc, DAY=864e5;
H.version='3.4';
H.importStores=['新天地一店','新天地二店','黄浦滨江店','复兴香园店'];
H.storeFromGroup=group=>String(group||'').trim().replace(/[A-Za-zＡ-Ｚａ-ｚ0-9]+组$/,'');
H.importDate=(value,date1904=false)=>H.date(date1904&&typeof value==='number'?value+1462:value);
H.addDays=(date,n)=>new Date(new Date(date+'T00:00:00Z').getTime()+n*DAY).toISOString().slice(0,10);
H.annualKinds={weeklyHouse:'每周房源新增',weeklyMeet:'每周业主面见',weeklyChannel:'每周重点渠道',weeklyMedia:'每周自媒体上户',monthlyHmall:'每月 Hmall 陪带',undatedViewing:'带看汇总（日期待补）'};
H.annualMetricDefs=[
 {id:'hmallassist',g:'house',label:'Hmall陪带量',unit:'次',kind:'number',note:'按陪带员工归属累计带看次数，不使用实际带看人或房源套数代替。'},
 {id:'channelWeekEntered',g:'customer',label:'重点渠道当周进入带看',unit:'原表量',kind:'number'},
 {id:'channelWeekRate',g:'customer',label:'重点渠道当周进入带看率',unit:'%',kind:'rate',note:'汇总进入带看量÷汇总重点渠道新增量；不平均每周百分比，不等同于7天进入一带率。'},
 {id:'hmallhouses',g:'house',label:'Hmall陪带房源套次',unit:'套次',kind:'number'}
];
H.ensureAnnualMetrics=()=>{
 const ids=new Set(H.data.facts.map(f=>f.metric));
 for(const def of H.annualMetricDefs){
  if(!ids.has(def.id))continue;
  const existing=[...H.data.metrics,...H.data.archivedMetrics].find(m=>m.id===def.id);
  if(!existing)(def.id==='hmallhouses'?H.data.archivedMetrics:H.data.metrics).push({...def});
 }
 for(const id of ['hmallpending','viewrate']){
  const replacing=id==='hmallpending'?'hmallassist':'channelWeekRate';
  const m=H.data.metrics.find(m=>m.id===id);
  if(m&&ids.has(replacing)&&!ids.has(id)&&H.defaultMetrics.some(d=>d.id===id&&d.label===m.label)){
   H.data.metrics=H.data.metrics.filter(x=>x.id!==id);if(!H.data.archivedMetrics.some(x=>x.id===id))H.data.archivedMetrics.push(m);
  }
 }
 for(const id of ['ownermeet','media']){const m=H.data.metrics.find(m=>m.id===id);if(m&&ids.has(id)&&['口径待核','范围待确认'].includes(m.unit))m.unit='原表量';}
};
const prepare=H.prepare, normalize=H.normalize;
H.prepare=(sheet,file,hash)=>{
 const q=prepare(sheet,file,hash);q.rowNumbers=sheet.rowNumbers;
 const candidates=sheet.rows.slice(0,20);let header=-1,kind='';
 for(let i=0;i<candidates.length;i++){
  const r=candidates[i].map(x=>String(x||'').trim());
  if(r.includes('月份')&&r.includes('USER_CODE')&&r.includes('HMALL房源数量'))kind='monthlyHmall';
  else if(r.includes('行为时间')&&r.includes('[A] 新增房-买卖'))kind='weeklyHouse';
  else if(r.includes('行为时间')&&r.includes('[A] 业主面见'))kind='weeklyMeet';
  else if(r.includes('行为时间')&&r.includes('重点渠道当周进入带看'))kind='weeklyChannel';
  else if(r.includes('行为时间')&&r.includes('自媒体上户量'))kind='weeklyMedia';
  else if(r.includes('实际带看人')&&r.includes('[A] 买卖带看次数'))kind='undatedViewing';
  if(kind){header=i;break;}
 }
 if(!kind)return q;
 Object.assign(q,{annual:true,kind,header,category:'activity',includeOtherStores:false,observedThrough:H.today(),periodVerified:kind!=='undatedViewing',periodType:kind==='monthlyHmall'?'monthly':kind==='undatedViewing'?'range':'weekly'});
 const rows=sheet.rows.slice(header+1),h=sheet.rows[header],dates=[];
 for(const r of rows){
  if(kind==='monthlyHmall'){
   const m=String(r[h.indexOf('月份')]||'').match(/^(\d{4})-(\d{1,2})$/);
   if(m){const start=m[1]+'-'+m[2].padStart(2,'0')+'-01',end=new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).toISOString().slice(0,10);dates.push([start,end]);}
  }else if(kind!=='undatedViewing'){const start=H.importDate(r[h.indexOf('行为时间')],sheet.date1904);if(start)dates.push([start,H.addDays(start,6)]);}
 }
 if(dates.length){q.start=dates.map(x=>x[0]).sort()[0];q.end=dates.map(x=>x[1]).sort().at(-1);}
 else if(kind==='undatedViewing'){q.start='';q.end='';}
 q.periodCount=new Set(dates.map(x=>x.join('|'))).size;
 q.periodSummary=kind==='undatedViewing'?'原表没有日期，请补选统计起止':kind==='monthlyHmall'?q.periodCount+'个月份；'+q.start.slice(0,7)+'—'+q.end.slice(0,7):q.periodCount+'个周标；'+q.start+'—'+(dates.map(x=>x[0]).sort().at(-1)||'');
 q.importNote=kind==='monthlyHmall'?'按月份累计，不能拆成周；仅纳入源表标注黄浦大区的陪带员工。':kind==='weeklyChannel'?'新增总数使用原表总列；当周进入带看率重新用分子÷分母计算。':kind==='undatedViewing'?'不会根据文件名或上传时间猜测日期。':'行为时间为周开始；月度按完整周累计，缺少记录不补0。';
 q.signature=JSON.stringify([kind,h]);return q;
};
// Compact XLSX rows retain original row numbers, including generic imports.
H.sourceRows=q=>{const hdr=q.rows[q.header]||[];return q.rows.slice(q.header+1).map((v,i)=>({v,index:q.header+i+1,row:q.rowNumbers?.[q.header+i+1]||q.header+i+2,o:Object.fromEntries(hdr.map((h,j)=>[h,v[j]??'']))})).filter(r=>r.v.some(x=>x!==''&&x!==null&&x!==undefined)&&!String(r.v[0]).startsWith('应用的筛选器'));};
H.annualIdentity=(store,group,person,personId='',catalog=H.roster())=>{
 const byId=personId?catalog.find(r=>r.personId===personId):null;
 const scoped=catalog.filter(r=>r.person===person&&r.store===store&&r.group===group);
 const unique=[...new Map(scoped.map(r=>[r.personId||H.key(r),r])).values()];
 const known=byId||(unique.length===1?unique[0]:null);
 return {level:'person',store,group,person,personId:personId||known?.personId||'',...(known?{role:known.role,joinDate:known.joinDate,grade:known.grade}: {})};
};
H.importCatalog=()=>{
 const current=[...H.roster(),...(H.ui.queue||[]).flatMap(q=>q.verifiedResult?.roster||[])],map=new Map(current.map(r=>[JSON.stringify([r.store,r.group,r.person,r.personId]),r]));
 for(const q of H.ui.queue||[]){
  if(q.kind==='monthlyHmall')for(const r of H.sourceRows(q)){
   if(r.v[3]!=='黄浦大区')continue;const group=String(r.v[5]||''),person=String(r.v[7]||''),personId=String(r.v[6]||''),store=H.storeFromGroup(group);if(!person||!personId)continue;
   const known=current.find(x=>x.personId===personId);const item={...known,person,personId,store,group};map.set(JSON.stringify([store,group,person,personId]),item);
  }
  if(q.kind==='performanceAnnual'&&H.performanceExtract)for(const r of H.performanceExtract(q).rows){const known=current.find(x=>x.personId===r.personId);const item={...known,person:r.person,personId:r.personId,store:r.store,group:r.group};map.set(JSON.stringify([r.store,r.group,r.person,r.personId]),item);}
 }
 return [...map.values()];
};
const pendingRoster=H.refreshPendingRoster;
H.refreshPendingRoster=()=>{pendingRoster();H.pendingRoster.push(...(H.ui.queue||[]).flatMap(q=>q.verifiedResult?.roster||[]));};
H.reconcileImportIdentities=data=>{
 const identity=new Map(),key=r=>JSON.stringify([r.store||'',r.group||'',r.person||'']);
 for(const r of [...data.novRoster,...data.facts,...data.novUnassigned])if(r.person&&r.personId){const k=key(r);if(!identity.has(k))identity.set(k,new Set());identity.get(k).add(r.personId);}
 for(const records of [data.facts,data.novChannels,data.novUnassigned])for(const r of records)if(r.person&&!r.personId){const ids=identity.get(key(r));if(ids?.size===1)r.personId=[...ids][0];}
 data.facts=[...new Map(data.facts.map(f=>[H.factKey(f),f])).values()];
 data.novChannels=[...new Map(data.novChannels.map(c=>[JSON.stringify([c.store,c.group,c.personId||c.person,c.channel,c.start,c.end]),c])).values()];
 return data;
};
H.annualPeriod=(q,value)=>{
 if(q.kind==='monthlyHmall'){
  const m=String(value||'').match(/^(\d{4})-(\d{1,2})$/);if(!m||Number(m[2])<1||Number(m[2])>12)return null;
  const start=m[1]+'-'+m[2].padStart(2,'0')+'-01',end=new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).toISOString().slice(0,10);
  return {start,end,periodType:'monthly',periodLabel:m[1]+'年'+Number(m[2])+'月（原表月度）'};
 }
 if(q.kind==='undatedViewing')return H.date(q.start)&&H.date(q.end)&&q.start<=q.end?{start:q.start,end:q.end,periodType:'range',periodLabel:q.start+'—'+q.end+'（手动确认）'}:null;
 const start=H.importDate(value,q.date1904);if(!start)return null;
 const end=H.addDays(start,6);return {start,end,periodType:'weekly',periodLabel:start+'—'+end+'（周增量）'};
};
H.annualParents=rows=>{
 const sums=new Map();
 for(const f of rows){if(f.level!=='person')continue;
  for(const e of [{level:'group',store:f.store,group:f.group,person:'',personId:''},{level:'store',store:f.store,group:'',person:'',personId:''},{level:'region',store:'',group:'',person:'',personId:''}]){
   const key=H.factKey({...f,...e});let item=sums.get(key);
   if(!item){item={...f,...e,value:0,derived:true,derivedFromAnnualPeople:true,sourceCoverageOnly:true,sourceRows:[],sourceField:'已导入人员记录汇总：'+f.sourceField};delete item.role;delete item.joinDate;delete item.grade;item.numerator=f.numerator===undefined?undefined:0;item.denominator=f.denominator===undefined?undefined:0;sums.set(key,item);}
   item.value+=f.value;item.sourceRows.push(...(f.sourceRows||[f.row]));
   if(f.numerator!==undefined)item.numerator+=f.numerator;
   if(f.denominator!==undefined)item.denominator+=f.denominator;
   if(f.periodComplete===false)item.periodComplete=false;
  }
 }
 for(const f of sums.values()){f.sourceRows=[...new Set(f.sourceRows)].sort((a,b)=>a-b);if(f.numerator!==undefined)f.value=f.denominator>0?100*f.numerator/f.denominator:0;}
 return [...sums.values()];
};
H.normalize=q=>{
 if(!q.annual||!H.annualKinds[q.kind])return normalize(q);
 const out={facts:[],roster:[],flows:[],channels:[],issues:[],errors:[],check:{scope:'当前黄浦四店',outsideRegion:0,outsideStore:0,duplicates:0,rawRows:0},rowCount:0};
 const undated=q.kind==='undatedViewing'&&!H.annualPeriod(q);
 if(undated&&(q.start||q.end)){out.errors.push('请同时填写真实的统计开始和结束日期；也可留空保存为待补日期。');return out;}
 if(undated){out.referenceOnly=true;out.check.datePending=true;}
 const catalog=H.importCatalog(),h=q.rows[q.header],ci=k=>h.indexOf(k),groups=new Map(),events=new Map(),undatedSeen=new Map();
 const src={category:'activity',source:q.file+' / '+q.sheet,sourceFile:q.file,sourceSheet:q.sheet,sourceHash:q.hash,observedThrough:q.observedThrough||H.today()};
 const put=(e,p,metric,raw,row,field,extra={},additive=false)=>{
  const n=H.num(raw);if(n===null)return;
  if(!Number.isFinite(n)||n<0){out.errors.push('第'+row+'行 '+field+'不是有效的非负数');return;}
  const fact={...e,...src,...p,periodComplete:p.end<=src.observedThrough,sourceCoverageOnly:true,metric,value:n,row,sourceField:field,sourceRows:[row],...extra};
  const key=H.factKey(fact),old=groups.get(key);
  if(!old){groups.set(key,fact);return;}
  if(additive){old.value+=n;old.sourceRows.push(row);return;}
  if(old.value!==fact.value||old.numerator!==fact.numerator||old.denominator!==fact.denominator)out.errors.push('同一人同一周期存在不同汇总值：第'+old.row+'行与第'+row+'行，请保留正确版本');
  else out.check.duplicates++;
 };
 for(const r of H.sourceRows(q)){
  out.check.rawRows++;const v=r.v,hm=q.kind==='monthlyHmall';
  if(hm&&String(v[ci('PARENT_ORG_NAME')]||'').trim()!=='黄浦大区'){out.check.outsideRegion++;continue;}
  const group=String(hm?v[5]:v[ci('店组')]||'').trim(),store=H.storeFromGroup(group);
  const person=String(hm?v[ci('DESCRIPTION')]:q.kind==='weeklyHouse'?v[ci('录入人名称')]:q.kind==='weeklyMeet'?v[ci('操作人名称')]:q.kind==='weeklyChannel'?v[ci('录入人')]:q.kind==='weeklyMedia'?v[ci('客源维护人')]:v[ci('实际带看人')]).trim();
  if([group,person].some(s=>/^(?:合计|总计|小计|Total)$/i.test(s))){out.check.summaryRows=(out.check.summaryRows||0)+1;continue;}
  if(!group||!person||person==='undefined'){out.issues.push({...src,row:r.row,store,group,person:person==='undefined'?'':person,type:'identity-missing',detail:'缺少姓名或店组，未分配给个人'});continue;}
  if(!H.importStores.includes(store)&&!q.includeOtherStores){out.check.outsideStore++;out.issues.push({...src,row:r.row,store,group,person,type:'outside-scope',values:v,detail:'未纳入当前黄浦四店；原始记录保留待核对历史归属'});continue;}
  if(undated){const amount=H.num(v[ci('[A] 买卖带看次数')]),key=JSON.stringify([store,group,person]);if(undatedSeen.has(key)){if(undatedSeen.get(key)!==amount)out.errors.push('第'+r.row+'行同一人的无日期带看汇总值冲突');else out.check.duplicates++;continue;}undatedSeen.set(key,amount);if(amount!==null&&Number.isFinite(amount)&&amount>=0){out.issues.push({...H.annualIdentity(store,group,person,'',catalog),...src,row:r.row,type:'undated-activity',metric:'view',value:amount,sourceField:'[A] 买卖带看次数',detail:'原表没有统计日期，已保存，暂不计入周／月／年'});out.check.view=(out.check.view||0)+amount;out.rowCount++;}else if(amount!==null)out.errors.push('第'+r.row+'行带看量无效');continue;}
  const p=H.annualPeriod(q,hm?v[ci('月份')]:v[ci('行为时间')]);
  if(!p){out.errors.push('第'+r.row+'行日期无效');continue;}
  if(p.periodType==='weekly'&&new Date(p.start+'T00:00:00Z').getUTCDay()!==1){out.errors.push('第'+r.row+'行周开始不是周一，请核对行为时间口径');continue;}
  const e=H.annualIdentity(store,group,person,hm?String(v[ci('USER_CODE')]||''):'',catalog);
  if(hm){
   const eventKey=JSON.stringify([p.start,v[ci('带看ID')],e.personId||person,group,v[ci('类型')]]),old=events.get(eventKey);
   if(old){if(old[ci('带看次数')]!==v[ci('带看次数')]||old[ci('HMALL房源数量')]!==v[ci('HMALL房源数量')])out.errors.push('第'+r.row+'行陪带事件与已有同ID记录冲突');else out.check.duplicates++;continue;}
   events.set(eventKey,v);put(e,p,'hmallassist',v[ci('带看次数')],r.row,'带看次数',{},true);put(e,p,'hmallhouses',v[ci('HMALL房源数量')],r.row,'HMALL房源数量',{},true);
  }else if(q.kind==='weeklyChannel'){
   const den=H.num(v[ci('重点渠道新增')]),num=H.num(v[ci('重点渠道当周进入带看')]);
   put(e,p,'channel',den,r.row,'重点渠道新增');put(e,p,'channelWeekEntered',num,r.row,'重点渠道当周进入带看');
   if(Number.isFinite(den)&&Number.isFinite(num)&&den>=0&&num>=0)put(e,p,'channelWeekRate',den>0?num/den*100:0,r.row,'当周进入带看/重点渠道新增',{numerator:num,denominator:den});
   for(const field of ['网络','短彩微','陌拜','老客户、上门','盘户转化']){const n=H.num(v[ci(field)]);if(n!==null&&Number.isFinite(n))out.channels.push({...e,...src,...p,channel:field,new:n,row:r.row,sourceField:field});}
  }else{
   const [metric,field]=q.kind==='weeklyHouse'?['newhouse','[A] 新增房-买卖']:q.kind==='weeklyMeet'?['ownermeet','[A] 业主面见']:q.kind==='weeklyMedia'?['media','自媒体上户量']:['view','[A] 买卖带看次数'];
   put(e,p,metric,v[ci(field)],r.row,field);
  }
  out.rowCount++;
 }
 out.facts=[...groups.values()];
 for(const f of out.facts){if(f.numerator===undefined)out.check[f.metric]=(out.check[f.metric]||0)+f.value;}
 out.facts.push(...H.annualParents(out.facts));return out;
};
// Small progress messages replace the old all-or-nothing file read.
H.readFiles=async files=>{
 if(H.ui.reading){H.toast('正在读取文件，请稍候');return;}H.ui.reading=true;
 const progress=text=>{H.ui.readProgress=text;const el=document.getElementById('read-progress');if(el)el.textContent=text;};
 try{for(const file of [...files]){
  progress('正在读取 '+file.name);H.render();
  try{
   if(file.size>25*1024*1024)throw Error('单个文件超过25MB');
   if(file.type.startsWith('image/')){H.ui.images.push({name:file.name,url:URL.createObjectURL(file)});continue;}
   if(/\.json$/i.test(file.name)){
    const parsed=JSON.parse(await file.text());
    if(parsed.format==='huangpu-verified-import-v1'){H.loadVerifiedImport(parsed,file.name);continue;}
    await H.restore(file);continue;
   }
   const bytes=await file.arrayBuffer(),hash=await H.hash(bytes);
   if(H.ui.queue.some(q=>q.hash===hash&&q.status!=='error')){H.toast(file.name+' 已在本次队列中');continue;}
   H.ui.queue=H.ui.queue.filter(q=>!(q.file===file.name&&q.status==='error'));
   let sheets;
   if(/\.xlsx$/i.test(file.name))sheets=await H.readXlsx(bytes,{onProgress:i=>progress('读取子表 '+i.index+'/'+i.total+'：'+i.sheet+' · '+i.dataRows+'行')});
   else if(/\.(csv|tsv|txt)$/i.test(file.name)){let txt=new TextDecoder().decode(bytes);if(txt.includes('\ufffd'))txt=new TextDecoder('gb18030').decode(bytes);sheets=[{name:'文本表',rows:H.csv(txt)}];}
   else throw Error('支持.xlsx、CSV、TSV、图片及JSON数据包');
   for(const sheet of sheets)H.ui.queue.push(H.prepare(sheet,file.name,hash));
  }catch(e){H.ui.queue.push({id:H.id(),file:file.name,sheet:'',status:'error',error:e.message});}
 }}finally{H.ui.reading=false;H.ui.readProgress='';H.render();H.toast('已读取各子表；可一键核对日期明确的表');}
};
const priorNormalize=H.normalize;
H.normalize=q=>q.kind==='verifiedPackage'?H.clone(q.verifiedResult):priorNormalize(q);
H.loadVerifiedImport=(data,file)=>{
 if(!Array.isArray(data.sheets)||data.sheets.length>100)throw Error('已核对数据包格式无效');
 let count=0;const prepared=[];
 for(const sheet of data.sheets){
  const r=H.clone(sheet.result);if(!r||!Array.isArray(r.facts)||!Array.isArray(r.roster))throw Error('数据包缺少指标或名单数组');
  for(const k of ['flows','channels','issues','errors']){if(r[k]===undefined)r[k]=[];if(!Array.isArray(r[k]))throw Error('数据包数组无效：'+k);}
  if(r.errors.length)throw Error('数据包含未解决的核对问题');
  if(!r.check||typeof r.check!=='object')r.check={};
  count+=r.facts.length;if(count>200000)throw Error('数据包记录数超限');
  for(const f of r.facts)if(!Number.isFinite(f.value)||!H.date(f.start)||!H.date(f.end)||f.start>f.end||!/^[a-zA-Z0-9_-]+$/.test(f.metric))throw Error('数据包含无效指标值或日期');
  const source=sheet.source||{},hash=source.hash||data.createdAt||file;
  if([...H.ui.queue,...prepared].some(q=>q.hash===hash&&q.sheet===source.sheet&&q.status!=='error'))continue;
  prepared.push({id:H.id(),file:source.file||file,sheet:source.sheet||'已核对数据',hash,kind:'verifiedPackage',annual:true,status:'ready',category:source.category||'activity',start:source.start||'',end:source.end||'',periodType:source.periodType||'range',periodSummary:source.periodSummary||'保留每项来源日期',importNote:source.importNote||'已核对数据包，追加合并；不替换整个工作台。',importPurpose:source.importPurpose||'已核对底表',preserveExistingRoster:!!source.preserveExistingRoster,verifiedResult:r,result:r,mapping:[],signature:'verifiedPackage'});
 }
 H.ui.queue.push(...prepared);
};
H.overlappingSnapshots=incoming=>H.data.facts.filter(old=>!['weekly','monthly','rolling30'].includes(old.periodType)&&incoming.some(f=>['weekly','monthly'].includes(f.periodType)&&f.category===old.category&&f.metric===old.metric&&H.same(f,old)&&f.start<=old.end&&f.end>=old.start));
H.commitImports=()=>{
 const qs=H.ui.queue.filter(q=>q.status==='ready');if(!qs.length){H.toast('请先核对底表');return;}H.refreshPendingRoster();
 const stage=qs.map(q=>({q,r:H.normalize(q)})),errors=stage.flatMap(x=>x.r.errors),facts=new Map(),channels=new Map();
 for(const {r}of stage){for(const f of r.facts){const k=H.factKey(f),old=facts.get(k);if(old&&Math.abs(old.value-f.value)>1e-8&&!f.derivedFromAnnualPeople&&!old.derivedFromAnnualPeople)errors.push('本次不同来源存在不同值：'+(f.person||f.group||f.store||'大区')+' / '+H.meta(f.metric).label);else facts.set(k,f);}for(const c of r.channels||[])channels.set(JSON.stringify([c.store,c.group,c.personId||c.person,c.channel,c.start,c.end]),c);}
 if(errors.length){H.modal('先处理导入问题','<div class="notice warn">'+errors.slice(0,20).map(E).join('<br>')+'</div>');return;}
 const list=[...facts.values()],oldMap=new Map(H.data.facts.map(f=>[H.factKey(f),f])),changed=list.filter(f=>!f.derivedFromAnnualPeople&&oldMap.has(H.factKey(f))&&Math.abs(oldMap.get(H.factKey(f)).value-f.value)>1e-8),retire=H.overlappingSnapshots(list);
 H.pendingImport={stage,facts:list,channels:[...channels.values()],retire};
 const sources=[...new Set(retire.map(f=>H.sourceFile(f,'facts')))];
 H.modal('确认入表',`<p><b>${qs.length}张子表</b>；${list.filter(f=>!f.derivedFromAnnualPeople).length}项原始指标；${stage.reduce((s,x)=>s+x.r.roster.length,0)}条人员资料。</p><div class="notice">本次追加合并，同一人、同一指标、同一周只保留一份。店组和门店根据人员数据自动累计；空白不补0。</div>${changed.length?`<p>${changed.length}项与已保存的同周期数值不同，确认后更新为本批次。</p>`:''}${retire.length?`<div class="notice warn weekly-overlap"><b>发现${retire.length}项旧累计与本批次周／月数据重叠。</b><p>${sources.map(E).join('；')}</p><label class="flex"><input id="retire-overlap" type="checkbox" checked>以本批次周／月明细为准，重叠旧指标移入回收记录</label><small>只移动重叠指标；其他数据、表头和待办保留。可在数据导入的回收记录恢复。</small></div>`:''}<p class="subtle">没有日期的记录保留待补；未明确的管理者业绩单独展示。确认后更新活动量与分析看板。</p>`,`<button class="btn" onclick="HP.close()">取消</button><button class="btn primary" onclick="HP.finishImport()">确认合并并更新看板</button>`);
};
// Transactional additive import: rollback memory if IndexedDB cannot save.
H.finishImport=async()=>{
 const p=H.pendingImport;if(!p||H.ui.committing)return;H.ui.committing=true;
 try{
  const next=H.clone(H.data),retired=p.retire?.length&&document.getElementById('retire-overlap')?.checked?p.retire:[],retireKeys=new Set(retired.map(H.factKey));
  const map=new Map(next.facts.filter(f=>!f.derivedFromAnnualPeople&&!retireKeys.has(H.factKey(f))).map(f=>[H.factKey(f),f]));for(const f of p.facts)if(!f.derivedFromAnnualPeople)map.set(H.factKey(f),f);next.facts=[...map.values()];
  for(const file of [...new Set(retired.map(f=>H.sourceFile(f,'facts')))]){const rows=retired.filter(f=>H.sourceFile(f,'facts')===file);next.sourceTrash.push({id:H.id(),file,deletedAt:new Date().toISOString(),info:{counts:{activityFacts:rows.length}},removed:{facts:H.clone(rows)},reason:'以新周／月明细替换重叠旧累计'});}
  const channelKey=c=>JSON.stringify([c.store,c.group,c.personId||c.person,c.channel,c.start,c.end]);
  const channels=new Map(next.novChannels.map(c=>[channelKey(c),c]));for(const c of p.channels)channels.set(channelKey(c),c);next.novChannels=[...channels.values()];
  const flows=new Map(next.flowFacts.map(f=>[JSON.stringify([f.store,f.group,f.personId||f.person,f.estate,f.business,f.start,f.end]),f]));
  const roster=new Map(next.novRoster.map(r=>[r.personId||[r.store,r.group,r.person].join('|'),r]));
  const issues=new Map(next.novUnassigned.map(x=>[JSON.stringify([x.sourceFile||x.source,x.sourceSheet||'',x.row,x.type||'']),x]));
  for(const {q,r}of p.stage){
   for(const row of r.roster){const key=row.personId||[row.store,row.group,row.person].join('|');if(!roster.has(key)||!q.preserveExistingRoster)roster.set(key,row);}
   for(const f of r.flows||[])flows.set(JSON.stringify([f.store,f.group,f.personId||f.person,f.estate,f.business,f.start,f.end]),f);
   for(const issue of r.issues)issues.set(JSON.stringify([issue.sourceFile||issue.source,issue.sourceSheet||'',issue.row,issue.type||'']),issue);
   const purpose=q.kindLabel||H.annualKinds[q.kind]||q.importPurpose||q.kind;
   if(!next.history.some(x=>x.hash===q.hash&&x.sheet===q.sheet))next.history.push({id:H.id(),file:q.file,sheet:q.sheet,hash:q.hash,purpose,start:q.start,end:q.end,periodType:q.periodType,at:new Date().toISOString(),rowCount:r.rowCount,check:r.check});
   next.novAudit=next.novAudit.filter(x=>!(x.file===q.file&&x.sheet===q.sheet));
   next.novAudit.push({file:q.file,sheet:q.sheet,purpose,period:q.periodSummary||(q.start+'—'+q.end),status:r.referenceOnly?'校核，不重复计数':'已接入',rows:r.rowCount,detail:q.importNote||JSON.stringify(r.check||{})});
   if(q.signature&&q.mapping?.length)next.presets[q.signature]={mapping:q.mapping,multiplier:q.multiplier};
  }
  next.novRoster=[...roster.values()];next.novUnassigned=[...issues.values()];next.flowFacts=[...flows.values()];
  H.reconcileImportIdentities(next);
  const datedViewRows=new Set(p.facts.filter(f=>f.metric==='view').map(f=>JSON.stringify([f.sourceFile,f.sourceSheet,f.row])));
  next.novUnassigned=next.novUnassigned.filter(r=>r.type!=='undated-activity'||!datedViewRows.has(JSON.stringify([r.sourceFile,r.sourceSheet,r.row])));
  const old=H.data;H.data=next;H.ensureImportedMetrics();H.ensureAnnualMetrics();H.data=old;
  if(!await H.changeDataSafely(next))return;
  for(const {q}of p.stage)q.status='imported';
  const newEnds=p.facts.filter(f=>H.date(f.start)).map(f=>f.start).sort();
  if(newEnds.length){const d=newEnds.at(-1);H.ui.start=d.slice(0,7)+'-01';H.ui.end=new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7)),0)).toISOString().slice(0,10);H.ui.period='month';H.ui.leaderboard={...(H.ui.leaderboard||{}),mode:'month',anchor:H.ui.start,level:H.ui.leaderboard?.level||'both',role:H.ui.leaderboard?.role||'顾问',metrics:null};}
  H.pendingImport=null;H.close();H.render();H.toast('已追加合并，周／月／年看板已更新');
 }catch(e){H.toast('导入未完成：'+e.message);}finally{H.ui.committing=false;}
};
})();
