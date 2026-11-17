// Synthetic-only tests: time scopes, hierarchy, ties, missing data and width fitting.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,document:{addEventListener(){}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','views','organization-model','organization-ui','data-management','interface-v32','table-fit','leaderboard-model','leaderboard-ui'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;
function fixture(values=[9,8,7,6,5,5,1,0]){
 H.data=H.empty();H.ui={...H.ui,start:'2026-11-01',end:'2026-11-17',period:'batch',store:'',group:'',leaderboard:{mode:'month',anchor:'2026-11-17',level:'both',role:'顾问',metrics:['view']}};
 for(let i=0;i<values.length;i++){
  const person={person:'测试顾问'+i,personId:'TEST'+i,store:'测试店',group:'测试店'+i+'组',role:'顾问',joinDate:'2025-01-01'};
  H.data.novRoster.push(person);
  if(values[i]!==null)H.data.facts.push({...person,level:'person',category:'activity',metric:'view',value:values[i],start:'2026-11-01',end:'2026-11-15',periodType:'monthToDate',source:'synthetic'});
 }
 return H.lbBuildMetric(H.meta('view'),'person');
}
let r=fixture();assert.equal(r.status,'ready');assert.equal(r.rows.length,6,'Include ties at the fifth position');assert.deepEqual(Array.from(r.rows,x=>x.rank),[1,2,3,4,5,5]);assert.equal(r.partial,true);assert.equal(r.knownCount,8);
assert.equal(H.lbRange().start,'2026-11-01');assert.equal(H.lbRange().end,'2026-11-30');
H.ui.leaderboard.mode='week';assert.equal(H.lbRange().start,'2026-11-16');assert.equal(H.lbRange().end,'2026-11-22');r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.rows.length,0,'Month-to-date may not be sliced into a week');
H.ui.leaderboard.mode='year';assert.equal(H.lbRange().start,'2026-01-01');r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.rows.length,6);assert.equal(r.partial,true,'November only is never labelled complete annual ranking');
H.ui.leaderboard.mode='week';H.ui.leaderboard.anchor='2027-01-01';assert.equal(H.lbRange().start,'2026-12-28');assert.equal(H.lbRange().end,'2027-01-03');
H.ui.leaderboard.mode='month';H.ui.leaderboard.anchor='2024-02-16';assert.equal(H.lbRange().end,'2024-02-29');
r=fixture([5,null,0,-1]);assert.equal(r.knownCount,2);assert.equal(r.missingCount,2);assert.equal(r.rows.length,1);
fixture([0,0,0]);r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.status,'zero');assert.equal(r.rows.length,0);
fixture();H.data.facts[0].end='2026-11-14';r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.status,'mismatch');assert.equal(r.rows.length,0,'Different observation windows cannot be ranked');
fixture();H.data.facts.forEach(f=>f.periodType='rolling30');r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.rows.length,0);assert.match(r.message,/近30天/);
fixture();H.data.novRoster[0].role='店经理';r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.poolCount,7,'Advisor ranking excludes managers by default');H.ui.leaderboard.role='all';r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.poolCount,8);
H.data.novRoster[0].role='店总';r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.poolCount,7,'Leadership stays out of consultant activity comparisons');
fixture();H.data.facts.push({...H.data.facts[0],level:'group',person:'',personId:'',value:30});r=H.lbBuildMetric(H.meta('view'),'group');assert.equal(r.rows[0].n,30,'Use authoritative group total, never add it to person subtotal');
fixture();H.ui.store='另一店';r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.rows.length,0);
fixture([9,8]);const first=H.data.facts[0];H.data.facts.push({...first,end:'2026-11-17',value:12});H.data.facts[1].end='2026-11-17';r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.rows[0].n,12,'Latest month-to-date snapshot replaces previous snapshot');
fixture([9,8]);H.data.facts.forEach(f=>f.periodType='range');for(const f of H.data.facts.slice())H.data.facts.push({...f,start:'2026-11-16',end:'2026-11-30',value:2});r=H.lbBuildMetric(H.meta('view'),'person');assert.equal(r.rows[0].n,11);assert.equal(r.partial,false,'Adjacent disjoint ranges form complete month');
fixture();const before=JSON.stringify(H.ui);H.lbModel();assert.equal(JSON.stringify(H.ui),before,'Building leaderboard does not mutate main filters');
const model=H.activityModel(),shares=H.fitColumnShares(model);assert.ok(Math.abs(shares.reduce((s,n)=>s+n,0)-100)<1e-6);assert.ok(shares.every(n=>n>0));
const parts=H.fitSubmodels(model);assert.deepEqual(Array.from(parts.flatMap(p=>p.columns.slice(1)),m=>m.id),Array.from(model.columns.slice(1),m=>m.id),'Stacked layout retains all columns in order');
assert.ok(parts.every(p=>p.columns.length<=5));const html=H.tableHTML(model);assert.ok(!/min-width:\d+px/.test(html));assert.match(html,/fit-adaptive/);assert.ok(!/scale\(/.test(html));
H.data.metrics[4].width=260;assert.ok(H.fitColumnShares(H.activityModel())[5]>0);assert.ok(H.renderActivity().includes('activity-leaderboard'));
console.log('PASS TOP5: one metric at a time, ties, missing != zero, role and store scope, period safety, partial-year labels, group totals; adaptive table keeps every column.');
