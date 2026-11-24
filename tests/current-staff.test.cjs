'use strict';
// Synthetic identities only. Private personnel corrections are never fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map(),messages=[];
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},getElementById(id){return elements.get(id)||null},querySelector(){return null},querySelectorAll(){return []}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','xlsx-reader','views','organization-model','organization-ui','data-management','interface-v32','leaderboard-model','leaderboard-ui','weekly-model','weekly-import','performance-import','weekly-ui','annual-performance','monthly-import','monthly-model'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP,previousPool=H.orgPool,previousMembers=H.orgConsultantMembers;
vm.runInContext(fs.readFileSync('assets/current-staff.js','utf8'),c,{filename:'current-staff.js'});
H.today=()=> '2031-02-24';H.render=()=>{};H.close=()=>{};H.toast=m=>messages.push(m);H.modal=(...args)=>{H.lastModal=args};H.save=async()=>true;
const person=(n,more={})=>({level:'person',person:'合成顾问'+n,personId:'SYNTH-'+n,store:'合成门店',group:'合成门店A组',role:'顾问',joinDate:'2029-01-01',...more});
const month=(p,value,metric='view')=>({...p,category:'activity',metric,value,periodType:'monthly',month:'2031-02',start:'2031-02-01',end:'2031-02-28',observedThrough:'2031-02-22',sourceKind:'monthlySynthetic',sourceHash:'synthetic-month',sourceSheet:'合成明细',sourceMetrics:[metric],sourceMonths:['2031-02'],sourceStores:[p.store],importedAt:'2031-02-24T01:00:00Z',periodComplete:false,coverageConfirmed:true});
const actual=(p,value)=>({...p,category:'activity',metric:'actual',value,start:'2031-01-01',end:'2031-01-31',periodType:'range',sourceKind:'performanceAnnual',sourceFile:'合成年累计.xlsx'});
const reset=()=>{H.data=H.empty();H.pendingImport=null;Object.assign(H.ui,{queue:[],store:'',group:'',period:'month',start:'2031-02-01',end:'2031-02-28',role:'顾问',focusLevel:'person',tenure:'all',expanded:new Set(),committing:false});elements.clear();messages.length=0;};
const ids=rows=>Array.from(rows,r=>r.personId||r.person).sort();
const tests=[];const test=(name,run)=>tests.push({name,run});

test('every personal scope excludes unlisted and explicitly departed people',()=>{
 reset();const current=person(1),manager=person(2,{role:'店经理'}),leader=person(3,{role:'店总',management:true}),departed=person(4,{employmentStatus:'离职'}),inactive=person(5,{isActive:false}),unlisted=person(6);
 H.data.novRoster=[current,manager,leader,departed,inactive];for(const p of [...H.data.novRoster,unlisted])H.data.facts.push(month(p,10));
 assert.ok(previousPool('person').some(r=>r.personId==='SYNTH-4'),'The old candidate pool demonstrates the status gap');
 assert.deepEqual(ids(H.orgPool('person')),['SYNTH-1']);H.ui.role='店经理';assert.deepEqual(ids(H.orgPool('person')),['SYNTH-2']);H.ui.role='all';assert.deepEqual(ids(H.orgPool('person')),['SYNTH-1','SYNTH-2']);
 assert.deepEqual(ids(H.orgPool()),['SYNTH-1','SYNTH-2'],'Default arguments preserve the active UI scope');
});

test('codes take precedence; uncoded identities require a unique store/group/name match',()=>{
 reset();const a=person(1),sameNameElsewhere=person(2,{person:a.person,store:'另一合成门店',group:'另一合成门店A组'});H.data.novRoster=[a,sameNameElsewhere];
 assert.equal(H.currentStaffRecord({...a,person:'历史名称'}).personId,'SYNTH-1');
 assert.equal(H.currentStaffRecord({...a,personId:''}).personId,'SYNTH-1');
 assert.equal(H.currentStaffRecord({...a,personId:'UNKNOWN-CODE'}),null,'A different code cannot fall back to a matching name');
 assert.equal(H.currentStaffRecord({...a,personId:'',group:'旧组'}),null);assert.equal(H.currentStaffRecord({...a,personId:'',store:''}),null);
 H.data.novRoster.push(person(3,{person:a.person}));assert.equal(H.currentStaffRecord({...a,personId:''}),null,'Same-scope names with different codes are ambiguous');assert.equal(H.currentStaffRecord(a).personId,'SYNTH-1');
 H.data.novRoster.push({...a,employmentStatus:'离职'});assert.equal(H.currentStaffRecord(a),null,'Conflicting duplicate roster codes cannot silently choose an employment state');
});

test('current identities do not create duplicate candidates from historical groups or uncoded copies',()=>{
 reset();const a=person(1);H.data.novRoster=[a];H.data.facts=[month({...a,group:'合成门店旧组'},8),month({...a,personId:''},3)];H.ui.role='all';
 assert.ok(previousPool('person').length>1);const pool=H.orgPool('person');assert.equal(pool.length,1);assert.equal(pool[0].personId,a.personId);assert.equal(pool[0].group,a.group);
 H.ui.group='合成门店旧组';assert.equal(H.orgPool('person').length,0,'A past assignment is not a current team candidate');
});

test('role, organization scope, date-of-joining and tenure visibility keep their existing behavior',()=>{
 reset();const a=person(1),b=person(2,{store:'另一合成门店',group:'另一合成门店A组'}),recent=person(3,{joinDate:'2031-02-20'}),future=person(4,{joinDate:'2031-03-01'});H.data.novRoster=[a,b,recent,future];
 H.ui.store=a.store;assert.deepEqual(ids(H.orgPool('person')),['SYNTH-1','SYNTH-3']);
 const regional={...H.orgRules(),rankScope:'region'};assert.deepEqual(ids(H.orgPool('person',regional)),['SYNTH-1','SYNTH-2','SYNTH-3']);
 H.ui.end='2031-02-16';assert.deepEqual(ids(H.orgPool('person')),['SYNTH-1'],'Joining after the selected observation date is still excluded');
 H.ui.end='2031-02-28';H.ui.tenure='m0_6';assert.equal(H.orgVisible(a),false);assert.equal(H.orgVisible(recent),true);
 for(const level of ['group','store','region'])assert.deepEqual(Array.from(H.orgPool(level),H.key),Array.from(previousPool(level),H.key),'Non-person pools remain unchanged');
});

test('group performance members apply current status even when a departed person has historical performance',()=>{
 reset();const a=person(1),departed=person(2,{status:'已离职'}),manager=person(3,{role:'店经理'}),unlisted=person(4);H.data.novRoster=[a,departed,manager];
 H.data.facts=[actual(a,4),actual(departed,8),actual(manager,16),actual(unlisted,32)];const group={level:'group',store:a.store,group:a.group,person:'',personId:''};
 assert.deepEqual(ids(previousMembers(group)),['SYNTH-1','SYNTH-2']);assert.deepEqual(ids(H.orgConsultantMembers(group)),['SYNTH-1']);assert.equal(H.annualPerformanceValue(group).n,4);
 H.data.novRoster=[];assert.ok(previousMembers(group).length);assert.equal(H.orgConsultantMembers(group).length,0,'History does not substitute for an absent explicit roster');assert.equal(H.orgPool('person').length,0);
});

test('future departure plans are not falsely treated as completed departures',()=>{
 reset();const planned=person(1,{status:'计划离职'}),futureExit=person(2,{exitDate:'2031-03-01'}),alreadyExited=person(3,{exitDate:'2031-02-20'}),negated=person(4,{status:'未离职'});H.data.novRoster=[planned,futureExit,alreadyExited,negated];
 assert.deepEqual(ids(H.orgPool('person')),['SYNTH-1','SYNTH-2','SYNTH-4']);
});

test('candidate filtering never rewrites historical activity totals or source facts',()=>{
 reset();const a=person(1),departed=person(2,{employmentStatus:'离职'}),unlisted=person(3);H.data.novRoster=[a,departed];H.data.facts=[month(a,3),month(departed,7),month(unlisted,11)];
 const before=JSON.stringify(H.data),view=H.monthlyView({endMonth:'2031-02'}),total=view.nodes.find(n=>n.level==='region').months['2031-02'].view;
 assert.equal(total,21);assert.equal(view.nodes.filter(n=>n.level==='person').length,1);H.orgPool('person');H.orgConsultantMembers({level:'group',store:a.store,group:a.group});
 assert.equal(JSON.stringify(H.data),before);assert.equal(H.monthlyView({endMonth:'2031-02'}).nodes.find(n=>n.level==='region').months['2031-02'].view,21);
});

test('a one-person verified status correction preserves the existing roster, source facts and current population',async()=>{
 reset();const a=person(1),manager=person(2,{role:'店经理'}),leader=person(3,{role:'店总',management:true}),historical=person(4);H.data.novRoster=[a,manager,leader];H.data.facts=[month(a,3),month(historical,7)];
 const before=JSON.stringify(H.data.novRoster),facts=JSON.stringify(H.data.facts),record={...historical,employmentStatus:'离职',statusConfirmedAt:'2031-02-24',statusBasis:'合成用户确认',sourceFile:'合成人员状态.json',sourceSheet:'单人状态'};
 const pkg={format:'huangpu-verified-import-v1',createdAt:'2031-02-24T01:00:00Z',sheets:[{source:{file:'合成人员状态.json',sheet:'单人状态',hash:'synthetic-status-hash',category:'roster',periodType:'rosterSnapshot',preserveExistingRoster:true},result:{facts:[],roster:[record],flows:[],channels:[],issues:[],errors:[],check:{statusRecords:1},rowCount:1}}]};
 H.loadVerifiedImport(pkg,'合成人员状态.json');H.commitImports();assert.ok(H.pendingImport);await H.finishImport();assert.equal(H.pendingImport,null);
 assert.equal(H.data.novRoster.length,4);assert.equal(JSON.stringify(H.data.novRoster.slice(0,3)),before);assert.equal(JSON.stringify(H.data.facts),facts);assert.equal(H.data.novRoster.filter(p=>H.monthlyIsCurrentStaff(p)).length,3);
 for(const role of ['顾问','店经理','all']){H.ui.role=role;assert.ok(H.orgPool('person').every(p=>p.personId!==historical.personId));}
 assert.ok(H.monthlyView({endMonth:'2031-02'}).nodes.every(n=>n.personId!==historical.personId));
 const restored=H.cleanBackup(H.clone(H.data));assert.equal(restored.novRoster.find(p=>p.personId===historical.personId).employmentStatus,'离职');
 H.ui.queue=[];H.loadVerifiedImport(pkg,'合成人员状态.json');H.commitImports();await H.finishImport();assert.equal(H.data.novRoster.length,4,'Repeated private correction is idempotent');
});

(async()=>{let failures=0;for(const {name,run}of tests){try{await run();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack)}}console.log(`${tests.length-failures}/${tests.length} current-staff checks passed.`);if(failures)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
