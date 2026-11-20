/* Synthetic-only coverage and automatic activity-preview regressions. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},getElementById(){return null},querySelector(){return null},querySelectorAll(){return []}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','views','organization-model','organization-ui','data-management','interface-v32','leaderboard-model','weekly-model','weekly-import','annual-performance'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;H.today=()=> '2026-11-20';
const periods=[['2026-11-02','2026-11-08'],['2026-11-09','2026-11-15'],['2026-11-16','2026-11-22']];
function setup(){
 H.data=H.empty();Object.assign(H.ui,{period:'month',start:'2026-11-01',end:'2026-11-30',store:'',group:'',focusLevel:'person',role:'顾问',tenure:'all',orgActivityMode:'auto'});
 for(let i=0;i<6;i++){
  const p={level:'person',person:'合成顾问'+i,personId:'SYNTH'+i,store:'合成店',group:'合成店'+Math.floor(i/2)+'组',role:'顾问',joinDate:'2024-01-01'};H.data.novRoster.push(p);
  H.data.facts.push({...p,category:'activity',metric:'actual',value:[20,0,10,0,0,0][i],start:'2026-01-01',end:'2026-10-31',periodType:'range',sourceKind:'performanceAnnual',source:'synthetic annual performance'});
  periods.forEach(([start,end],j)=>{
   const base={...p,category:'activity',start,end,periodType:'weekly',sourceCoverageOnly:true,periodComplete:end<=H.today(),observedThrough:end<H.today()?end:H.today(),source:'synthetic weekly activity'};
   if(!(i===5&&j===2))H.data.facts.push({...base,metric:'view',value:[9,0,3,0,2,1][i]});
   if(i===0||j===0)H.data.facts.push({...base,metric:'channel',value:i+1});
  });
 }
 for(let g=0;g<3;g++)H.data.novRoster.push({level:'person',person:'合成经理'+g,personId:'MANAGER'+g,store:'合成店',group:'合成店'+g+'组',role:'经理',joinDate:'2020-01-01'});
 // Historical activity rows and a manager's distinct figure do not expand or
 // inflate the current-consultant group definition.
 const historical={...H.data.novRoster[0],person:'历史未知对象',personId:'HISTORICAL',role:'待核对'};
 H.data.facts.push({...H.data.facts[0],...historical,value:9999});
 H.data.facts.push({...H.data.facts[0],...H.data.novRoster[6],value:8888});
 H.data.focusRules={...H.orgRules(),schema:'org-rank-v1'};
}
setup();const saved=JSON.stringify(H.data),uiDates=[H.ui.start,H.ui.end];let a=H.buildOrgAnalysis('person');
assert.equal(a.items.length,6);assert.equal(a.rank.count,5);assert.equal(a.basisPreview,true);assert.equal(a.previewAvailable,true);assert.equal(a.configuredComparableCount,1);
assert.deepEqual(Array.from(a.rule.activities,x=>x.id),['view']);assert.deepEqual(Array.from(a.configuredRule.activities,x=>x.id),['view','channel']);
assert.deepEqual(Array.from(a.activityWindow.periods,x=>x.start),periods.map(p=>p[0]));assert.equal(a.activityWindow.requestedEnd,'2026-11-30');assert.equal(a.activityWindow.through,'2026-11-20');
assert.match(a.activitySummary,/11-02至2026-11-08.*11-09至2026-11-15.*11-16至2026-11-22/);assert.doesNotMatch(a.activitySummary,/完整月份|全月完整/);
assert.equal(a.items.find(x=>x.entity.personId==='SYNTH1').activities[0].n,0,'An explicitly recorded zero remains known and comparable');
assert.equal(a.items.find(x=>x.entity.personId==='SYNTH1').activityReason,'');
assert.equal(a.items.find(x=>x.entity.personId==='SYNTH5').key,'pending');assert.match(a.items.find(x=>x.entity.personId==='SYNTH5').activityReason,/2026-11-16至2026-11-22/);
assert.equal(JSON.stringify(H.data),saved);assert.deepEqual([H.ui.start,H.ui.end],uiDates,'Analysis does not mutate selected calendar dates');
a=H.buildOrgAnalysis('group');assert.equal(a.rank.count,2);assert.equal(a.items.length,3);assert.equal(a.items[0].performance,20);assert.equal(a.items[0].perf.annual.valid,true);assert.equal(a.items[0].memberCoverage.expected,2,'Managers and unknown historical entities are not expected current consultants');assert.equal(a.items[0].activities[0].n,27);assert.match(a.items[2].activityReason,/合成顾问5/);
H.ui.orgActivityMode='configured';a=H.buildOrgAnalysis('person');assert.equal(a.basisPreview,false);assert.equal(a.rank.count,1);assert.ok(a.items.every(x=>x.key==='pending'));assert.deepEqual(Array.from(a.rule.activities,x=>x.id),['view','channel']);
H.ui.orgActivityMode='view';a=H.buildOrgAnalysis('person');assert.equal(a.basisPreview,true);assert.match(a.previewReason,/手动/);assert.doesNotMatch(a.previewReason,/记录不足/);
const snap=H.orgSnapshot(a.items,a);assert.equal(snap.basisPreview,true);assert.equal(snap.activityMode,'view');assert.deepEqual(Array.from(snap.rule.activities,x=>x.id),['view']);assert.deepEqual(Array.from(snap.configuredRule.activities,x=>x.id),['view','channel']);assert.equal(snap.activityWindow.requestedEnd,'2026-11-30');assert.equal(snap.activityWindow.through,'2026-11-20');
// A month being in progress does not block equal, explicit three-week coverage.
setup();H.data.focusRules.activities=[{id:'view',weight:1}];a=H.buildOrgAnalysis('person');assert.equal(a.basisPreview,false);assert.equal(a.rank.count,5);assert.ok(H.value(a.items[0].entity,'view').partial,'General display still reports an unfinished month; only comparison interprets it');
// Same week labels with different observation cutoffs are not combined as if
// complete. All candidates use the earlier common whole periods, visibly.
H.data.facts.find(f=>f.personId==='SYNTH0'&&f.metric==='view'&&f.start==='2026-11-16').observedThrough='2026-11-18';a=H.buildOrgAnalysis('person');assert.equal(a.activityWindow.periods.length,2);assert.equal(a.activityWindow.through,'2026-11-15');assert.equal(a.activityWindow.excluded[0].start,'2026-11-16');assert.match(a.activitySummary,/截止不一致/);assert.equal(a.items[0].activities[0].n,18);
// If one metric has no source rows for an entire earlier week, the shared
// window excludes it explicitly; it is never hidden behind a continuous label.
setup();H.ui.orgActivityMode='configured';H.data.facts=H.data.facts.filter(f=>!(f.metric==='channel'&&f.start==='2026-11-09'));a=H.buildOrgAnalysis('person');assert.equal(a.activityWindow.periods.length,2);assert.ok(a.activityWindow.excluded.some(p=>p.start==='2026-11-09'));assert.match(a.activitySummary,/未纳入比较：2026-11-09至2026-11-15/);
// Source conflicts remain pending, even when every required week label exists.
setup();H.ui.orgActivityMode='view';const original=H.data.facts.find(f=>f.metric==='view'&&f.personId==='SYNTH0');H.data.facts.push({...original,value:123});a=H.buildOrgAnalysis('person');assert.equal(a.items.find(x=>x.entity.personId==='SYNTH0').key,'pending');assert.match(a.items.find(x=>x.entity.personId==='SYNTH0').activityReason,/冲突/);
// A group's union of dates does not prove each member has every week.
setup();H.ui.orgActivityMode='view';H.data.facts=H.data.facts.filter(f=>!(f.metric==='view'&&((f.personId==='SYNTH2'&&f.start==='2026-11-09')||(f.personId==='SYNTH3'&&f.start==='2026-11-02'))));a=H.buildOrgAnalysis('group');assert.match(a.items[1].activityReason,/合成顾问2.*合成顾问3/);assert.equal(a.items[1].key,'pending');
// Genuine annual performance omissions still block a low-performance label.
setup();H.ui.orgActivityMode='view';H.data.facts=H.data.facts.filter(f=>!(f.metric==='actual'&&f.personId==='SYNTH2'));a=H.buildOrgAnalysis('group');assert.equal(a.items[1].performance,0);assert.equal(a.items[1].key,'pending');assert.match(a.items[1].performanceReason,/部分成员/);
// Do not demand October performance from a consultant who joined in November.
// The person still has no annual fact and therefore remains pending personally.
setup();const newcomer={level:'person',person:'十一月新顾问',personId:'NEW',store:'合成店',group:'合成店1组',role:'顾问',joinDate:'2026-11-07'};H.data.novRoster.push(newcomer);a=H.buildOrgAnalysis('group');assert.equal(a.items[1].perf.annual.valid,true);assert.equal(a.items[1].perf.memberCoverage.expected,2);assert.equal(a.items[1].memberCoverage.expected,3,'Activity still expects the currently selected roster');assert.equal(H.annualPerformanceValue(newcomer).n,null);assert.equal(H.annualPerformanceValue(newcomer).annual.valid,false);
// A fully recorded but tied weighted combination is the user's chosen rule;
// automatic preview must not change the metric merely to break that tie.
setup();H.data.facts=H.data.facts.filter(f=>f.metric!=='channel');for(const f of H.data.facts.filter(f=>f.metric==='view'))H.data.facts.push({...f,metric:'channel',value:20-f.value});a=H.buildOrgAnalysis('person');assert.equal(a.rank.count,5);assert.equal(a.previewAvailable,true);assert.equal(a.basisPreview,false);assert.ok(a.items.filter(x=>!x.activityReason).every(x=>/所有可比较对象活动量同分/.test(x.rankReason)));H.ui.orgActivityMode='view';assert.equal(H.buildOrgAnalysis('person').basisPreview,true);
console.log('PASS organization activity coverage: common imported weeks, in-progress cutoffs, explicit zero, missing weeks/members, consultant roster, conflicts, automatic/manual preview and dual-rule snapshots.');
