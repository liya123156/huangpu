/* Synthetic export checks: complete hierarchy, current column order and true zeros. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ops=[];
const ctx={font:'',fillStyle:'',textBaseline:'',strokeStyle:'',lineWidth:1,scale(){},measureText(t){return {width:String(t).length*10};},fillText(t,x,y){ops.push({text:String(t),x,y,color:this.fillStyle});},fillRect(){},strokeRect(){}};
const H={fmt:x=>x===null||x===undefined?'—':String(x),monthlyFormatCell(n,m,k){const value=n.months[m][k];return {text:value===null?'—':k==='rate'?(value*100).toFixed(1)+'%':String(value),value,zero:value===0,asterisk:k==='owner'&&m==='2026-10'};}};
const document={fonts:{ready:Promise.resolve()},createElement(){return {width:0,height:0,getContext:()=>ctx,toBlob:cb=>cb({type:'image/png'})};}};
const sandbox={HP:H,document,navigator:{},URL:{},console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/monthly-export.js'),'utf8'),sandbox);
const months=['2026-09','2026-10','2026-11'];
const columns=[['view','买卖带看次数'],['house','新增买卖房源'],['owner','业主面见'],['hmall','hmall陪带次数'],['channel','重点渠道新增'],['entered','重点渠道当月进入带看'],['rate','重点渠道进入带看率']].map(([key,label])=>({key,label}));
const values={view:7,house:0,owner:2,hmall:null,channel:4,entered:1,rate:.25};
const nodes=Array.from({length:22},(_,i)=>({level:i===0?'store':i===1?'group':'person',label:i===0?'合成门店':i===1?'A组':'合成顾问'+i,months:Object.fromEntries(months.map(m=>[m,{...values}]))}));
const model={store:'合成门店',title:'合成门店活动量',subtitle:'9月 / 10月 / 11月',columns,months,rows:nodes,notes:['0为明确零值；—为未提供。'],ranking:{status:'separate',top:[{name:'合成标杆',group:'A组',values:{view:7,channel:4}}],bottom:[{name:'合成提醒',group:'B组',values:{view:0,channel:0}}],missing:[]},rankMonth:'2026-11'};
(async()=>{
 const layout=H.monthlyImageLayout(model);assert.equal(layout.columns[0].key,'view');assert.equal(layout.widths.length,9);assert(Math.abs(layout.widths.reduce((a,b)=>a+b,0)+layout.pad*2-layout.width)<1e-8);
 const blob=await H.renderMonthlyStorePNG(model);assert.equal(blob.type,'image/png');
 assert(ops.some(x=>x.text==='合成顾问21'),'long store table must contain its last person, not just its first page');
 const headerView=ops.find(x=>x.text==='买卖带看次数'),headerHouse=ops.find(x=>x.text==='新增买卖房源');assert(headerView.x<headerHouse.x,'image follows dragged column order');
 assert.equal(ops.filter(x=>x.text==='25.0%').length,66,'all months and entities keep ratio precision');
 assert.equal(ops.filter(x=>x.text==='0'&&x.color==='#c83245').length,68,'explicit table zeros and the two ranking zeros use red');
 assert.equal(ops.filter(x=>x.text==='—'&&x.color==='#9a90a6').length,66,'missing values stay gray');
 assert(ops.some(x=>x.text==='合成标杆 · A组'));assert(ops.some(x=>x.text==='合成提醒 · B组'));assert.equal(ops.filter(x=>x.text==='*').length,22);
 const lastRow=ops.find(x=>x.text==='合成顾问21'),rankingTitle=ops.find(x=>x.text.startsWith('本店活动量标杆与重点提醒'));assert(lastRow.y<rankingTitle.y,'rankings follow the whole table');
 const downloads=[],pending=new Map();H.monthlyExportModel=store=>({store,months,rows:[{}]});H.renderMonthlyStorePNG=m=>new Promise(resolve=>pending.set(m.store,resolve));H.download=(name,blob)=>downloads.push({name,blob});H.toast=()=>{};
 const first=H.saveMonthlyStore('合成甲店'),second=H.saveMonthlyStore('合成乙店');pending.get('合成甲店')('甲图片');await first;pending.get('合成乙店')('乙图片');await second;
 assert(downloads[0].name.startsWith('合成甲店_'));assert.equal(downloads[0].blob,'甲图片');assert(downloads[1].name.startsWith('合成乙店_'));assert.equal(downloads[1].blob,'乙图片');
 console.log('monthly export: complete store table, zero/missing distinction, rates, source marks, reordered columns and concurrent filenames passed');
})().catch(e=>{console.error(e);process.exit(1);});
