'use strict';
// Fabricated workbooks only; uploaded business data is verified outside this repo.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),messages=[];
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},getElementById(id){return elements.get(id)||null},querySelector(){return null}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','xlsx-reader','views','organization-model','organization-ui','data-management','interface-v32','leaderboard-model','leaderboard-ui','weekly-model','weekly-import','performance-import','weekly-ui','monthly-import'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;H.today=()=> '2026-11-24';H.render=()=>{};H.close=()=>{};H.toast=m=>messages.push(m);H.modal=(...args)=>{H.lastModal=args};H.save=async()=>true;
const store=H.importStores[0],group=store+'A组';
const headers={
 house:['行为时间','店组','录入人名称','[A] 新增房-买卖','[B] 新增房-租赁'],
 owner:['行为时间','店组','操作人名称','[A] 业主面见'],
 view:['行为时间','店组','实际带看人','[A] 买卖带看次数','[B] 二手首带量','[C] 一手带看量'],
 channel:['行为时间','店组','录入人','[A] 本周新增买卖客户','[B] 本周新增租赁客户','[C] 重点渠道新增','[D] 网络','[E] 短彩微','[F] 陌拜','[G] 老客户、上门','[H] 盘户转化','[I] 重点渠道当月进入带看','[J] 非重点渠道当月进入带看量'],
 hmall:['城市','月份','带看ID','PARENT_ORG_NAME','ORG_SHORT_NAME','ORG_SHORT_NAME','USER_CODE','DESCRIPTION','带看次数','ACTUAL_USERNAME','委托类型','类型','HMALL房源数量','是否为带看']
};
const filename=(name,start='2026-09-01',end='2026-11-22')=>name+'_事件分析_'+start+'至'+end+'_SensorsAnalytics.xlsx';
const make=(type,body,file=filename(type),extra={})=>H.prepare({name:type==='hmall'?'陪带数据':'明细数据',rows:[headers[type],...body],rowNumbers:[1,...body.map((_,i)=>100+i)],...extra},file,'synthetic-'+file);
const personal=r=>r.facts.filter(f=>f.level==='person');
const reset=()=>{H.data=H.empty();H.pendingImport=null;H.ui={...H.ui,queue:[],store:'',group:'',start:'2026-11-01',end:'2026-11-30',period:'month',expanded:new Set(),committing:false};elements.clear();messages.length=0;};
const commit=async qs=>{H.ui.queue=qs;for(const q of qs){q.result=H.normalize(q);assert.equal(q.result.errors.length,0,q.result.errors.join('; '));q.status='ready'}H.commitImports();assert.ok(H.pendingImport,'batch staged');await H.finishImport();assert.ok(qs.every(q=>q.status==='imported'),messages.join('; '));};
const tests=[];const test=(name,run)=>tests.push({name,run});

test('Sensors three-sheet workbooks import only monthly detail, not two duplicate views',()=>{
 reset();const sheets=H.annotateMonthlyWorkbook([
  {name:'汇总数据',rows:[['店组','实际带看人','[A] 买卖带看次数'],[group,'测试顾问甲',9]]},
  {name:'明细数据',rows:[headers.view,['2026-09-01',group,'测试顾问甲',2,80,90],['2026-10-01',group,'测试顾问甲',3,80,90],['2026-11-01',group,'测试顾问甲',4,80,90]]},
  {name:'明细报表',rows:[['店组','实际带看人','指标','2026-09-01','2026-10-01','2026-11-01'],[group,'测试顾问甲','[A] 买卖带看次数',2,3,4]]}
 ]);
 const qs=sheets.map(s=>H.prepare(s,filename('带看'),'synthetic-view')),rs=qs.map(H.normalize);
 assert.deepEqual(Array.from(qs,q=>q.kind),['monthlyReference','monthlyViewing','monthlyReference']);
 assert.equal(rs[0].facts.length,0);assert.ok(rs[0].referenceOnly);assert.equal(rs[2].facts.length,0);assert.ok(rs[2].referenceOnly);
 assert.equal(rs[1].facts.length,3);assert.equal(rs[1].check.view,9);assert.ok(rs[1].facts.every(f=>f.metric==='view'&&f.periodType==='monthly'));
 assert.deepEqual(Array.from(qs[1].sourceMonths),['2026-09','2026-10','2026-11']);
 const isolated=H.prepare(sheets[0],filename('副本'),'another');assert.equal(H.normalize(isolated).facts.length,0,'A summary alone cannot become dated detail');
});

test('weekly exports remain weekly and a single first-of-month Monday is not guessed',()=>{
 reset();let q=make('house',[['2026-11-02',group,'测试顾问甲',3,12],['2026-11-09',group,'测试顾问甲',5,11]]);assert.equal(q.kind,'weeklyHouse');assert.equal(H.normalize(q).facts.find(f=>f.level==='person').end,'2026-11-08');
 q=make('house',[['2026-06-01',group,'测试顾问甲',3,12]]);assert.equal(q.kind,'weeklyHouse');
 q=make('house',[['2026-06-01',group,'测试顾问甲',3,12]],filename('手动确认'),{monthlyGranularity:'month'});assert.equal(q.kind,'monthlyHouse');
 const serial=(Date.parse('2026-09-01T00:00:00Z')-Date.UTC(1899,11,30))/864e5;
 q=make('owner',[[serial-1462,group,'测试顾问甲',2]],filename('1904'),{date1904:true});assert.equal(q.kind,'monthlyOwner');assert.equal(H.normalize(q).facts[0].start,'2026-09-01');
});

test('channel mapping uses F and L semantics, preserves explicit zeros and never fabricates ratios',()=>{
 reset();const q=make('channel',[
  ['2026-11-01',group,'测试顾问甲',800,700,10,2,2,2,2,2,3,600],
  ['2026-11-01',group,'测试顾问乙',800,700,0,0,0,0,0,0,0,600],
  ['2026-11-01',group,'测试顾问丙',800,700,'',0,0,0,0,0,'',600]
 ]),r=H.normalize(q);
 assert.equal(r.errors.length,0);assert.equal(r.check.channel,10);assert.equal(r.check.channelMonthEntered,3);assert.equal(r.facts.length,4);assert.equal(r.check.missingValues,2);
 assert.ok(r.facts.filter(f=>f.person==='测试顾问乙').every(f=>f.value===0));assert.equal(r.facts.filter(f=>f.person==='测试顾问丙').length,0);
 assert.ok(r.facts.every(f=>!f.metric.toLowerCase().includes('rate')));assert.equal(r.facts.find(f=>f.metric==='channel').sourceColumn,'F');assert.equal(r.facts.find(f=>f.metric==='channelMonthEntered').sourceColumn,'L');
 assert.ok(r.facts.every(f=>!['view','channelWeekEntered','viewrate'].includes(f.metric)));assert.equal(r.channels.length,15);
});

test('month facts keep the whole month bucket and explicit source-cutoff metadata',()=>{
 reset();const q=make('house',[['2026-09-01',group,'测试顾问甲',2,70],['2026-11-01',group,'测试顾问甲',3,80]]),r=H.normalize(q),sep=r.facts[0],nov=r.facts[1];
 assert.equal(q.kind,'monthlyHouse');assert.equal(r.facts.length,2,'Rental amount is not included');
 assert.equal(sep.start,'2026-09-01');assert.equal(sep.end,'2026-09-30');assert.equal(sep.periodComplete,true);assert.equal(sep.coverageConfirmed,true);
 assert.equal(nov.start,'2026-11-01');assert.equal(nov.end,'2026-11-30');assert.equal(nov.observedThrough,'2026-11-22');assert.equal(nov.periodComplete,false);assert.equal(nov.coverageConfirmed,true);
 assert.equal(nov.row,101);assert.equal(nov.sourceColumn,'D');assert.equal(nov.sourceField,'[A] 新增房-买卖');assert.equal(nov.sourceKind,'monthlyHouse');assert.equal(nov.sourceSheet,'明细数据');
 assert.equal(nov.sourceStart,'2026-09-01');assert.equal(nov.sourceEnd,'2026-11-22');assert.equal(nov.sourcePopulationComplete,false);assert.deepEqual(Array.from(nov.sourceStores),Array.from(H.importStores));
 assert.deepEqual(Array.from(nov.sourceMonths),['2026-09','2026-11']);assert.deepEqual(Array.from(nov.sourceMetrics),['newhouse']);
});

test('owner-meeting date conflicts are visible, do not block import, and do not invent months',()=>{
 reset();const q=make('owner',[['2026-09-01',group,'测试顾问甲',2],['2026-10-01',group,'测试顾问甲',3]],filename('面见','2026-09-01','2026-10-03')),r=H.normalize(q);
 assert.equal(r.errors.length,0);assert.equal(r.facts.length,2);assert.equal(r.facts[1].coverageConfirmed,false);assert.equal(r.facts[1].observedThrough,'2026-10-03');assert.equal(r.facts[1].displayAsterisk,true);assert.match(r.facts[1].coverageNote,/完整覆盖情况待核/);
 assert.ok(r.facts.every(f=>f.month!=='2026-11'));
 const nov=H.normalize(make('owner',[['2026-11-01',group,'测试顾问甲',4]],filename('面见','2026-11-16','2026-11-22'))).facts[0];
 assert.equal(nov.coverageStatus,'partialStart');assert.equal(nov.sourceStart,'2026-11-16');assert.equal(nov.coverageConfirmed,false);assert.equal(nov.displayAsterisk,false);assert.match(nov.coverageNote,/不推断从1日起/);
});

test('Hmall belongs to the assisting employee and counts events once, without guessing day cutoff',()=>{
 reset();const one=['上海','2026-11','SYNTH-EVENT1','黄浦大区',store,group,'SYNTH01','测试陪带甲',2,'另一个实际带看人','买卖','陪带',50,1],two=[...one];two[2]='SYNTH-EVENT2';two[8]=3;
 const outside=[...one];outside[2]='SYNTH-OTHER';outside[3]='其他大区';
 const r=H.normalize(make('hmall',[one,two,one,outside],'测试陪带.xlsx'));
 assert.equal(r.errors.length,0);assert.equal(r.facts.length,1);assert.equal(r.facts[0].metric,'hmallassist');assert.equal(r.facts[0].value,5);assert.equal(r.facts[0].person,'测试陪带甲');assert.equal(r.facts[0].personId,'SYNTH01');
 assert.equal(r.check.duplicates,1);assert.equal(r.check.outsideRegion,1);assert.equal(r.facts[0].observedThrough,undefined);assert.equal(r.facts[0].coverageConfirmed,false);assert.equal(r.facts[0].displayAsterisk,false);assert.deepEqual(Array.from(r.facts[0].sourceRows),[100,101]);
 const changed=[...one];changed[8]=9;assert.ok(H.normalize(make('hmall',[one,changed],'测试陪带.xlsx')).errors.some(e=>/数量冲突/.test(e)));
 const labeled=headers.hmall.map(h=>h==='DESCRIPTION'?'hmall陪带人':h),q=H.prepare({name:'Sheet1',rows:[labeled,one]},'另一个陪带.xlsx','renamed-column');assert.equal(q.kind,'monthlyHmall');assert.equal(H.normalize(q).facts[0].person,'测试陪带甲');
});

test('invalid numbers conflict, empty metrics remain missing, and out-of-scope identities are retained',()=>{
 reset();const q=make('house',[
  ['2026-11-01',group,'测试顾问甲',2,9],['2026-11-01',group,'测试顾问甲',2,9],['2026-11-01',group,'测试顾问乙',0,9],['2026-11-01',group,'测试顾问丙','',9],
  ['2026-11-01','测试历史店A组','测试历史人',8,9],['2026-11-01',group,'',2,9],['2026-11-01','Total','Total',9999,9999]
 ]),r=H.normalize(q);
 assert.equal(r.errors.length,0);assert.equal(r.facts.length,2);assert.equal(r.check.newhouse,2);assert.equal(r.check.duplicates,1);assert.equal(r.check.missingValues,1);assert.equal(r.check.outsideStore,1);assert.equal(r.check.summaryRows,1);assert.ok(r.issues.some(i=>i.type==='identity-missing'));assert.ok(r.issues.some(i=>i.type==='outside-scope'));
 assert.ok(H.normalize(make('house',[['2026-11-01',group,'测试甲',2],['2026-11-01',group,'测试甲',3]])).errors.some(e=>/不同汇总值/.test(e)));
 for(const bad of [-1,'公式未缓存'])assert.ok(H.normalize(make('house',[['2026-11-01',group,'测试甲',bad]])).errors.some(e=>/非负数/.test(e)));
});

test('source historical group is retained and same-name staff elsewhere are not silently joined',()=>{
 reset();H.data.novRoster=[{personId:'SYNTH01',person:'测试同名甲',store,group:store+'B组',role:'顾问',joinDate:'2020-01-01'}];
 const r=H.normalize(make('owner',[['2026-11-01',group,'测试同名甲',1]]));assert.equal(r.facts[0].personId,'');assert.equal(r.facts[0].group,group);
 const h=H.normalize(make('hmall',[['上海','2026-11','SYNTH-ONE','黄浦大区',store,group,'SYNTH01','测试同名甲',1,'其他人','买卖','陪带',30,1]],'测试陪带.xlsx'));
 assert.equal(h.facts[0].personId,'SYNTH01');assert.equal(h.facts[0].group,group);assert.equal(h.facts[0].role,'顾问');
});

test('repeat upload replaces the same month instead of accumulating; old weekly history is retained',async()=>{
 reset();H.data.novRoster=[{personId:'SYNTH01',person:'测试顾问甲',store,group,role:'顾问'}];
 const q=make('house',[['2026-09-01',group,'测试顾问甲',4,80]]);await commit([q]);const first=H.data.facts.length;
 assert.equal(first,1);assert.equal(H.data.facts[0].value,4);assert.equal(H.data.facts[0].userConfirmedSource,true);
 await commit([make('house',[['2026-09-01',group,'测试顾问甲',4,80]],filename('同值副本'))]);assert.equal(H.data.facts.length,first);assert.equal(H.data.facts[0].value,4);
 await commit([make('house',[['2026-09-01',group,'测试顾问甲',6,80]],filename('更新副本'))]);assert.equal(H.data.facts.length,first);assert.equal(H.data.facts[0].value,6);
 const weekly=H.normalize(make('house',[['2026-09-07',group,'测试顾问甲',9,80]],'历史周.xlsx')).facts.filter(f=>!f.derivedFromAnnualPeople);H.data.facts.push(...weekly);
 H.ui.period='month';H.ui.start='2026-09-01';H.ui.end='2026-09-30';assert.notEqual(H.value(H.root(),'newhouse').n,15,'Legacy model must not add overlapping month and weekly values');
 assert.equal(H.data.facts.filter(f=>f.periodType==='weekly').length,1,'The new monthly view can select its source without deleting weekly history');
});

test('failed persistence leaves the existing dataset intact',async()=>{
 reset();const q=make('owner',[['2026-11-01',group,'测试顾问甲',2]]);q.status='ready';H.ui.queue=[q];H.commitImports();const before=JSON.stringify(H.data);H.save=async()=>false;await H.finishImport();H.save=async()=>true;
 assert.equal(JSON.stringify(H.data),before);assert.equal(q.status,'ready');assert.ok(H.pendingImport);assert.equal(H.ui.committing,false);
});

test('monthly review saves through the existing validation path without weekly-only DOM controls',()=>{
 reset();const q=make('channel',[['2026-11-01',group,'测试顾问甲',900,800,5,1,1,1,1,1,2,700]]);H.ui.queue=[q];
 H.review(q.id);assert.match(H.lastModal[0],/每月重点渠道/);assert.match(H.lastModal[2],/HP.validateQ/);assert.doesNotMatch(H.lastModal[2],/saveAnnualReview/);
 elements.set('import-confirmed',{checked:true});elements.set('import-validation',{innerHTML:''});
 H.validateQ(q.id);assert.equal(q.status,'ready');assert.equal(q.result.check.channel,5);assert.equal(q.result.check.channelMonthEntered,2);assert.equal(elements.has('annual-scope'),false);
});

(async()=>{let failures=0;for(const {name,run}of tests){try{await run();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack)}}console.log(`${tests.length-failures}/${tests.length} monthly import checks passed.`);if(failures)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
