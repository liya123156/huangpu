/* Huangpu dashboard core. No real personnel or business data belongs in this file. */
'use strict';
window.HP = (() => {
  const H = {};
  H.version = '3.0';
  H.nav = [['activity','活动量看板'],['market','市场与市占'],['flow','带看流向'],['focus','重点组和人'],['follow','跟进记录'],['import','数据导入']];
  H.groupNames = {result:'业绩',house:'房活动量',customer:'客活动量'};
  const metric = (id,g,label,unit,note='',kind='number') => ({id,g,label,unit,note,kind});
  H.defaultMetrics = [
    metric('target','result','业绩目标','万元','各层级目标独立维护，不强制累加。'),
    metric('actual','result','实际业绩','万元'),metric('achieve','result','目标完成率','%','实际业绩÷相同口径的目标。','rate'),metric('gap','result','目标差距','万元'),
    metric('newhouse','house','房源新增','原表量'),metric('ownermeet','house','业主面见','口径待核'),metric('ownerwechat','house','业主微信添加','责任人新增量'),
    metric('hmallpending','house','号码带量','名称待对表','不自动等同于新增号码正确户数。'),
    metric('channel','customer','重点渠道新增','原表量'),metric('media','customer','自媒体新增','范围待确认','需确认包含的渠道，不能与重点渠道总计重复相加。'),
    metric('view','customer','带看量','原表量'),metric('channelRecords','customer','重点渠道新增记录','查看明细','','text'),
    metric('viewrate','customer','7天进入一带率','%','沿用来源口径，不等于带看次数÷新增量。','rate')
  ];
  H.clone = x => JSON.parse(JSON.stringify(x));
  H.empty = () => ({version:3,build:H.version,metrics:H.clone(H.defaultMetrics),groupOrder:['result','house','customer'],archivedMetrics:[],facts:[],flowFacts:[],history:[],presets:{},focusRules:null,followItems:[],novRoster:[],novChannels:[],novAudit:[],novUnassigned:[],updatedAt:''});
  H.data=H.empty();
  H.today = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  H.ui={page:'activity',store:'',group:'',period:'batch',start:H.today().slice(0,7)+'-01',end:H.today(),metricGroup:'all',expanded:new Set(),focusLevel:'person',role:'顾问',tenure:'all',queue:[],images:[]};
  H.esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  H.num = x => {if(x===null||x===undefined||/^\s*(?:|—|--|-|\/|暂无|待补|不适用|null)\s*$/i.test(String(x)))return null;const s=String(x).trim().replace(/[,，\s]/g,'').replace(/%$/,'');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)?Number(s):NaN};
  H.date = x => {if(x===null||x===undefined||x==='')return '';if(typeof x==='number'||/^\d{5}(\.\d+)?$/.test(String(x))){const n=Number(x);if(n>10000&&n<100000)return new Date(Date.UTC(1899,11,30)+Math.floor(n)*864e5).toISOString().slice(0,10)}const m=String(x).trim().replace(/[年/.]/g,'-').replace(/月/g,'-').replace(/日/g,'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(!m)return '';const s=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),d=new Date(s+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s?s:''};
  H.fmt = (x,rate=false) => x===null||x===undefined||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('zh-CN',{maximumFractionDigits:rate?2:2})+(rate?'%':'');
  H.id = () => globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  H.key = e => [e.level||'person',e.store||'',e.group||'',e.personId||e.person||''].join('|');
  H.same = (a,b) => a.level===b.level&&a.store===b.store&&a.group===b.group&&(a.personId&&b.personId?a.personId===b.personId:(a.person||'')===(b.person||''));
  H.within = (f,e) => (!e.store||f.store===e.store)&&(!e.group||f.group===e.group)&&(!e.person&&!e.personId||(e.personId&&f.personId?e.personId===f.personId:f.person===e.person));
  H.root = () => ({level:H.ui.group?'group':H.ui.store?'store':'region',store:H.ui.store,group:H.ui.group,person:'',personId:''});
  H.label = e => e.level==='region'?'黄浦大区':e.level==='store'?e.store:e.level==='group'?e.group:e.person;
  H.metrics = () => H.data.groupOrder.flatMap(g=>H.data.metrics.filter(m=>m.g===g));
  H.meta = id => [...H.data.metrics,...H.data.archivedMetrics].find(m=>m.id===id)||{id,label:id,kind:'number',unit:''};
  H.roster = () => {const out=new Map();for(const r of H.data.novRoster){out.set(r.personId||[r.store,r.group,r.person].join('|'),r)}for(const f of H.data.facts){if(f.level!=='person'||!f.person)continue;const k=f.personId||[f.store,f.group,f.person].join('|');if(!out.has(k))out.set(k,{person:f.person,personId:f.personId||'',store:f.store||'',group:f.group||'',joinDate:f.joinDate||'',role:f.role||'待核对',grade:f.grade||''})}return [...out.values()]};
  H.entities = () => {const out=new Map(),add=e=>{const k=H.key(e);if(!out.has(k))out.set(k,e)};add({level:'region',store:'',group:'',person:'',personId:''});for(const f of [...H.roster(),...H.data.facts,...H.data.flowFacts]){if(f.store)add({level:'store',store:f.store,group:'',person:'',personId:''});if(f.store&&f.group)add({level:'group',store:f.store,group:f.group,person:'',personId:''});if(f.store&&f.group&&f.person)add({...f,level:'person'})}const order=['新天地一店','新天地二店','黄浦滨江店','复兴香园店'];return [...out.values()].sort((a,b)=>{const ai=order.indexOf(a.store),bi=order.indexOf(b.store);return (ai<0?99:ai)-(bi<0?99:bi)||String(a.group).localeCompare(String(b.group),'zh-CN')||String(a.person).localeCompare(String(b.person),'zh-CN')})};
  H.staff = e => H.roster().find(p=>e.personId&&p.personId===e.personId)||H.roster().find(p=>p.person===e.person&&p.store===e.store&&p.group===e.group)||e;
  H.tenure = (r,end=H.ui.end) => {const start=H.date(r.joinDate),finish=H.date(end);if(!start||!finish||start>finish)return {key:'unknown',label:'待补／待核',months:null,text:'待补／待核'};const a=start.split('-').map(Number),b=finish.split('-').map(Number);const months=(b[0]-a[0])*12+b[1]-a[1]-(b[2]<a[2]?1:0);return {key:months<6?'m0_6':months<12?'m6_12':months<24?'m12_24':'m24plus',label:months<6?'0–6个月':months<12?'6–12个月':months<24?'12–24个月':'24个月以上',months,text:(months>=12?Math.floor(months/12)+'年':'')+(months%12)+'个月'}};
  H.tenureGroups=[['m0_6','0–6个月'],['m6_12','6–12个月'],['m12_24','12–24个月'],['m24plus','24个月以上'],['unknown','待补／待核']];
  H.dateIn = f => f.category==='roster'?true:f.periodType==='rolling30'?H.ui.period==='batch':!!(f.start&&f.end&&f.start>=H.ui.start&&f.end<=H.ui.end);
  H.periodText = f => f.periodLabel||((f.start||'?')+'—'+(f.end||'?'));
  H.latest = fs => {if(!fs.length)return {rows:[]};const rolling=fs.filter(f=>f.periodType==='rolling30');if(rolling.length){const latest=rolling.map(f=>f.end).sort().at(-1);return {rows:rolling.filter(f=>f.end===latest)}}const map=new Map();for(const f of fs){const k=f.start+'|'+(f.periodType==='monthToDate'?'mtd':f.end);const p=map.get(k);if(!p||p.end<f.end)map.set(k,f);else if(p.end===f.end&&p.value!==f.value)return {rows:[],reason:'同一周期存在冲突数据，需在导入中核对'}}const rows=[...map.values()].sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<rows.length;i++)if(rows[i].start<=rows[i-1].end)return {rows:[],reason:'统计周期重叠，不能直接相加'};return {rows}};
  H.value = (e,id,category='activity',depth=0) => {
    if(depth>4)return {n:null,rows:[]};
    if(id==='gap'||id==='achieve'){const t=H.value(e,'target'),a=H.value(e,'actual');return {n:t.n===null||a.n===null||(id==='achieve'&&t.n<=0)?null:id==='gap'?t.n-a.n:a.n/t.n*100,rows:[...t.rows,...a.rows],partial:t.partial||a.partial}}
    const all=H.data.facts.filter(f=>f.category===category&&f.metric===id&&H.within(f,e)&&H.dateIn(f));
    const direct=H.latest(all.filter(f=>f.level===e.level));if(direct.reason)return {n:null,rows:[],reason:direct.reason};
    const rate=H.meta(id).kind==='rate'||H.meta(id).unit==='%';
    if(direct.rows.length){if(rate&&direct.rows.length!==1)return {n:null,rows:direct.rows,reason:'多周期比例不能直接相加或平均'};return {n:direct.rows.reduce((s,f)=>s+f.value,0),rows:direct.rows,partial:H.ui.period!=='batch'&&direct.rows.some(f=>f.start!==H.ui.start||f.end!==H.ui.end)}}
    if(id==='target'||rate||e.level==='person')return {n:null,rows:[]};
    const level={region:'store',store:'group',group:'person'}[e.level];const children=H.entities().filter(x=>x.level===level&&H.within(x,e));const values=children.map(x=>H.value(x,id,category,depth+1)),present=values.filter(v=>v.n!==null);return present.length?{n:present.reduce((s,v)=>s+v.n,0),rows:present.flatMap(v=>v.rows),partial:present.length<values.length||present.some(v=>v.partial)}:{n:null,rows:[]};
  };
  H.visibleRows = () => {const all=H.entities(),root=H.root(),out=[root];const walk=(e,level)=>{for(const c of all.filter(x=>x.level===level&&H.within(x,e))){out.push(c);if(H.ui.expanded.has(H.key(c))){const next={store:'group',group:'person'}[c.level];if(next)walk(c,next)}}};walk(root,{region:'store',store:'group',group:'person'}[root.level]);return out};
  H.scopePeople = () => H.entities().filter(e=>e.level==='person'&&H.within(e,H.root()));
  H.download = (name,data,type='application/json') => {const b=data instanceof Blob?data:new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type});const a=document.createElement('a'),url=URL.createObjectURL(b);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
  let toastTimer;
  H.toast = text => {const e=document.getElementById('toast');if(!e)return;e.textContent=text;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),4200)};
  H.modal = (title,body,footer='') => {document.getElementById('dialog-title').textContent=title;document.getElementById('dialog-body').innerHTML=body;document.getElementById('dialog-footer').innerHTML=footer||'<button class="btn" onclick="HP.close()">关闭</button>';const d=document.getElementById('dialog');if(!d.open)d.showModal()};
  H.close = () => document.getElementById('dialog').close();
  H.go = page => {if(!H.nav.some(n=>n[0]===page))return;H.ui.page=page;history.replaceState(null,'','#'+page);H.render();window.scrollTo(0,0)};
  H.togglePresentation = () => document.body.classList.toggle('presentation');
  H.filter = (key,value) => {H.ui[key]=value;if(key==='store')H.ui.group='';if(key==='store'||key==='group')H.ui.expanded.clear();H.render()};
  H.period = mode => {H.ui.period=mode;const t=H.today();if(mode==='month'){H.ui.start=t.slice(0,7)+'-01';H.ui.end=t}else if(mode==='week'){const d=new Date(t+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));H.ui.start=d.toISOString().slice(0,10);H.ui.end=t}H.render()};
  H.expand = encoded => {const k=decodeURIComponent(encoded);if(H.ui.expanded.has(k))H.ui.expanded.delete(k);else H.ui.expanded.add(k);H.render()};
  H.expandAll = () => {for(const e of H.entities())if(['store','group'].includes(e.level)&&H.within(e,H.root()))H.ui.expanded.add(H.key(e));H.render()};
  H.factKey = f => JSON.stringify([f.category||'activity',f.level,f.store||'',f.group||'',f.personId||f.person||'',f.metric,f.start,f.end,f.periodType||'']);
  H.cleanBackup = source => {if(!source||![2,3].includes(Number(source.version))||!Array.isArray(source.facts)||!Array.isArray(source.metrics))throw new Error('不是支持的完整备份');if(source.facts.length>200000||source.metrics.length>100)throw new Error('数据包超过当前上限');const d=H.empty();for(const k of Object.keys(d))if(k in source)d[k]=H.clone(source[k]);if(!Array.isArray(d.groupOrder)||!d.groupOrder.length)d.groupOrder=['result','house','customer'];for(const k of ['metrics','archivedMetrics','facts','flowFacts','history','followItems','novRoster','novChannels','novAudit','novUnassigned'])if(!Array.isArray(d[k]))throw new Error('备份字段格式不正确：'+k);for(const m of [...d.metrics,...d.archivedMetrics]){if(!/^[a-zA-Z0-9_-]+$/.test(m.id)||!['result','house','customer'].includes(m.g))throw new Error('表头标识或分组不合法');if(m.unit==='%'&&!m.kind)m.kind='rate'}for(const f of d.facts)if(typeof f.value!=='number'||!Number.isFinite(f.value))throw new Error('备份包含无效数值');d.version=3;d.build=H.version;return d};
  H.exportBackup = () => H.download('黄浦工作台_完整备份_'+H.today()+'.json',{...H.data,updatedAt:new Date().toISOString()});
  H.restore = async file => {if(!file)return;try{if(file.size>35*1024*1024)throw new Error('备份超过35MB');const data=H.cleanBackup(JSON.parse(await file.text()));H.pendingBackup=data;H.modal('确认恢复完整备份',`<p>将载入 ${data.facts.length} 项指标、${data.novRoster.length} 条人员记录。</p><div class="notice warn">这会替换当前浏览器的工作数据和表头配置，不是追加合并。请先导出旧数据。</div>`,`<button class="btn" onclick="HP.exportBackup()">先导出当前备份</button><button class="btn primary" onclick="HP.confirmRestore()">确认替换并恢复</button>`)}catch(e){H.toast(e.message)}};
  H.confirmRestore = async () => {if(!H.pendingBackup)return;H.data=H.pendingBackup;H.pendingBackup=null;const ends=H.data.facts.map(f=>f.end).filter(H.date).sort();if(ends.length){H.ui.end=ends.at(-1);H.ui.start=H.ui.end.slice(0,7)+'-01'}H.ui.period='batch';H.ui.expanded.clear();await H.save();H.close();H.render();H.toast('备份已恢复；仅保存在当前浏览器')};
  let db=null,saveChain=Promise.resolve();
  H.save = () => {H.data.updatedAt=new Date().toISOString();const snapshot=H.clone(H.data);saveChain=saveChain.catch(()=>{}).then(()=>new Promise(resolve=>{const label=document.getElementById('save-status');if(!db){if(label)label.textContent='保存不可用，请导出备份';resolve(false);return}if(label)label.textContent='保存中…';try{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(snapshot,'app');tx.oncomplete=()=>{if(label)label.textContent='已保存到本机 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false});resolve(true)};tx.onerror=()=>{if(label)label.textContent='保存失败，请导出备份';resolve(false)}}catch(e){if(label)label.textContent='保存失败，请导出备份';resolve(false)}}));return saveChain};
  H.init = async () => {try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('huangpu_repository_v3',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const saved=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('app');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(saved)H.data=H.cleanBackup(saved);document.getElementById('save-status').textContent=saved?'已读取本机数据':'本机保存已就绪'}catch(e){document.getElementById('save-status').textContent='本机保存不可用，请导出备份'}const page=location.hash.slice(1);if(H.nav.some(n=>n[0]===page))H.ui.page=page;H.render()};
  return H;
})();
