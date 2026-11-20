'use strict';
// Synthetic records only. The field names reproduce the two source formats.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),messages=[];
const context={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},getElementById(id){return elements.get(id)||null},querySelector(){return null}}};
context.window=context;vm.createContext(context);
for(const file of ['core','imports','xlsx-reader','views','organization-model','organization-ui','data-management','interface-v32','leaderboard-model','leaderboard-ui','weekly-model','weekly-import','performance-import','weekly-ui'])vm.runInContext(fs.readFileSync('assets/'+file+'.js','utf8'),context,{filename:file+'.js'});
const H=context.HP,store=H.importStores[0],group=store+'A组',otherGroup=store+'B组';
H.today=()=> '2026-11-20';H.render=()=>{};H.close=()=>{};H.modal=(...args)=>{H.lastModal=args};H.toast=value=>messages.push(value);H.save=async()=>true;
const reset=()=>{H.data=H.empty();H.pendingImport=null;H.ui={...H.ui,queue:[],images:[],reading:false,store:'',group:'',start:'2026-11-01',end:'2026-11-30',period:'month',expanded:new Set(),committing:false};elements.clear();messages.length=0;};
const personal=result=>result.facts.filter(f=>f.level==='person');
const make=(rows,{field='买卖带看次数',file='测试带看.xlsx',sheet='买卖带看次数',...options}={})=>H.prepare({name:sheet,rows:[['行为时间','店组','实际带看人',field],...rows],...options},file,file);
const stage=qs=>{H.ui.queue=qs;H.autoReviewAll();assert.ok(qs.every(q=>q.status==='ready'),messages.join('; '));H.commitImports();assert.ok(H.pendingImport);};
const oldSource=(rows,file='旧无日期带看.xlsx')=>{const q=H.prepare({name:'带看',rows:[['店组','实际带看人','[A] 买卖带看次数'],...rows]},file,file);return H.normalize(q).issues;};
const complete=()=>[['2026-11-02',group,'测试甲',2],['2026-11-09',group,'测试甲',0],['2026-11-02',group,'测试乙',0],['2026-11-09',group,'测试乙',3]];
const tests=[];const test=(name,run)=>tests.push({name,run});

test('dated viewing recognizes both real headers and keeps source fields and rows',()=>{
 reset();
 for(const field of ['买卖带看次数','[A] 买卖带看次数']){
  const q=make([['2026-11-02',group,'测试甲',2],['2026-11-09',group,'测试甲',3]],{field,rowNumbers:[5,17,29]}),r=H.normalize(q);
  assert.equal(q.kind,'weeklyViewing');assert.equal(q.periodType,'weekly');assert.equal(q.periodVerified,true);assert.equal(q.periodCount,2);assert.equal(q.start,'2026-11-02');assert.equal(q.end,'2026-11-15');
  assert.equal(r.errors.length,0);assert.equal(personal(r).length,2);assert.equal(r.check.view,5);assert.ok(personal(r).every(f=>f.sourceField===field&&f.sourceKind==='weeklyViewing'));assert.equal(personal(r)[1].row,29);assert.equal(r.issues.filter(i=>i.type==='undated-activity').length,0);
 }
 const serial=(Date.parse('2026-11-02T00:00:00Z')-Date.UTC(1899,11,30))/864e5;
 assert.equal(personal(H.normalize(make([[serial-1462,group,'测试甲',2]],{date1904:true})))[0].start,'2026-11-02');
 assert.ok(H.normalize(make([['',group,'测试甲',2]])).errors.some(e=>e.includes('日期无效')),'Missing row dates cannot inherit the selected month');
 assert.ok(H.normalize(make([['2026-11-03',group,'测试甲',2]])).errors.some(e=>e.includes('周一')));
});

test('dated viewing preserves zeros, missing values, historical groups and scope',()=>{
 reset();H.data.novRoster=[{personId:'TEST01',person:'测试甲',store,group,role:'顾问'}];
 const rows=[['2026-11-02',group,'测试甲',0],['2026-11-02',group,'测试乙',''],['2026-11-02',otherGroup,'测试甲',4],['2026-11-02','其他门店A组','测试外部',7],['2026-11-02',group,'合计',11]],q=make(rows),r=H.normalize(q);
 assert.equal(r.errors.length,0);assert.equal(personal(r).length,2);assert.equal(r.check.view,4);assert.equal(personal(r)[0].value,0);assert.equal(personal(r)[0].personId,'TEST01');assert.equal(personal(r)[1].group,otherGroup);assert.equal(personal(r)[1].personId,'');
 assert.equal(r.check.outsideStore,1);assert.equal(r.check.summaryRows,1);assert.ok(r.issues.some(i=>i.type==='outside-scope'&&i.values[3]===7));
 assert.equal(H.normalize(make([...rows,rows[0]])).check.duplicates,1);assert.ok(H.normalize(make([...rows,['2026-11-02',group,'测试甲',1]])).errors.length);
});

test('filename cutoff is explicit, caps observation and never clips the weekly dates',()=>{
 reset();H.today=()=> '2026-12-15';
 const q=make([['2025-12-29',group,'测试甲',2],['2026-11-16',group,'测试甲',3]],{file:'买卖带看次数_事件分析_2026-01-01至2026-11-20_SensorsAnalytics.xlsx'}),r=H.normalize(q);
 assert.equal(q.observedThrough,'2026-11-20');assert.equal(q.sourceFilterStart,'2026-01-01');assert.equal(q.sourceFilterEnd,'2026-11-20');assert.match(q.importNote,/不拆分或裁剪/);
 assert.equal(personal(r)[0].start,'2025-12-29');assert.equal(personal(r)[0].end,'2026-01-04');assert.equal(personal(r)[1].end,'2026-11-22');assert.equal(personal(r)[1].periodComplete,false);assert.equal(personal(r)[1].sourceFilterEnd,'2026-11-20');
 H.today=()=> '2026-11-20';
 assert.equal(make([['2026-11-16',group,'测试甲',3]],{file:'测试_2026-01-01至2026-12-31.xlsx'}).observedThrough,'2026-11-20');
 const missing=make([['',group,'测试甲',3]],{file:'测试_2026-01-01至2026-11-20.xlsx'});assert.ok(H.normalize(missing).errors.length,'Filename dates do not replace missing source week labels');
});

test('month and year use the existing explicit cross-boundary week rule',async()=>{
 reset();const q=make([['2025-12-29',group,'测试甲',2],['2026-11-02',group,'测试甲',3],['2026-11-09',group,'测试甲',0],['2026-11-16',group,'测试甲',4]]);stage([q]);await H.finishImport();
 H.setCalendar('year','2026');assert.equal(H.value(H.root(),'view').n,7);H.setCalendar('month','2026-11');assert.equal(H.value(H.root(),'view').n,7);H.setCalendar('week','2026-11-09');assert.equal(H.value(H.root(),'view').n,0);
 H.setCalendar('year','2025');assert.equal(H.value(H.root(),'view').n,2);H.data.calendarSettings={weekMonth:'end'};H.setCalendar('year','2026');assert.equal(H.value(H.root(),'view').n,9);
});

test('a million blank TSV rows are ignored while meaningful row numbers survive',()=>{
 reset();const table=H.parseTextTable('\r\n\t\t\t\r\n行为时间\t店组\t实际带看人\t[A] 买卖带看次数\r\n2026-11-02\t'+group+'\t测试甲\t0\r\n\t\t\t\r\n2026-11-09\t'+group+'\t测试甲\t2\r\n'+'\t\t\t\r\n'.repeat(1044392));
 assert.equal(table.rows.length,3);assert.equal(JSON.stringify(table.rowNumbers),'[3,4,6]');const q=H.prepare({name:'文本表',...table},'测试带看.txt','hash');assert.equal(q.kind,'weeklyViewing');assert.equal(personal(H.normalize(q))[1].row,6);assert.equal(H.normalize(q).check.view,2);
 const quoted=H.parseTextTable('姓名,备注,值\n"测试甲","第一行\n第二行",0\n\n"测试乙","引号""内容",2\n');assert.equal(quoted.rows[1][1],'第一行\n第二行');assert.equal(quoted.rows[2][1],'引号"内容');assert.equal(JSON.stringify(quoted.rowNumbers),'[1,2,5]');
 assert.equal(H.csv('甲;乙;丙\n1;;0')[1][1],'');assert.equal(H.csv('甲;乙;丙\n1;;0')[1][2],'0');assert.throws(()=>H.csv('列\n"未闭合'),/引号/);
 assert.throws(()=>H.csv('列\n'+'1\n'.repeat(20001)),/有效数据超过20,000行/);assert.throws(()=>H.csv('\t'.repeat(300)+'实际内容'),/300列/);
});

test('TXT file selection and clipboard import both use automatic weekly recognition',async()=>{
 reset();const text='行为时间\t店组\t实际带看人\t[A] 买卖带看次数\r\n2026-11-02\t'+group+'\t测试甲\t2\r\n\t\t\t\r\n2026-11-09\t'+group+'\t测试甲\t0\r\n'+'\t\t\t\r\n'.repeat(1000),bytes=new TextEncoder().encode(text),file={name:'测试.txt',type:'text/plain',size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};
 await H.readFiles([file]);assert.equal(H.ui.queue.length,1);assert.equal(H.ui.queue[0].kind,'weeklyViewing');assert.equal(H.sourceRows(H.ui.queue[0])[1].row,4);await H.readFiles([file]);assert.equal(H.ui.queue.length,1);
 H.autoReviewAll();assert.equal(H.ui.queue[0].status,'ready');assert.equal(H.ui.queue[0].result.check.view,2);
 reset();elements.set('paste-table',{value:text});await H.acceptPastedTable();assert.equal(H.ui.queue[0].kind,'weeklyViewing');assert.equal(H.sourceRows(H.ui.queue[0])[1].row,4);
});

test('only a complete same-object weekly grid can match an entire old source',()=>{
 reset();H.data.novUnassigned=oldSource([[group,'测试甲',2],[group,'测试乙',3]]);
 const match=rows=>{const q=make(rows);return H.matchUndatedViewing([{q,r:H.normalize(q)}]);};
 assert.equal(match(complete()).length,1);assert.equal(match(complete())[0].people,2);assert.equal(match(complete())[0].periods,2);
 assert.equal(match(complete().filter(r=>r[3]>0)).length,0,'Sparse positive-only text is not a complete grid');
 assert.equal(match(complete().slice(0,2)).length,0,'One person cannot stand in for a whole source');
 const swapped=complete().map(r=>[...r]);swapped[0][3]=3;swapped[3][3]=2;assert.equal(match(swapped).length,0,'Same grand total is insufficient');
 const gap=complete().map(r=>r[0]==='2026-11-09'?['2026-11-23',...r.slice(1)]:r);assert.equal(match(gap).length,0,'An omitted whole week does not become complete');
 const moved=complete().map(r=>r[2]==='测试甲'?[r[0],otherGroup,...r.slice(2)]:r);assert.equal(match(moved).length,0,'Historical groups are part of the match');
 H.data.novUnassigned.push({...H.data.novUnassigned[0],row:99});assert.equal(match(complete()).length,0,'Ambiguous old duplicate objects require review');
 H.data.novUnassigned=oldSource([[group,'测试甲',2]]);assert.equal(match(complete().slice(0,2)).length,0,'One coincidentally equal value cannot retire an undated source');
});

test('matched pending records retire recoverably, repeat safely, and roll back on save failure',async()=>{
 reset();H.data.novUnassigned=oldSource([[group,'测试甲',2],[group,'测试乙',3]]);H.data.followItems=[{id:'keep',title:'原有待办'}];
 const original=H.clone(H.data.novUnassigned),q=make(complete());stage([q]);assert.equal(H.pendingImport.retireUndated.length,1);assert.match(H.lastModal[1],/retire-undated-view/);elements.set('retire-undated-view',{checked:true});await H.finishImport();
 assert.equal(H.data.novUnassigned.filter(x=>x.type==='undated-activity').length,0);assert.equal(H.data.facts.filter(f=>f.level==='person'&&f.metric==='view').length,4);assert.equal(H.data.sourceTrash[0].removed.novUnassigned.length,2);assert.equal(H.data.followItems[0].id,'keep');assert.equal(H.value(H.root(),'view').n,5);
 const backup=H.cleanBackup(H.clone(H.data));assert.equal(backup.sourceTrash[0].removed.novUnassigned.length,2);const restored=H.restoreSourceToData(backup,backup.sourceTrash[0].id);assert.equal(restored.conflicts,0);assert.equal(restored.data.novUnassigned.length,2);assert.equal(restored.data.facts.length,4);
 stage([make(complete(),{file:'再次导出.xlsx'})]);assert.equal(H.pendingImport.retireUndated.length,0);await H.finishImport();assert.equal(H.data.facts.length,4);assert.equal(H.data.sourceTrash.length,1);assert.equal(H.value(H.root(),'view').n,5);
 reset();H.data.novUnassigned=original;stage([make(complete())]);elements.set('retire-undated-view',{checked:false});await H.finishImport();assert.equal(H.data.novUnassigned.length,2);assert.equal(H.data.sourceTrash.length,0);
 reset();H.data.novUnassigned=original;stage([make(complete())]);elements.set('retire-undated-view',{checked:true});const before=JSON.stringify(H.data);H.save=async()=>false;await H.finishImport();H.save=async()=>true;assert.equal(JSON.stringify(H.data),before);assert.equal(H.ui.queue[0].status,'ready');
});

test('known identities merge without collapsing historical groups or ambiguous names',async()=>{
 reset();H.data.novUnassigned=oldSource([[group,'测试甲',2],[group,'测试乙',3]]);H.data.novRoster=[{personId:'TEST01',person:'测试甲',store,group,role:'顾问'},{personId:'TEST02',person:'测试乙',store,group,role:'顾问'}];
 stage([make(complete())]);assert.equal(H.pendingImport.retireUndated.length,1);elements.set('retire-undated-view',{checked:true});await H.finishImport();assert.ok(H.data.facts.filter(f=>f.person==='测试甲').every(f=>f.personId==='TEST01'));
 stage([make(complete())]);await H.finishImport();assert.equal(H.data.facts.length,4);
 reset();H.data.novUnassigned=oldSource([[group,'测试甲',2],[group,'测试乙',3]]);H.data.novUnassigned[0].personId='OLD01';H.data.novRoster=[{personId:'DIFFERENT01',person:'测试甲',store,group,role:'顾问'}];stage([make(complete())]);assert.equal(H.pendingImport.retireUndated.length,0,'Different known employee IDs cannot be reconciled by name alone');
 reset();H.data.novUnassigned=oldSource([[group,'测试甲',2],[group,'测试乙',3]]);H.data.novRoster=[{personId:'AMBIGUOUS01',person:'测试甲',store,group,role:'顾问'},{personId:'AMBIGUOUS02',person:'测试甲',store,group,role:'顾问'}];stage([make(complete())]);assert.equal(H.pendingImport.retireUndated.length,0,'An unresolved name shared by two known IDs cannot retire a source');
});

test('reimporting an old source in the same batch cannot resurrect its matched pending rows',async()=>{
 reset();H.data.novUnassigned=oldSource([[group,'测试甲',2],[group,'测试乙',3]]);const old=H.prepare({name:'带看',rows:[['店组','实际带看人','[A] 买卖带看次数'],[group,'测试甲',2],[group,'测试乙',3]]},'旧无日期带看.xlsx','old');
 stage([old,make(complete())]);elements.set('retire-undated-view',{checked:true});await H.finishImport();assert.equal(H.data.novUnassigned.filter(r=>r.type==='undated-activity').length,0);assert.equal(H.data.sourceTrash[0].removed.novUnassigned.length,2);
});

(async()=>{let failed=0;for(const {name,run}of tests){try{await run();console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}console.log(`${tests.length-failed}/${tests.length} dated viewing checks passed.`);if(failed)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1});
