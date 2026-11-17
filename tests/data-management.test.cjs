// Synthetic fixtures only. No employee IDs or business values are committed.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={console,Date,Map,Set,JSON,Number,String,Math,URL,Blob,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,document:{addEventListener(){}}};c.window=c;vm.createContext(c);
for(const name of ['core','imports','views','organization-model','organization-ui','data-management','interface-v32'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),c,{filename:name+'.js'});
const H=c.HP;
function fixture(){H.data=H.empty();H.ui={...H.ui,store:'',group:'',start:'2026-11-01',end:'2026-11-15',period:'batch',role:'顾问'};
const p={personId:'TEST1',person:'测试甲',store:'测试店',group:'测试A组',joinDate:'2024-01-01',role:'顾问',source:'roster.csv / Sheet1'};
H.data.novRoster.push(p);H.data.facts.push(...[['view',4,'visits.xlsx'],['actual',1,'performance.xlsx'],['channel',3,'channels.xlsx']].map(([metric,value,file])=>({...p,level:'person',category:'activity',metric,value,start:H.ui.start,end:H.ui.end,periodType:'monthToDate',source:file+' / Sheet1',sourceHash:file})));
H.data.novAudit=[{file:'visits.xlsx',purpose:'带看',period:'11月',status:'已接入'},{file:'performance.xlsx',purpose:'业绩'}];H.data.history=[{id:'i1',file:'visits.xlsx',sheet:'Sheet1',hash:'visits.xlsx'}];H.data.followItems=[{id:'a1',title:'测试支持',snapshot:{sources:['visits.xlsx'],performance:1},context:'保留事实'}];}
fixture();let before=JSON.stringify(H.data.followItems),x=H.removeSourceFromData(H.data,'visits.xlsx');H.data=x.data;assert.equal(H.value(H.root(),'view').n,null);assert.equal(H.value(H.root(),'actual').n,1);assert.equal(JSON.stringify(H.data.followItems),before);assert.equal(H.data.sourceTrash.length,1);assert.ok(!H.sourceList().some(s=>s.file==='visits.xlsx'));
H.data=H.cleanBackup(JSON.parse(JSON.stringify(H.data)));assert.equal(H.data.sourceTrash.length,1);assert.equal(H.value(H.root(),'view').n,null);x=H.restoreSourceToData(H.data,H.data.sourceTrash[0].id);H.data=x.data;assert.equal(H.value(H.root(),'view').n,4);assert.equal(H.data.sourceTrash.length,0);assert.equal(JSON.stringify(H.data.followItems),before);
// Current different values must never be overwritten when restoring.
fixture();H.data=H.removeSourceFromData(H.data,'visits.xlsx').data;H.data.facts.push({...H.data.sourceTrash[0].removed.facts[0],value:8,source:'new-visits.xlsx / Sheet1'});x=H.restoreSourceToData(H.data,H.data.sourceTrash[0].id);H.data=x.data;assert.equal(H.value(H.root(),'view').n,8);assert.equal(x.conflicts,1);assert.equal(H.data.sourceTrash[0].removed.facts.length,1);
// Roster deletion keeps unrelated business facts and historical followups.
fixture();H.data=H.removeSourceFromData(H.data,'roster.csv').data;assert.equal(H.data.novRoster.length,0);assert.equal(H.data.facts.length,3);assert.equal(H.data.followItems.length,1);
// Supplemental legacy managers migrate, arbitrary incomplete consultants do not.
fixture();H.data.novRoster.push({personId:'TESTMAN',person:'测试管理者',role:'岗位归属待补',source:'本次消息 / 补充入职名单',store:'',group:'',joinDate:'2020-01-01'});H.data.novRoster.push({personId:'UNKNOWN',person:'待核对测试',role:'待核对',source:'other.csv / Sheet1',store:'',group:''});H.migrateManagers(H.data);assert.equal(H.data.novRoster.find(r=>r.personId==='TESTMAN').role,'大区总／店总');assert.equal(H.data.novRoster.find(r=>r.personId==='UNKNOWN').role,'待核对');assert.equal(H.data.novRoster.filter(H.isLeader).length,1);
// Explicit management titles survive the importer even if they contain 经理.
const rows=[['姓名','职位','入职日期'],['测试负责人','大区总','2020-01-01']];const q={rows,header:0,mapping:['_person','_role','_joinDate'],kind:'roster',category:'roster',file:'leaders.csv',sheet:'sheet',hash:'x',start:'2026-11-01',end:'2026-11-15',periodType:'range'};const n=H.normalize(q);assert.equal(n.roster[0].role,'大区总');assert.equal(n.roster[0].sourceFile,'leaders.csv');assert.equal(n.roster[0].management,true);
// Use stable column IDs, not first-child selectors; deleted imports cannot reset header settings.
H.data.tableDisplay={fontSize:20,objectWidth:230};const widths=H.tableWidths({columns:[{label:'对象'},{label:'业绩目标',id:'target'},{label:'实际业绩',id:'actual'}]});assert.deepEqual(Array.from(widths),[230,128,128]);assert.ok(H.tableHTML({columns:[{label:'对象'},{label:'指标',id:'actual'}],rows:[]}).includes('<colgroup>'));
assert.equal(H.cleanBackup(JSON.parse(JSON.stringify(H.data))).tableDisplay.fontSize,20);
for(const f of fs.readdirSync('assets'))assert.ok(!/SH\d{8}|sb_secret_|sk-proj-/.test(fs.readFileSync('assets/'+f,'utf8')),'No private data in '+f);
console.log('PASS source removal/recovery, no clobbering of newer values, no deletion of action history, manager-role migration, provenance, display settings, backup roundtrip, privacy.');
