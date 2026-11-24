/* Synthetic-only monthly table and ranking regression tests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},getElementById(){return null},querySelector(){return null},querySelectorAll(){return []}}};c.window=c;vm.createContext(c);
for(const file of ['core','imports','views','organization-model','data-management','weekly-model','monthly-model'])vm.runInContext(fs.readFileSync('assets/'+file+'.js','utf8'),c,{filename:file+'.js'});
const H=c.HP;H.today=()=> '2031-02-24';
const person=(i,more={})=>({level:'person',store:'合成门店',group:'合成门店'+(i%2?'B':'A')+'组',person:'测试顾问'+i,personId:'SYNTH-'+i,role:'顾问',joinDate:'2030-01-01',...more});
const monthly=(p,metric,value,more={})=>({...p,category:'activity',metric,value,periodType:'monthly',month:'2031-02',start:'2031-02-01',end:'2031-02-28',observedThrough:'2031-02-22',sourceKind:'monthlySynthetic',sourceHash:'source-'+metric,sourceSheet:'明细',sourceMetrics:[metric],sourceMonths:['2031-02'],sourceStores:[p.store],importedAt:'2031-02-24T01:00:00Z',coverageConfirmed:true,periodComplete:false,...more});
const weekly=(p,metric,value,start='2031-02-03',end='2031-02-09',more={})=>({...p,category:'activity',metric,value,periodType:'weekly',start,end,observedThrough:end,source:'旧周来源',...more});
function setup(count=8){H.data=H.empty();H.ui.monthlyBoard={};H.ui.store='';H.ui.group='';for(let i=0;i<count;i++)H.data.novRoster.push(person(i));}
const node=(view,level='region',predicate=()=>true)=>view.nodes.find(n=>n.level===level&&predicate(n));
const value=(view,key,level='region',predicate=()=>true,month='2031-02')=>node(view,level,predicate).months[month][key];
setup();for(let i=0;i<8;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,8-i));
let v=H.monthlyView(),r=v.rankings['合成门店']['2031-02'];
assert.deepEqual(Array.from(v.months),['2030-12','2031-01','2031-02'],'Default three months cross the year, with no fixed business year');
assert.equal(value(v,'view'),36);assert.equal(r.count,8);assert.equal(r.status,'separate');assert.equal(r.top.length,3);assert.equal(r.bottom.length,3);assert.ok(r.top.every(p=>!r.bottom.some(q=>q.personId===p.personId)));
assert.equal(H.monthlyView({endMonth:'2030-07'}).endMonth,'2030-07');assert.equal(value(H.monthlyView({endMonth:'2030-07'}),'view','region',()=>true,'2030-07'),0,'A selected empty month displays zero without fabricating source coverage');assert.equal(H.monthlyRanking({store:'合成门店',month:'2030-07'}).count,0,'An unimported month cannot rank display-only zeroes');
assert.ok(v.nodes.every(n=>Object.keys(n.months).length===3));assert.ok(v.nodes.some(n=>n.level==='group'));assert.ok(v.nodes.some(n=>n.level==='person'));
const before=JSON.stringify(H.data);H.monthlyView();H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(JSON.stringify(H.data),before,'Rendering and rankings do not change source facts or settings');
// The month source defines the whole selected store/metric population. Missing
// monthly people and groups cannot be topped up from weeks or rolling snapshots.
setup(3);H.data.facts.push(monthly(person(0),'view',5),weekly(person(0),'view',100),weekly(person(1),'view',200),{...weekly(person(2),'view',300),periodType:'rolling30',start:'2031-01-20',end:'2031-02-18'},{...weekly(person(0),'view',999),level:'store',person:'',personId:'',group:''});
v=H.monthlyView();assert.equal(value(v,'view'),5);assert.equal(value(v,'view','person',n=>n.personId==='SYNTH-1'),0);assert.equal(value(v,'view','group',n=>n.group==='合成门店B组'),0);assert.equal(node(v,'person',n=>n.personId==='SYNTH-1').cellMeta['2031-02'].view.assumedZero,true);
assert.equal(H.monthlyPreferredFacts(H.data.facts).length,1);assert.equal(H.data.facts.length,5,'Precedence never deletes stored source facts');
// A newer monthly dataset supersedes its earlier dataset, including old people
// absent from the replacement. Equal-time contradictory sources stay conflicts.
setup(2);H.data.facts.push(monthly(person(0),'view',2,{sourceHash:'old',importedAt:'2031-02-20T01:00:00Z'}),monthly(person(1),'view',7,{sourceHash:'old',importedAt:'2031-02-20T01:00:00Z'}),monthly(person(0),'view',4,{sourceHash:'new'}));
v=H.monthlyView();assert.equal(value(v,'view'),4);assert.equal(value(v,'view','person',n=>n.personId==='SYNTH-1'),0);
H.data.facts.push(monthly(person(0),'view',99,{sourceHash:'same-time-conflict'}));v=H.monthlyView();assert.equal(value(v,'view'),null);assert.equal(node(v).cellMeta['2031-02'].view.status,'conflict');assert.equal(node(v).cellMeta['2031-02'].view.asterisk,true);
// Declared source scope can include a store or a metric with no numerical rows.
setup(2);const second=person(9,{store:'另一店',group:'另一店A组'});H.data.novRoster.push(second);H.data.facts.push(monthly(person(0),'channel',3,{sourceStores:['合成门店','另一店'],sourceMetrics:['channel','view']}),weekly(second,'view',200));
v=H.monthlyView();assert.equal(value(v,'view','store',n=>n.store==='另一店'),0);assert.ok(v.stores.includes('另一店'));
const selected=H.monthlyView({store:'合成门店'});assert.ok(selected.stores.includes('另一店'),'Filtering display retains all dropdown choices');assert.ok(selected.nodes.every(n=>n.level==='region'||n.store==='合成门店'));
// Ratios use sum of matching numerators / sum of matching denominators, never
// mean of percentages. Covered omitted rows are the user-confirmed zero;
// zero/zero displays zero, while a positive numerator over zero is a conflict.
setup(2);H.data.facts.push(monthly(person(0),'channel',2),monthly(person(0),'channelMonthEntered',1),monthly(person(1),'channel',8),monthly(person(1),'channelMonthEntered',1));
v=H.monthlyView();assert.equal(value(v,'rate'),0.2);assert.equal(value(v,'rate','person',n=>n.personId==='SYNTH-0'),0.5);
H.data.facts.find(f=>f.personId==='SYNTH-0'&&f.metric==='channel').value=0;H.data.facts.find(f=>f.personId==='SYNTH-0'&&f.metric==='channelMonthEntered').value=0;v=H.monthlyView();assert.equal(value(v,'rate','person',n=>n.personId==='SYNTH-0'),0);assert.equal(node(v,'person',n=>n.personId==='SYNTH-0').cellMeta['2031-02'].rate.status,'zero-denominator');
H.data.facts=H.data.facts.filter(f=>!(f.personId==='SYNTH-1'&&f.metric==='channelMonthEntered'));v=H.monthlyView();assert.equal(value(v,'rate'),0,'A covered omitted numerator is zero and may be divided by its matching source denominator');assert.equal(node(v,'person',n=>n.personId==='SYNTH-1').cellMeta['2031-02'].entered.assumedZero,true);
H.data.facts.find(f=>f.personId==='SYNTH-0'&&f.metric==='channelMonthEntered').value=1;v=H.monthlyView();assert.equal(value(v,'rate','person',n=>n.personId==='SYNTH-0'),null);assert.equal(node(v,'person',n=>n.personId==='SYNTH-0').cellMeta['2031-02'].rate.status,'conflict');
// Source groups remain separate in the table, but known identities rank once.
setup(8);for(let i=0;i<8;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,i));
const historical=person(0,{group:'合成门店旧组'});H.data.facts.push(monthly(historical,'view',10),monthly(historical,'channel',4));v=H.monthlyView();r=v.rankings['合成门店']['2031-02'];assert.equal(v.nodes.filter(n=>n.level==='person'&&n.personId==='SYNTH-0').length,2);assert.equal(r.all.filter(p=>p.personId==='SYNTH-0').length,1);assert.equal(r.all.find(p=>p.personId==='SYNTH-0').values.view,10);assert.equal(r.all.find(p=>p.personId==='SYNTH-0').values.channel,4);
const manager=person(90,{role:'店经理'}),unknown=person(91,{role:'待核对'});H.data.novRoster.push(manager);for(const p of [manager,unknown])for(const metric of ['view','channel'])H.data.facts.push(monthly(p,metric,999));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.count,8);assert.ok(r.all.every(p=>!['SYNTH-90','SYNTH-91'].includes(p.personId)));
// Equal names with different staff IDs are identity issues, not automatic joins.
H.data.novRoster.push(person(92,{person:'测试顾问0'}));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.ok(r.missing.some(p=>p.personId==='SYNTH-0'&&p.missing.includes('身份需核对')));
// An omitted employee in a covered month participates with zero, but joining
// after the source cutoff remains a separate exclusion.
setup(8);for(let i=0;i<7;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,i));H.data.novRoster.push(person(8,{joinDate:'2031-02-23'}));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.count,8);assert.equal(r.missing.length,0);assert.deepEqual(Array.from(r.notJoined),['测试顾问8']);assert.equal(r.all.find(p=>p.personId==='SYNTH-0').values.view,0);assert.equal(r.all.find(p=>p.personId==='SYNTH-7').values.view,0);assert.deepEqual(Array.from(r.all.find(p=>p.personId==='SYNTH-7').assumedZeroMetrics),['view','channel']);
v=H.monthlyView();const assumed=node(v,'person',n=>n.personId==='SYNTH-7').cellMeta['2031-02'].view;assert.equal(assumed.sourceCovered,true);assert.equal(assumed.assumedZero,true);assert.ok(assumed.sourceEvidence.some(e=>e.sourceHash==='source-view'&&e.month==='2031-02'&&e.observedThrough==='2031-02-22'));assert.equal(H.data.facts.some(f=>f.personId==='SYNTH-7'),false,'An assumed zero has evidence metadata but never a manufactured source fact');
// Omission inside a covered source is different from not importing the metric
// at all. Neither display-only zeroes nor mismatched periods can enter a rank.
setup(8);for(let i=0;i<8;i++)H.data.facts.push(monthly(person(i),'view',i));v=H.monthlyView();r=v.rankings['合成门店']['2031-02'];assert.equal(r.count,0);assert.equal(r.missing.length,8);assert.ok(r.missing.every(p=>p.missing.some(s=>s.includes('本月尚未导入来源'))));assert.equal(value(v,'channel'),0);assert.equal(node(v).cellMeta['2031-02'].channel.sourceCovered,false);assert.equal(value(v,'rate'),0);assert.equal(node(v).cellMeta['2031-02'].rate.status,'not-imported');
for(let i=0;i<8;i++)H.data.facts.push(monthly(person(i),'channel',i,{observedThrough:'2031-02-21'}));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.count,0,'Two genuinely different source cutoffs stay pending');
setup(2);H.data.facts.push(monthly(person(0),'channel',5),monthly(person(0),'channelMonthEntered',2,{observedThrough:'2031-02-21'}));v=H.monthlyView();assert.equal(value(v,'rate'),null);assert.equal(node(v).cellMeta['2031-02'].rate.status,'conflict','A mismatched source coverage must not be disguised as a zero rate');
// A matched month-level pair with explicit omission can compute the ratio even
// when different stores have different (but within-store matched) cutoffs.
setup(1);const other=person(1,{store:'另一店',group:'另一店A组'});H.data.novRoster.push(other);H.data.facts.push(monthly(person(0),'channel',4),monthly(person(0),'channelMonthEntered',2),monthly(other,'channel',6,{observedThrough:'2031-02-21'}),monthly(other,'channelMonthEntered',1,{observedThrough:'2031-02-21'}));v=H.monthlyView();assert.equal(value(v,'rate'),0.3);
// Third-position ties are retained. Small, fully tied and overlapping tails do
// not fabricate distinct best/worst groups.
setup(8);const tied=[9,7,7,7,3,2,1,0];for(let i=0;i<8;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,tied[i]));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.top.length,4);assert.equal(r.bottom.length,3);
H.data.novRoster=H.data.novRoster.slice(0,5);r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.status,'small');assert.equal(r.top.length,0);assert.equal(r.bottom.length,0);
setup(8);for(let i=0;i<8;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,0));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.status,'tied');assert.equal(r.top.length,0);
setup(6);for(let i=0;i<6;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,[9,5,5,5,5,0][i]));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.status,'overlap');assert.equal(r.bottom.length,0);
// Complete weekly fallback compares shared weekly periods. Different week ends
// are normal; an omitted employee/week is zero under the monthly convention,
// but mismatched source cutoffs still prevent a false comparison.
setup(6);for(let i=0;i<6;i++)for(const metric of ['view','channel'])for(const [start,end]of [['2031-02-03','2031-02-09'],['2031-02-10','2031-02-16']])H.data.facts.push(weekly(person(i),metric,i+1,start,end));
v=H.monthlyView();assert.equal(value(v,'view'),42);r=v.rankings['合成门店']['2031-02'];assert.equal(r.count,6);assert.equal(r.status,'separate');
H.data.facts=H.data.facts.filter(f=>!(f.personId==='SYNTH-0'&&f.metric==='view'&&f.start==='2031-02-10'));r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.missing.length,0);assert.equal(r.count,6);assert.equal(r.all.find(p=>p.personId==='SYNTH-0').values.view,1);assert.deepEqual(Array.from(r.all.find(p=>p.personId==='SYNTH-0').assumedZeroMetrics),['view']);
H.data.facts.find(f=>f.personId==='SYNTH-1'&&f.metric==='view'&&f.start==='2031-02-10').observedThrough='2031-02-15';r=H.monthlyRanking({store:'合成门店',month:'2031-02'});assert.equal(r.count,0,'An inconsistent cutoff inside an imported week is still a data issue, not an omitted zero');
// Metadata—not the current date—controls exceptions and as-of observations.
setup(1);H.data.facts.push(monthly(person(0),'ownermeet',4,{coverageConfirmed:false,coverageNote:'月份和来源筛选范围待核',displayAsterisk:true}),monthly(person(0),'hmallassist',3,{coverageConfirmed:false,observedThrough:'',sourceEnd:'',coverageNote:'月份有值，日级截止未注明'}));
v=H.monthlyView();assert.equal(value(v,'owner'),4);assert.equal(node(v).cellMeta['2031-02'].owner.asterisk,true);assert.equal(node(v).cellMeta['2031-02'].hmall.asterisk,false);assert.match(node(v).cellMeta['2031-02'].hmall.note,/日级截止/);
// Column order survives a backup and is immediately reflected in the shared
// model used by the table and image exporter; unknown/duplicate keys are ignored.
H.data.monthlyBoard={columnOrder:['view','view','bogus','house']};assert.deepEqual(Array.from(H.getMonthlyColumnOrder()),['view','house','owner','hmall','channel','entered','rate']);const restored=H.cleanBackup(H.clone(H.data));assert.deepEqual(Array.from(restored.monthlyBoard.columnOrder),Array.from(H.getMonthlyColumnOrder()));assert.equal(H.monthlyView().columns[0].key,'view');
// Display and rankings use the same current-consultant roster. Hiding former,
// unknown, or managerial people does not erase their original period totals.
setup(8);for(let i=0;i<8;i++)for(const metric of ['view','channel'])H.data.facts.push(monthly(person(i),metric,i+1));
const currentManager=person(90,{role:'店经理'}),unlisted=person(91),departed=person(92,{employmentStatus:'已离职'}),inactive=person(93,{employeeStatus:'terminated'}),disabled=person(94,{isActive:false}),exited=person(95,{exitDate:'2031-02-01'}),withoutData=person(96),formerManager=person(97,{role:'店经理',status:'离职'});
H.data.novRoster.push(currentManager,departed,inactive,disabled,exited,withoutData,formerManager);
for(const [p,a,b]of [[currentManager,5,2],[unlisted,7,3],[departed,11,4],[inactive,13,5],[disabled,17,6],[exited,19,7]])H.data.facts.push(monthly(p,'view',a),monthly(p,'channel',b));
const originalFacts=JSON.stringify(H.data.facts);v=H.monthlyView();r=v.rankings['合成门店']['2031-02'];
assert.equal(value(v,'view'),108);assert.equal(value(v,'channel'),63);assert.equal(v.nodes.filter(n=>n.level==='person').length,9);assert.equal(v.displayCounts['合成门店'].uniqueConsultants,9);
assert.ok(v.nodes.filter(n=>n.level==='person').every(n=>n.role==='顾问'));assert.ok(v.nodes.every(n=>!['SYNTH-90','SYNTH-91','SYNTH-92','SYNTH-93','SYNTH-94','SYNTH-95','SYNTH-97'].includes(n.personId)));
assert.equal(value(v,'view','person',n=>n.personId==='SYNTH-96'),0,'A current consultant without a row in a covered source remains visible as zero');
assert.deepEqual(Array.from(node(v,'group',n=>n.group==='合成门店A组').managerNames),['测试顾问90']);assert.ok(!v.nodes.some(n=>(n.managerNames||[]).includes('测试顾问97')));
assert.equal(r.count,9);assert.deepEqual(Array.from(r.missing,p=>p.personId),[]);assert.ok(r.all.every(p=>Number(p.personId.split('-')[1])<8||p.personId==='SYNTH-96'));assert.equal(JSON.stringify(H.data.facts),originalFacts);
H.data.novRoster[0].用工关系状态='离职';v=H.monthlyView();assert.equal(v.displayCounts['合成门店'].uniqueConsultants,8);assert.equal(value(v,'view'),108,'Changing display status preserves the source-based organization total');assert.equal(v.rankings['合成门店']['2031-02'].count,8);
assert.equal(H.monthlyIsCurrentStaff(person(0,{status:'未离职'})),true,'A negated or planned departure is not an explicit departed status');assert.equal(H.monthlyIsCurrentStaff(person(0,{status:'计划离职'})),true);
// A genuine group-level source remains authoritative. It is not added again as
// a manager's displayed copy or to its individual source records.
setup(2);H.data.novRoster[1].group='合成门店A组';H.data.novRoster.push(person(90,{role:'店经理'}));
H.data.facts.push(monthly(person(0),'view',3),monthly(person(1,{group:'合成门店A组'}),'view',4),monthly(person(90,{role:'店经理'}),'view',5),monthly({level:'group',store:'合成门店',group:'合成门店A组',person:'',personId:''},'view',42));
v=H.monthlyView();assert.equal(value(v,'view','group'),42);assert.equal(value(v,'view'),42);assert.equal(v.nodes.filter(n=>n.level==='person').length,2);assert.equal(H.data.facts.length,4);
console.log('PASS monthly model: dynamic months, scoped source replacement, no legacy top-up, conflicts, exact hierarchy, weighted ratio, stable-ID ranking, roles, missing/zero, ties, weekly fallback, coverage notes and persistent column order.');
