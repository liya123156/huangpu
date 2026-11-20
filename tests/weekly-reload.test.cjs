/* Synthetic fixtures: initialization restores a whole calendar month. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,document:{addEventListener(){},querySelector(){return null;}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','views','organization-model','organization-ui','data-management','interface-v32','leaderboard-model','weekly-model','weekly-import'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;H.today=()=> '2026-11-20';
let saved;
H.init=async()=>{H.data=H.clone(saved);};H.render=()=>{};
vm.runInContext(fs.readFileSync('assets/weekly-ui.js','utf8'),c,{filename:'weekly-ui.js'});
const base={category:'activity',level:'region',store:'',group:'',person:'',personId:'',source:'synthetic'};
async function reload(facts,weekMonth='start'){
 saved={...H.empty(),facts,calendarSettings:{weekMonth}};
 Object.assign(H.ui,{period:'batch',start:'2026-11-01',end:'2026-11-20',leaderboard:null});
 await H.init();
}
(async()=>{
 const facts=[
  {...base,metric:'newhouse',value:18,start:'2026-11-02',end:'2026-11-08',periodType:'weekly'},
  {...base,metric:'newhouse',value:9,start:'2026-11-16',end:'2026-11-22',periodType:'weekly',periodComplete:false},
  {...base,metric:'hmallassist',value:201,start:'2026-11-01',end:'2026-11-30',periodType:'monthly',periodComplete:false}
 ];
 await reload(facts);
 assert.equal(H.ui.period,'month');assert.equal(H.ui.start,'2026-11-01');assert.equal(H.ui.end,'2026-11-30');
 assert.equal(H.value(base,'newhouse').n,27);assert.equal(H.value(base,'hmallassist').n,201,'Reload must not hide monthly source data or the current partial week');
 assert.equal(H.ui.leaderboard.mode,'month');assert.equal(H.ui.leaderboard.anchor.slice(0,7),'2026-11');
 assert.equal(JSON.stringify(H.data.facts),JSON.stringify(facts),'Initialization does not rewrite stored facts');
 await reload([{...base,metric:'newhouse',value:1,start:'2026-12-28',end:'2027-01-03',periodType:'weekly'}],'end');
 assert.equal(H.ui.start,'2027-01-01');assert.equal(H.ui.end,'2027-01-31','Use the selected cross-year week attribution');
 await reload([{...base,metric:'hmallassist',value:1,start:'2024-02-01',end:'2024-02-29',periodType:'monthly'}]);assert.equal(H.ui.end,'2024-02-29');
 for(const legacy of [[],[{...base,metric:'newhouse',value:3,start:'2026-11-17',end:'2026-11-17',periodType:'rolling30'}],[{...base,metric:'view',value:4,start:'2026-01-01',end:'2026-10-31',periodType:'range'}]]){
  await reload(legacy);assert.equal(H.ui.period,'batch');assert.equal(H.ui.end,'2026-11-20');assert.equal(H.ui.leaderboard,null,'Empty and legacy-only workspaces keep their existing initialization');
 }
 console.log('PASS calendar reload: latest weekly/monthly month, current partial week retained, monthly totals retained, cross-year attribution, leap month, unchanged blank/legacy workspaces.');
})();
