/* Monthly activity imports. Source workbooks and employee data stay in the browser. */
'use strict';
(() => {
const H=HP,E=H.esc;
const previousPrepare=H.prepare,previousNormalize=H.normalize,previousReview=H.review;
const text=v=>String(v??'').trim();
const field=v=>{const name=text(v).replace(/^\[[^\]]+\]\s*/,'');return /^(?:hmall陪带人|陪带人)$/i.test(name)?'DESCRIPTION':name;};
const blank=v=>v===null||v===undefined||text(v)==='';
const result=()=>({facts:[],roster:[],flows:[],channels:[],issues:[],errors:[],check:{scope:'当前黄浦四店',rawRows:0,duplicates:0,outsideRegion:0,outsideStore:0,missingValues:0,summaryRows:0},rowCount:0});
const lastDay=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
const column=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const sourceDate=(v,date1904)=>H.importDate?H.importDate(v,date1904):H.date(v);
const monthText=v=>{const m=text(v).match(/^(\d{4})[-/]([0-9]{1,2})(?:月)?$/);return m&&Number(m[2])>=1&&Number(m[2])<=12?m[1]+'-'+m[2].padStart(2,'0'):'';};
const summaryLabel=v=>/^(?:合计|总计|小计|Total)$/i.test(text(v));
H.monthlyKinds={monthlyHouse:'每月买卖房源新增',monthlyChannel:'每月重点渠道新增与进入带看',monthlyViewing:'每月买卖带看',monthlyOwner:'每月业主面见',monthlyHmall:'每月 Hmall 陪带',monthlyReference:'同源校核表（不重复入表）'};
H.monthlyMetricDefs=[
 {id:'channelMonthEntered',g:'customer',label:'重点渠道当月进入带看',unit:'原表量',kind:'number',note:'使用源表“重点渠道当月进入带看”列，不替换当周或7天口径。'},
 {id:'channelMonthRate',g:'customer',label:'重点渠道当月进入带看率',unit:'%',kind:'rate',note:'同月进入带看合计÷重点渠道新增合计；分母为0或缺失时不计算。'}
];
for(const def of H.monthlyMetricDefs)if(!H.annualMetricDefs.some(m=>m.id===def.id))H.annualMetricDefs.push(def);
const monthlySpecs={
 monthlyHouse:{person:'录入人名称',metrics:[['newhouse','新增房-买卖']]},
 monthlyChannel:{person:'录入人',metrics:[['channel','重点渠道新增'],['channelMonthEntered','重点渠道当月进入带看']]},
 monthlyViewing:{person:'实际带看人',metrics:[['view','买卖带看次数']]},
 monthlyOwner:{person:'操作人名称',metrics:[['ownermeet','业主面见']]},
 monthlyHmall:{person:'DESCRIPTION',metrics:[['hmallassist','带看次数']]}
};
H.monthlySheetProbe=sheet=>{
 const rows=sheet.rows||[];
 for(let i=0;i<Math.min(rows.length,20);i++){
  const h=(rows[i]||[]).map(field),has=s=>h.includes(s);let kind='';
  if(has('月份')&&has('USER_CODE')&&has('DESCRIPTION')&&has('带看次数')&&has('PARENT_ORG_NAME'))kind='monthlyHmall';
  else if(has('店组')&&has('重点渠道新增')&&has('重点渠道当月进入带看')&&has('录入人'))kind='monthlyChannel';
  else if(has('店组')&&has('买卖带看次数')&&has('实际带看人'))kind='monthlyViewing';
  else if(has('店组')&&has('新增房-买卖')&&has('录入人名称'))kind='monthlyHouse';
  else if(has('店组')&&has('业主面见')&&has('操作人名称'))kind='monthlyOwner';
  if(!kind)continue;
  const dateIndex=h.indexOf(kind==='monthlyHmall'?'月份':'行为时间');
  if(dateIndex<0)return {kind,header:i,headers:h,monthly:false,months:[]};
  const raw=rows.slice(i+1).filter(r=>r.some(v=>!blank(v))&&!summaryLabel(r[h.indexOf('店组')])&&!summaryLabel(r[h.indexOf(monthlySpecs[kind].person)]));
  const dates=raw.map(r=>kind==='monthlyHmall'?monthText(r[dateIndex]):sourceDate(r[dateIndex],sheet.date1904));
  const valid=dates.filter(Boolean),months=[...new Set(valid.map(d=>d.slice(0,7)))].sort();
  // A single first-of-month Monday is ambiguous without an explicit month column.
  // Several month starts, or a month start that is not Monday, distinguish monthly
  // Sensors buckets from the existing Monday-based weekly exports.
  const allMonthStarts=valid.length>0&&valid.every(d=>kind==='monthlyHmall'||d.endsWith('-01'));
  const monthly=kind==='monthlyHmall'||allMonthStarts&&(months.length>1||valid.some(d=>new Date(d+'T00:00:00Z').getUTCDay()!==1))||sheet.monthlyGranularity==='month';
  return {kind,header:i,headers:h,dateIndex,months,monthly,invalidDates:dates.length-valid.length};
 }
 return null;
};
H.annotateMonthlyWorkbook=sheets=>{
 const detail=sheets.find(s=>text(s.name)==='明细数据'),probe=detail&&H.monthlySheetProbe(detail);
 if(!probe?.monthly||probe.kind==='monthlyHmall')return sheets;
 return sheets.map(s=>['汇总数据','明细数据','明细报表'].includes(text(s.name))?{...s,monthlyWorkbook:{kind:probe.kind,months:probe.months,detailSheet:detail.name},monthlyReference:text(s.name)!=='明细数据'}:s);
};
const readXlsx=H.readXlsx;
H.readXlsx=async(...args)=>H.annotateMonthlyWorkbook(await readXlsx(...args));
H.monthlySourceRange=(rows,file)=>{
 const embedded=H.sourcePeriod(rows);
 if(embedded)return {...embedded,evidence:'工作表筛选器'};
 const m=text(file).match(/(\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})/);
 if(m&&H.date(m[1])&&H.date(m[2])&&m[1]<=m[2])return {start:m[1],end:m[2],evidence:'文件名声明'};
 return null;
};
H.prepare=(sheet,file,hash)=>{
 const q=previousPrepare(sheet,file,hash),probe=H.monthlySheetProbe(sheet),family=sheet.monthlyWorkbook;
 const reference=!!sheet.monthlyReference||(['汇总数据','明细报表'].includes(text(sheet.name))&&(/SensorsAnalytics/i.test(file)||!!probe));
 if(!reference&&!probe?.monthly&&!family)return q;
 const kind=reference?'monthlyReference':family?.kind||probe.kind;
 const months=family?.months||probe?.months||[],range=H.monthlySourceRange(sheet.rows,file),header=probe?.header??q.header;
 Object.assign(q,{kind,kindLabel:H.monthlyKinds[kind],monthly:true,annual:true,category:'activity',header,rowNumbers:sheet.rowNumbers||q.rowNumbers,includeOtherStores:false,periodType:'monthly',sourceMonths:months,sourceMetrics:monthlySpecs[kind]?.metrics.map(x=>x[0])||[],start:months[0]?months[0]+'-01':'',end:months.length?lastDay(months.at(-1)):'',periodVerified:months.length>0||reference,referenceOnly:reference,monthlyReference:reference,importedAt:new Date().toISOString(),importBatchId:H.id()});
 delete q.observedThrough;
 if(range){q.sourceStart=range.start;q.sourceEnd=range.end;q.sourceRangeEvidence=range.evidence;q.observedThrough=range.end;}
 q.periodSummary=reference?'只校核原表，不与明细重复相加':months.length+'个月份；'+(months[0]||'待核')+'—'+(months.at(-1)||'待核');
 q.importNote=reference?'同一工作簿只使用“明细数据”。汇总数据和明细报表仅作为校核来源。':kind==='monthlyHmall'?'按月份、陪带员工和带看次数汇总；不使用实际带看人或房源套数代替。源表未提供的人员不补0。':'行为时间是月份桶，按月导入，不拆为周。只使用“明细数据”，明确0保留，空白与缺少人员不补0。';
 if(range&&!reference)q.importNote+=' 文件声明范围：'+range.start+'—'+range.end+'；月首日期不等于实际筛选开始日。';
 if(!range&&!reference)q.importNote+=' 源表未提供日级统计截止，保留原月数据并注明范围。';
 q.signature=JSON.stringify([kind,sheet.rows[header]||[]]);
 return q;
};
H.monthlyPeriod=(q,value)=>{
 const isHmall=q.kind==='monthlyHmall',date=isHmall?monthText(value):sourceDate(value,q.date1904);
 if(!date||!isHmall&&!date.endsWith('-01'))return null;
 const month=date.slice(0,7),start=month+'-01',end=lastDay(month),sourceStart=q.sourceStart||'',sourceEnd=q.sourceEnd||'';
 const rangeKnown=!!(H.date(sourceStart)&&H.date(sourceEnd)&&sourceStart<=sourceEnd),inRange=rangeKnown&&sourceStart<=end&&sourceEnd>=start;
 const partialStart=inRange&&sourceStart>start,partialEnd=inRange&&sourceEnd<end;
 const historicalPartialEnd=partialEnd&&month<H.today().slice(0,7);
 const observedThrough=inRange?(sourceEnd<end?sourceEnd:end):undefined;
 let coverageConfirmed=inRange&&!partialStart&&!historicalPartialEnd,coverageNote='';
 if(!rangeKnown)coverageNote='原表按月汇总，未提供日级统计截止；仅显示已提供记录。';
 else if(!inRange)coverageNote='月份桶超出文件声明范围，真实筛选期间待核；保留原值。';
 else if(partialStart)coverageNote='文件声明'+sourceStart+'—'+sourceEnd+'；月首是分组标签，不推断从1日起累计。';
 else if(historicalPartialEnd)coverageNote='文件声明统计截至'+sourceEnd+'，该月完整覆盖情况待核；保留原值。';
 else if(partialEnd)coverageNote='本月已提供至'+sourceEnd+'，不补齐月末。';
 if(isHmall&&!rangeKnown)coverageConfirmed=false;
 return {month,start,end,periodType:'monthly',periodLabel:month+'（原表月度）',periodComplete:!partialStart&&!partialEnd&&end<=H.today()&&(!rangeKnown||inRange),...(observedThrough?{observedThrough}:{}),coverageConfirmed,coverageNote,coverageStatus:!rangeKnown?'monthOnly':!inRange?'rangeMismatch':partialStart?'partialStart':partialEnd?'partialEnd':'fullMonth',displayAsterisk:q.kind==='monthlyOwner'&&historicalPartialEnd,sourceMonthBucket:value};
};
H.normalize=q=>{
 if(!q.monthly||!H.monthlyKinds[q.kind])return previousNormalize(q);
 const out=result();
 if(q.monthlyReference||q.kind==='monthlyReference'){out.referenceOnly=true;out.check.referenceOnly=true;out.check.sourceRows=H.sourceRows(q).length;out.check.note='仅校核同源展示表，不再次导入指标';return out;}
 const spec=monthlySpecs[q.kind],header=q.rows[q.header]||[],canonical=header.map(field),ci=name=>canonical.indexOf(name),rows=H.sourceRows(q),catalog=H.importCatalog(),facts=new Map(),events=new Map();
 const groupIndexes=canonical.map((v,i)=>v==='ORG_SHORT_NAME'?i:-1).filter(i=>i>=0);
 const hmall=q.kind==='monthlyHmall',groupIndex=hmall?groupIndexes.at(-1):ci('店组');
 const sourceStores=q.includeOtherStores?[...new Set(rows.filter(r=>!hmall||text(r.v[ci('PARENT_ORG_NAME')])==='黄浦大区').map(r=>H.storeFromGroup(text(r.v[groupIndex]))).filter(Boolean))]:[...H.importStores];
 const sourceMonths=[...q.sourceMonths],sourceMetrics=spec.metrics.map(x=>x[0]);
 const base={category:'activity',source:q.file+' / '+q.sheet,sourceFile:q.file,sourceSheet:q.sheet,sourceHash:q.hash,sourceKind:q.kind,sourceStores,importScopeStores:sourceStores,sourceMonths,sourceMetrics,sourcePopulationComplete:false,sourceCoverageOnly:true,importedOn:H.today(),importedAt:q.importedAt,importBatchId:q.importBatchId,sourceStart:q.sourceStart||'',sourceEnd:q.sourceEnd||'',sourceRangeEvidence:q.sourceRangeEvidence||'month bucket only',userConfirmedSource:!!q.userConfirmedSource};
 const put=(entity,period,metric,raw,r,fieldName,additive=false)=>{
  const value=H.num(raw),index=ci(fieldName),details={...entity,...base,...period,row:r.row,sourceRows:[r.row],sourceField:text(header[index]),sourceColumn:column(index),sourceValue:raw};
  if(value===null){out.check.missingValues++;out.issues.push({...details,type:'monthly-missing-value',metric,detail:'原表数值为空，不按0导入'});return;}
  if(!Number.isFinite(value)||value<0){out.errors.push('第'+r.row+'行 '+fieldName+'不是有效的非负数');return;}
  const fact={...details,metric,value},key=H.factKey(fact),old=facts.get(key);
  if(!old){facts.set(key,fact);return;}
  if(additive){old.value+=value;old.sourceRows.push(r.row);delete old.sourceValue;return;}
  if(old.value!==value)out.errors.push('同一人同一月份存在不同汇总值：第'+old.row+'行与第'+r.row+'行，请保留正确版本');
  else{old.sourceRows.push(r.row);out.check.duplicates++;}
 };
 for(const r of rows){
  out.check.rawRows++;const v=r.v;
  if(hmall&&text(v[ci('PARENT_ORG_NAME')])!=='黄浦大区'){out.check.outsideRegion++;continue;}
  const group=text(v[groupIndex]),store=H.storeFromGroup(group),person=text(v[ci(spec.person)]),personId=hmall?text(v[ci('USER_CODE')]):'';
  if([group,person].some(summaryLabel)){out.check.summaryRows++;continue;}
  if(!group||!person){out.issues.push({...base,row:r.row,store,group,person,type:'identity-missing',detail:'缺少店组或姓名，未分配给个人'});continue;}
  if(!H.importStores.includes(store)&&!q.includeOtherStores){out.check.outsideStore++;out.issues.push({...base,row:r.row,store,group,person,type:'outside-scope',values:v,detail:'未纳入当前黄浦四店，保留原始归属待核'});continue;}
  const period=H.monthlyPeriod(q,v[ci(hmall?'月份':'行为时间')]);
  if(!period){out.errors.push('第'+r.row+'行月份无效；月度数据的行为时间应为每月1日，不自动按周推断');continue;}
  const entity=H.annualIdentity(store,group,person,personId,catalog);
  if(hmall){
   const eventId=text(v[ci('带看ID')]);
   if(eventId){
    const key=JSON.stringify([period.month,eventId,personId||person,group,text(v[ci('类型')])]),prior=events.get(key),count=H.num(v[ci('带看次数')]);
    if(prior){if(prior.count!==count)out.errors.push('第'+r.row+'行陪带事件与第'+prior.row+'行同ID记录数量冲突');else out.check.duplicates++;continue;}
    events.set(key,{row:r.row,count});
   }else out.issues.push({...base,...entity,...period,row:r.row,type:'monthly-event-id-missing',detail:'原表缺少带看ID，按已提供行汇总次数，不能核对同文件内事件重复'});
  }
  for(const [metric,fieldName]of spec.metrics)put(entity,period,metric,v[ci(fieldName)],r,fieldName,hmall);
  if(q.kind==='monthlyChannel')for(const channel of ['网络','短彩微','陌拜','老客户、上门','盘户转化']){
   const index=ci(channel);if(index<0)continue;const n=H.num(v[index]);
   if(n!==null&&Number.isFinite(n)&&n>=0)out.channels.push({...entity,...base,...period,channel,new:n,row:r.row,sourceField:text(header[index]),sourceColumn:column(index)});
  }
  out.rowCount++;
 }
 out.facts=[...facts.values()];
 for(const fact of out.facts)out.check[fact.metric]=(out.check[fact.metric]||0)+fact.value;
 out.check.sourceStores=sourceStores;out.check.sourceMonths=sourceMonths;out.check.sourceMetrics=sourceMetrics;
 out.check.monthlySources=sourceMonths.map(month=>({month,stores:sourceStores,metrics:sourceMetrics,sourceKind:q.kind,sourceFile:q.file,sourceHash:q.hash,sourceSheet:q.sheet}));
 out.check.coverageNotes=[...new Set(out.facts.map(f=>f.coverageNote).filter(Boolean))];
 out.check.scope=q.includeOtherStores?'源表所选店组':'当前黄浦四店';
 return out;
};
const ensureAnnualMetrics=H.ensureAnnualMetrics;
H.ensureAnnualMetrics=()=>{
 ensureAnnualMetrics();
 if(H.data.facts.some(f=>f.metric==='channelMonthEntered')&&![...H.data.metrics,...H.data.archivedMetrics].some(m=>m.id==='channelMonthRate'))H.data.archivedMetrics.push({...H.monthlyMetricDefs.find(m=>m.id==='channelMonthRate')});
};
H.review=id=>{
 const q=H.ui.queue.find(x=>x.id===id);if(!q?.monthly)return previousReview(id);
 const r=H.normalize(q),headers=q.rows[q.header]||[],spec=monthlySpecs[q.kind];
 const mapped=spec?spec.metrics.map(([metric,name])=>{const i=headers.findIndex(h=>field(h)===name);return `<tr><td>${E(column(i))}</td><td>${E(headers[i]||name)}</td><td>${E((H.monthlyMetricDefs.find(m=>m.id===metric)||H.meta(metric)).label)}</td><td>${H.fmt(r.check[metric]??null)}</td></tr>`;}).join(''):'';
 H.modal('核对底表｜'+q.kindLabel,`<p>${E(q.file)} / ${E(q.sheet)}</p><div class="notice"><b>${E(q.periodSummary)}</b><br>${E(q.importNote)}</div>${mapped?`<div class="table-scroll"><table><thead><tr><th>源列</th><th>原字段</th><th>看板指标</th><th>源记录合计</th></tr></thead><tbody>${mapped}</tbody></table></div>`:''}<p>${r.rowCount}行有效范围记录；${r.facts.length}项个人指标。${r.check.duplicates?'重复记录'+r.check.duplicates+'项只计一次。':''}${r.check.missingValues?'空值'+r.check.missingValues+'项保留待补。':''}</p>${(r.check.coverageNotes||[]).map(note=>`<p class="subtle">${E(note)}</p>`).join('')}${r.errors.length?`<div class="notice warn">${r.errors.map(E).join('<br>')}</div>`:''}<label class="flex"><input id="import-confirmed" type="checkbox">已核对原字段、月份与来源范围。</label><div id="import-validation"></div>`,`<button class="btn" onclick="HP.close()">取消</button><button class="btn primary" onclick="HP.validateQ('${E(id)}')">核对并保存</button>`);
};
const finishImport=H.finishImport;
H.finishImport=async()=>{
 // The existing confirmation remains the transaction boundary; accepting a
 // source does not turn its unknown date coverage into a complete month.
 const importedAt=new Date().toISOString(),importBatchId=H.id();
 for(const f of H.pendingImport?.facts||[])if(H.monthlyKinds[f.sourceKind])Object.assign(f,{userConfirmedSource:true,importedAt,importBatchId});
 return finishImport();
};
})();
