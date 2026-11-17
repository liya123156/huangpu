// Synthetic-only organization ranking and action-state tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,document:{addEventListener(){}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','views','organization-model','organization-ui'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;
function fixture(values=[10,8,4,2],perfs=[1,0,2,0]){
 H.data=H.empty();H.ui={...H.ui,start:'2026-11-01',end:'2026-11-15',period:'batch',store:'',group:'',role:'顾问',tenure:'all',focusLevel:'person'};
 for(let i=0;i<values.length;i++){const person={person:'测试'+i,personId:'TEST'+i,store:'测试店',group:'测试店'+i+'组',role:'顾问',joinDate:i===0?'2026-10-01':'2024-01-01'};H.data.novRoster.push(person);for(const [metric,value]of [['view',values[i]],['channel',values[i]],['actual',perfs[i]]])if(value!==null)H.data.facts.push({...person,level:'person',category:'activity',metric,value,start:'2026-11-01',end:'2026-11-15',periodType:'monthToDate',source:'synthetic'})}
 return H.buildOrgAnalysis();
}
let a=fixture();assert.deepEqual(Array.from(a.items,x=>x.key),['HH','LH','HL','LL']);assert.equal(H.value(H.root(),'target').n,null,'No target is required for actual>0 classification');
assert.deepEqual(Array.from(H.nav,x=>x[0]),['activity','focus','follow','import']);
// Missing != zero; missing performance does not remove valid activity from the rank population.
a=fixture([10,8,4,2],[null,0,2,0]);assert.equal(a.items[0].key,'pending');assert.equal(a.rank.count,4);assert.equal(a.items[1].key,'LH');
a=fixture([10,8,null,2],[1,0,2,0]);assert.equal(a.items[2].key,'pending');assert.equal(a.rank.count,3);
// Group and individual scope ranked separately, same underlying rows do not double count.
fixture();a=H.buildOrgAnalysis('group');assert.equal(a.items.length,4);assert.deepEqual(Array.from(a.items,x=>x.key),['HH','LH','HL','LL']);
// Ties stay together; operator and rule changes immediately recompute.
fixture([10,8,8,2]);a=H.buildOrgAnalysis();assert.equal(a.items.filter(x=>x.activityHigh).length,3);
H.data.focusRules={...H.orgRules(),tiePolicy:'low'};a=H.buildOrgAnalysis();assert.equal(a.items.filter(x=>x.activityHigh).length,1);
H.data.focusRules={...H.orgRules(),tiePolicy:'pending'};a=H.buildOrgAnalysis();assert.equal(a.items.filter(x=>x.key==='pending').length,2);
a=fixture([0,0,0,0]);assert.ok(a.items.every(x=>x.key==='pending'),'No arbitrary high ranking when everybody has the same activity');
a=fixture([10],[1]);assert.equal(a.items[0].key,'pending');
fixture();H.data.focusRules={...H.orgRules(),topPercent:25};a=H.buildOrgAnalysis();assert.equal(a.items.filter(x=>x.activityHigh).length,1);
fixture();H.data.focusRules={...H.orgRules(),perfThreshold:1,perfOperator:'gt'};a=H.buildOrgAnalysis();assert.equal(a.items[0].key,'LH');assert.equal(a.items[2].key,'HL');
fixture();H.ui.tenure='m0_6';a=H.buildOrgAnalysis();assert.equal(a.visible.length,1);assert.equal(a.rank.count,4,'Tenure filters must not silently re-rank');
fixture();H.data.facts.find(f=>f.metric==='channel').end='2026-11-14';a=H.buildOrgAnalysis();assert.equal(a.items[0].key,'pending');assert.match(a.items[0].reason,/周期/);
fixture();H.data.facts.filter(f=>f.personId==='TEST0').forEach(f=>f.end='2026-11-14');a=H.buildOrgAnalysis();assert.ok(a.items.every(x=>x.key==='pending'),'Cross-person mismatched periods cannot be ranked');
fixture();H.data.facts.find(f=>f.metric==='actual').value=-1;a=H.buildOrgAnalysis();assert.match(a.items[0].reason,/负业绩/);
// Snapshot is independent of later rule/data edits; backup round trip preserves histories.
fixture();a=H.buildOrgAnalysis();const snap=H.orgSnapshot(a.items,a);H.data.focusRules={...H.orgRules(),topPercent:25};H.data.facts[0].value=1000;assert.equal(snap.rule.topPercent,50);assert.equal(snap.objects[0].activities[0].n,10);
H.data.followItems=[{id:'testaction',title:'测试安排',kind:'业务赋能',snapshot:snap,entities:[a.items[0].entity],status:'待讨论',versions:[]}];const restored=H.cleanBackup(JSON.parse(JSON.stringify(H.data)));assert.equal(restored.followItems[0].snapshot.rule.topPercent,50);
// No public embedding of real employee IDs, uploaded backup, or API credentials.
for(const f of fs.readdirSync('assets')){const text=fs.readFileSync('assets/'+f,'utf8');assert.ok(!/SH\d{8}|sb_secret_|sk-proj-/.test(text),'Sensitive code leak: '+f)}
console.log('PASS organization: 4 modules; actual>0 vs zero; null and negative handling; configurable top percentages and ties; separate groups/persons; tenure filter; period consistency; snapshots; backwards-compatible backups; public-code privacy.');
