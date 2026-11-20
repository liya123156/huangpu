'use strict';
// All rows below are fabricated fixtures. No uploaded personnel/business data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),messages=[];
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},getElementById(id){return elements.get(id)||null},querySelector(){return null}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','xlsx-reader','views','organization-model','organization-ui','data-management','interface-v32','leaderboard-model','leaderboard-ui','weekly-model','weekly-import','performance-import','weekly-ui'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;H.today=()=> '2026-11-20';H.render=()=>{};H.close=()=>{};H.toast=m=>messages.push(m);H.modal=(...args)=>{H.lastModal=args};H.save=async()=>true;
const store=H.importStores[0],group=store+'A组';
const serial=date=>(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/864e5;
const headers={
 house:['行为时间','店组','录入人名称','[A] 新增房-买卖'],
 meet:['行为时间','店组','操作人名称','[A] 业主面见'],
 media:['行为时间','店组','客源维护人','自媒体上户量'],
 view:['店组','实际带看人','[A] 买卖带看次数'],
 channel:['行为时间','店组','录入人','重点渠道新增','网络','短彩微','陌拜','老客户、上门','盘户转化','重点渠道当周进入带看','重点渠道当周进入带看率'],
 hmall:['城市','月份','带看ID','PARENT_ORG_NAME','ORG_SHORT_NAME','ORG_SHORT_NAME','USER_CODE','DESCRIPTION','带看次数','ACTUAL_USERNAME','委托类型','类型','HMALL房源数量','是否为带看']
};
const make=(kind,body,name=kind+'.xlsx',options={})=>H.prepare({name:kind,rows:[headers[kind],...body],rowNumbers:[10,...body.map((_,i)=>100+i)],...options},name,name);
const result=(kind,body,name,options)=>H.normalize(make(kind,body,name,options));
const personal=r=>r.facts.filter(f=>f.level==='person');
const reset=()=>{H.data=H.empty();H.pendingImport=null;H.ui={...H.ui,queue:[],store:'',group:'',start:'2026-11-01',end:'2026-11-30',period:'month',expanded:new Set(),committing:false};elements.clear();messages.length=0;};
const commit=async qs=>{H.ui.queue=qs;for(const q of qs){q.result=H.normalize(q);assert.equal(q.result.errors.length,0);q.status='ready'}H.commitImports();assert.ok(H.pendingImport,'The batch must be staged before committing');await H.finishImport();assert.ok(qs.every(q=>q.status==='imported'),messages.join('; '));};
const tests=[];const test=(name,run)=>tests.push({name,run});

test('six sheet shapes are recognized separately and preserve original row numbers',()=>{
 reset();
 const specs=[['house',[[serial('2026-11-02'),group,'测试甲',2]],'weeklyHouse'],['meet',[['2026/11/02',group,'测试甲',3]],'weeklyMeet'],['media',[['2026-11-02',group,'测试甲',4]],'weeklyMedia'],['view',[[group,'测试甲',5]],'undatedViewing'],['channel',[['2026-11-02',group,'测试甲',10,2,2,2,2,2,3,'30%']],'weeklyChannel'],['hmall',[['上海','2026-11','EVENT1','黄浦大区',store,group,'TEST01','测试陪带人',1,'测试实际带看人','买卖','陪带',8,1]],'monthlyHmall']];
 for(const [kind,body,expected]of specs){const q=make(kind,body,'同一工作簿.xlsx');assert.equal(q.kind,expected);assert.equal(q.annual,true);assert.equal(H.sourceRows(q)[0].row,100);assert.equal(H.sourceRows(q)[0].index,1)}
 const q=make('house',[[serial('2026-11-02'),group,'测试甲',2]]),r=H.normalize(q);
 assert.equal(personal(r)[0].start,'2026-11-02');assert.equal(personal(r)[0].end,'2026-11-08');assert.equal(personal(r)[0].row,100);assert.equal(personal(r)[0].periodType,'weekly');
 const date1904=make('meet',[[serial('2026-11-02')-1462,group,'测试甲',1]],'1904.xlsx',{date1904:true});assert.equal(personal(H.normalize(date1904))[0].start,'2026-11-02');
 assert.ok(result('meet',[['2026-11-03',group,'测试甲',1]]).errors.some(x=>/周一/.test(x)));
});

test('Hmall uses the assisting employee and view count, not actual viewer or house count',()=>{
 reset();const one=['上海','2026-11','EVT1','黄浦大区',store,group,'TEST01','测试陪带人',1,'另一个实际带看人','买卖','陪带',8,1],two=[...one];two[2]='EVT2';two[8]=2;two[12]=6;
 const r=result('hmall',[one,two,one]),rows=personal(r);
 assert.equal(r.errors.length,0);assert.equal(rows.find(f=>f.metric==='hmallassist').value,3);assert.equal(rows.find(f=>f.metric==='hmallhouses').value,14);
 assert.ok(rows.every(f=>f.person==='测试陪带人'&&f.personId==='TEST01'));assert.equal(rows[0].periodType,'monthly');assert.equal(rows[0].start,'2026-11-01');assert.equal(rows[0].end,'2026-11-30');assert.equal(rows[0].periodComplete,false);assert.equal(r.check.duplicates,1);
 const conflicting=[...one];conflicting[8]=4;assert.ok(result('hmall',[one,conflicting]).errors.length);
 const anotherRegion=[...one];anotherRegion[3]='其他大区';const excluded=result('hmall',[anotherRegion]);assert.equal(excluded.facts.length,0);assert.equal(excluded.check.outsideRegion,1);
});

test('source scopes and missing identities are retained for review',()=>{
 reset();const q=make('house',[['2026-11-02',group,'测试甲',2],['2026-11-02','测试历史门店A组','测试乙',8],['2026-11-02',group,'',1]]),r=H.normalize(q);
 assert.equal(personal(r).length,1);assert.equal(r.check.outsideStore,1);assert.ok(r.issues.some(x=>x.type==='outside-scope'&&x.values[3]===8));assert.ok(r.issues.some(x=>x.type==='identity-missing'));
 q.includeOtherStores=true;assert.equal(personal(H.normalize(q)).length,2);
 H.data.novRoster=[{personId:'TEST01',person:'测试甲',store:'其他现任门店',group:'其他现任门店B组',role:'顾问',joinDate:'2020-01-01'}];
 const e=H.annualIdentity(store,group,'测试甲','TEST01');assert.equal(e.group,group);assert.equal(e.store,store,'Roster must not rewrite source historical store/group');
});

test('undated views stay out of facts until true source dates are provided',()=>{
 reset();const q=make('view',[[group,'测试甲',8],[group,'测试乙',0],[group,'测试丙','']]),r=H.normalize(q);
 assert.equal(q.start,'');assert.equal(q.end,'');assert.equal(r.facts.length,0);assert.equal(r.referenceOnly,true);assert.equal(r.check.datePending,true);assert.equal(r.issues.filter(x=>x.type==='undated-activity').length,2);assert.equal(r.check.view,8);
 q.start='2026-11-01';assert.ok(H.normalize(q).errors.length);q.end='2026-11-15';const dated=H.normalize(q);assert.equal(personal(dated).length,2);assert.equal(personal(dated)[1].value,0);assert.equal(personal(dated)[0].periodType,'range');assert.ok(!dated.issues.some(x=>x.type==='undated-activity'));
 const duplicated=result('view',[[group,'测试甲',8],[group,'测试甲',8]]);assert.equal(duplicated.check.view,8);assert.equal(duplicated.issues.length,1);assert.ok(result('view',[[group,'测试甲',8],[group,'测试甲',9]]).errors.length);
});

test('duplicates, explicit zeros, conflicting summaries and total rows are handled',()=>{
 reset();let r=result('house',[['2026-11-02',group,'测试甲',2],['2026-11-02',group,'测试甲',2],['2026-11-02',group,'测试乙',0],['2026-11-02',group,'测试丙','']]);
 assert.equal(r.errors.length,0);assert.equal(personal(r).length,2);assert.equal(r.check.duplicates,1);assert.equal(r.facts.find(f=>f.level==='region').value,2);
 assert.ok(result('house',[['2026-11-02',group,'测试甲',2],['2026-11-02',group,'测试甲',3]]).errors.length);
 r=result('house',[['2026-11-02',group,'测试甲',2],['2026-11-02',group,'合计',2],['2026-11-02',group,'总计',2],['2026-11-02',group,'Total',2]]);
 assert.equal(personal(r).length,1,'A group total must not be counted as another consultant');assert.equal(r.facts.find(f=>f.level==='region').value,2);
});

test('channel rates aggregate from counts and a zero denominator stays unavailable',async()=>{
 reset();await commit([make('channel',[['2026-11-02',group,'测试甲',10,2,2,2,2,2,3,0.99],['2026-11-09',group,'测试甲',30,6,6,6,6,6,3,0.99]])]);
 assert.equal(H.value(H.root(),'channel').n,40);assert.equal(H.value(H.root(),'channelWeekEntered').n,6);assert.equal(H.value(H.root(),'channelWeekRate').n,15);
 reset();await commit([make('channel',[['2026-11-02',group,'测试甲',0,0,0,0,0,0,0,1]])]);assert.equal(H.value(H.root(),'channelWeekRate').n,null);
});

test('multiple files in one week accumulate once and preserve authoritative parents',async()=>{
 reset();await commit([make('house',[['2026-11-02',group,'测试甲',2]],'first.xlsx')]);assert.equal(H.value(H.root(),'newhouse').n,2);
 await commit([make('house',[['2026-11-02',group,'测试乙',3]],'second.xlsx')]);assert.equal(H.value(H.root(),'newhouse').n,5,'The second partial file must not replace a first-file parent subtotal');
 await commit([make('house',[['2026-11-02',group,'测试乙',3]],'renamed-second.xlsx')]);assert.equal(H.value(H.root(),'newhouse').n,5,'Repeated same-person/week upload is not additive');
 assert.equal(H.data.facts.filter(f=>f.level==='person'&&f.metric==='newhouse').length,2);
 const f=H.data.facts.find(f=>f.level==='person');H.data.facts.push({...f,level:'region',store:'',group:'',person:'',personId:'',value:10,sourceFile:'official.xlsx',derived:false,sourceCoverageOnly:false});
 await commit([make('house',[['2026-11-02',group,'测试丙',1]],'third.xlsx')]);assert.equal(H.value(H.root(),'newhouse').n,10,'An explicit authoritative source total is not added to its detail');
 reset();await commit([make('house',[['2026-11-02',group,'测试甲',2]],'same-batch-a.xlsx'),make('house',[['2026-11-02',group,'测试乙',3]],'same-batch-b.xlsx')]);assert.equal(H.value(H.root(),'newhouse').n,5,'Derived parent totals from two files must not cause a false pre-commit conflict');
});

test('overlapping old snapshots are explicitly retired, recoverable and transactional',async()=>{
 reset();const q=make('house',[['2026-11-02',group,'测试甲',2]],'new-week.xlsx'),f=personal(H.normalize(q))[0];
 const old={...f,start:'2026-11-01',end:'2026-11-15',periodType:'monthToDate',value:8,source:'old.xlsx / Sheet1',sourceFile:'old.xlsx',sourceSheet:'Sheet1'};
 H.data.facts=[old,{...old,metric:'ownermeet',value:3}];H.data.followItems=[{id:'keep',title:'保留原有待办'}];
 q.status='ready';H.ui.queue=[q];H.commitImports();assert.equal(H.pendingImport.retire.length,1);elements.set('retire-overlap',{checked:true});await H.finishImport();
 assert.equal(H.data.facts.some(x=>x.metric==='newhouse'&&x.periodType==='monthToDate'),false);assert.equal(H.data.sourceTrash[0].removed.facts[0].value,8);assert.equal(H.data.facts.find(x=>x.metric==='ownermeet').value,3);assert.equal(H.data.followItems[0].id,'keep');assert.equal(H.value(H.root(),'newhouse').n,2);
 const restored=H.restoreSourceToData(H.data,H.data.sourceTrash[0].id);assert.equal(restored.conflicts,0);assert.ok(restored.data.facts.some(x=>x.periodType==='monthToDate'&&x.metric==='newhouse'&&x.value===8));assert.ok(restored.data.facts.some(x=>x.periodType==='weekly'&&x.value===2));
 reset();H.data.facts=[old];const again=make('house',[['2026-11-02',group,'测试甲',2]],'new-week.xlsx');again.status='ready';H.ui.queue=[again];H.commitImports();elements.set('retire-overlap',{checked:false});await H.finishImport();assert.ok(H.data.facts.some(x=>x.periodType==='monthToDate'));assert.equal(H.data.sourceTrash.length,0);assert.equal(H.value(H.root(),'newhouse').n,null,'Keeping overlapping sources exposes the conflict rather than summing them');
 reset();H.data.facts=[old];const failure=make('house',[['2026-11-02',group,'测试甲',2]],'new-week.xlsx');failure.status='ready';H.ui.queue=[failure];H.commitImports();elements.set('retire-overlap',{checked:true});const before=JSON.stringify(H.data);H.save=async()=>false;await H.finishImport();H.save=async()=>true;assert.equal(JSON.stringify(H.data),before);assert.equal(failure.status,'ready');
});

test('performance and weekly activity in one batch retain their different source periods',async()=>{
 reset();const header=['上海排名','姓名','员工编号','所属大区','门店','店组','年度业绩(元)'];
 const rows=[['测试大区 顾问/经理/店总 年度业绩统计（2026年1-10月）'],['一、顾问'],header,[1,'测试甲','TEST01','测试大区',store,group,125000,125000],['二、经理'],header,[1,'测试经理','TEST02','测试大区',store,group,900000,900000]];
 const q=H.prepare({name:'测试大区层级业绩统计',rows},'测试年度业绩.xlsx','performance');
 await commit([q,make('house',[['2026-11-02',group,'测试甲',2]])]);
 const actual=H.data.facts.filter(f=>f.metric==='actual');assert.equal(actual.length,1);assert.equal(actual[0].value,12.5);assert.equal(actual[0].start,'2026-01-01');assert.equal(actual[0].end,'2026-10-31');assert.equal(H.value(H.root(),'actual').n,null,'Year-to-October income must not become November performance');assert.equal(H.data.novUnassigned.filter(i=>i.type==='management-performance').length,1);
 H.setCalendar('year','2026');assert.equal(H.value(H.root(),'actual').n,12.5);assert.equal(H.value(H.root(),'newhouse').n,2);
});

test('confirming an undated source removes its old pending-date copy',async()=>{
 reset();const q=make('view',[[group,'测试甲',8]],'views.xlsx');await commit([q]);assert.equal(H.data.novUnassigned.filter(x=>x.type==='undated-activity').length,1);assert.equal(H.data.facts.length,0);
 const dated=make('view',[[group,'测试甲',8]],'views.xlsx');dated.start='2026-11-01';dated.end='2026-11-15';await commit([dated]);assert.equal(H.data.novUnassigned.filter(x=>x.type==='undated-activity').length,0);assert.equal(H.data.facts.filter(x=>x.level==='person'&&x.metric==='view').length,1);
});

test('verified JSON is append-only, normalizes arrays and validates atomically',async()=>{
 reset();H.data.followItems=[{id:'existing-action',title:'原有待办'}];H.data.novRoster=[{personId:'TEST01',person:'测试甲',store,group,role:'顾问',joinDate:'2020-01-01'}];
 const q=make('house',[['2026-11-02',group,'测试甲',2]],'package-source.xlsx'),r=H.normalize(q),source={file:q.file,sheet:q.sheet,hash:'JSONHASH',start:q.start,end:q.end,periodType:q.periodType,preserveExistingRoster:true};
 H.loadVerifiedImport({format:'huangpu-verified-import-v1',sheets:[{source,result:r}]},'verified.json');assert.equal(H.ui.queue.length,1);assert.equal(H.ui.queue[0].status,'ready');
 H.commitImports();await H.finishImport();assert.equal(H.data.followItems[0].id,'existing-action');assert.equal(H.data.novRoster[0].joinDate,'2020-01-01');assert.equal(H.value(H.root(),'newhouse').n,2);
 reset();H.loadVerifiedImport({format:'huangpu-verified-import-v1',sheets:[{source,result:{facts:r.facts,roster:[]}}]},'minimal.json');const normalized=H.normalize(H.ui.queue[0]);for(const key of ['flows','channels','issues','errors'])assert.ok(Array.isArray(normalized[key]),'Validated package must normalize '+key);assert.equal(typeof normalized.check,'object');
 reset();const invalid={...r,facts:[{...r.facts[0],value:NaN}]};assert.throws(()=>H.loadVerifiedImport({format:'huangpu-verified-import-v1',sheets:[{source,result:r},{source:{...source,sheet:'bad'},result:invalid}]},'broken.json'));assert.equal(H.ui.queue.length,0,'A malformed later sheet must not leave a partial import queue');
 assert.throws(()=>H.loadVerifiedImport({format:'huangpu-verified-import-v1',sheets:[{source,result:{...r,issues:{}}}]},'wrong-arrays.json'));
});

test('failed storage does not change data or falsely mark the import as saved',async()=>{
 reset();const q=make('media',[['2026-11-02',group,'测试甲',7]]);q.status='ready';H.ui.queue=[q];H.commitImports();const original=JSON.stringify(H.data);H.save=async()=>false;await H.finishImport();H.save=async()=>true;
 assert.equal(JSON.stringify(H.data),original);assert.equal(q.status,'ready');assert.ok(H.pendingImport);assert.equal(H.ui.committing,false);
});

test('calendar controls preserve mixed-period safety and wrap dates correctly',()=>{
 reset();H.setCalendar('week','2027-01-01');assert.equal(H.ui.start,'2026-12-28');assert.equal(H.ui.end,'2027-01-03');H.setCalendar('month','2028-02');assert.equal(H.ui.end,'2028-02-29');H.setCalendar('year','2026');assert.equal(H.ui.start,'2026-01-01');assert.equal(H.ui.end,'2026-12-31');
 H.ui.period='month';H.ui.start='2026-11-01';H.ui.end='2026-11-30';const q=make('house',[['2026-11-02',group,'测试甲',2]]),r=H.normalize(q),f=personal(r)[0];H.data.facts=[f,{...f,value:20,start:'2026-11-01',end:'2026-11-30',periodType:'monthly'}];assert.equal(H.value(H.root(),'newhouse').n,null,'Overlapping week and month summaries cannot silently double-count');
});

(async()=>{
 let failures=0;for(const {name,run}of tests){try{await run();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack)}}
 console.log(`${tests.length-failures}/${tests.length} weekly import checks passed.`);if(failures)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
