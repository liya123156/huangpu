/* Synthetic export checks: complete hierarchy, current column order and true zeros. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ops=[],boxes=[];
const ctx={font:'',fillStyle:'',textBaseline:'',strokeStyle:'',lineWidth:1,scale(){},measureText(t){return {width:String(t).length*10};},fillText(t,x,y){ops.push({text:String(t),x,y,color:this.fillStyle});},fillRect(){},strokeRect(x,y,width,height){boxes.push({x,y,width,height});}};
const H={fmt:x=>x===null||x===undefined?'—':String(x),monthlyFormatCell(n,m,k){const value=n.months[m][k]??0;return {text:k==='rate'?(value*100).toFixed(1)+'%':String(value),value,zero:value===0,asterisk:k==='owner'&&m==='2026-10'};}};
const document={fonts:{ready:Promise.resolve()},createElement(){return {width:0,height:0,getContext:()=>ctx,toBlob(cb){cb({type:'image/png',width:this.width,height:this.height});}};}};
const sandbox={HP:H,document,navigator:{},URL:{},console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/monthly-export.js'),'utf8'),sandbox);
const months=['2026-09','2026-10','2026-11'];
const columns=[['view','买卖带看次数'],['house','新增买卖房源'],['owner','业主面见'],['hmall','hmall陪带次数'],['channel','重点渠道新增'],['entered','重点渠道当月进入带看'],['rate','重点渠道进入带看率']].map(([key,label])=>({key,label}));
const values={view:7,house:0,owner:2,hmall:null,channel:4,entered:1,rate:.25};
const nodes=Array.from({length:22},(_,i)=>({level:i===0?'store':i===1?'group':'person',label:i===0?'合成门店':i===1?'A组':'合成顾问'+i,months:Object.fromEntries(months.map(m=>[m,{...values}]))}));
const model={store:'合成门店',title:'合成门店活动量',subtitle:'9月 / 10月 / 11月',columns,months,rows:nodes,notes:['未记录活动量按0；新增与进入带看均为0时进入带看率按0.0%显示。'],ranking:{status:'separate',top:[{name:'合成标杆',group:'A组',values:{view:7,channel:4}}],bottom:[{name:'合成提醒',group:'B组',values:{view:0,channel:0}}],missing:[]},rankMonth:'2026-11'};
(async()=>{
 const layout=H.monthlyImageLayout(model);assert.equal(layout.columns[0].key,'view');assert.equal(layout.widths.length,9);assert(Math.abs(layout.widths.reduce((a,b)=>a+b,0)+layout.pad*2-layout.width)<1e-8);
 assert(layout.rowBlocks.every(row=>row.height===96&&row.monthHeight===32),'ordinary three-month rows retain the established layout');assert.equal(layout.tableHeight,layout.headerHeight+22*3*32);
 const blob=await H.renderMonthlyStorePNG(model);assert.equal(blob.type,'image/png');
 assert(ops.some(x=>x.text==='合成顾问21'),'long store table must contain its last person, not just its first page');
 const headerView=ops.find(x=>x.text==='买卖带看次数'),headerHouse=ops.find(x=>x.text==='新增买卖房源');assert(headerView.x<headerHouse.x,'image follows dragged column order');
 assert.equal(ops.filter(x=>x.text==='25.0%').length,66,'all months and entities keep ratio precision');
 assert.equal(ops.filter(x=>x.text==='0'&&x.color==='#c83245').length,134,'explicit and unrecorded table zeros and the two ranking zeros use red');
 assert.equal(ops.filter(x=>x.text==='—'&&x.color==='#9a90a6').length,0,'unrecorded quantities no longer use dashes');
 assert(ops.some(x=>x.text==='合成标杆 · A组'));assert(ops.some(x=>x.text==='合成提醒 · B组'));assert.equal(ops.filter(x=>x.text==='*').length,22);
 const lastRow=ops.find(x=>x.text==='合成顾问21'),rankingTitle=ops.find(x=>x.text.startsWith('本店活动量标杆与重点提醒'));assert(lastRow.y<rankingTitle.y,'rankings follow the whole table');
 // The source nodes still hold three months, while the requested image contains
 // exactly one. Long names and manager lines must fit their own object block.
 const selectedMonth='2026-11',singleRows=nodes.map((node,i)=>({...node,months:Object.fromEntries(months.map((m,j)=>[m,{...values,view:[903,1003,1103][j]+i,rate:[.09,.10,.11][j]}]))}));
 singleRows[1].label='需要分行呈现且不能覆盖下一位顾问的合成店组名称';singleRows[1].managerNames=['合成经理甲姓名也较长','合成经理乙','合成经理丙'];singleRows[2].label='需要分行但仍应完整保留的合成长姓名顾问';
 const singleModel={...model,months:[selectedMonth],rows:singleRows,subtitle:'11月',rankMonth:selectedMonth},singleLayout=H.monthlyImageLayout(singleModel),sameRowsThree=H.monthlyImageLayout({...singleModel,months});
 assert(singleLayout.rowBlocks[1].managerLines.length>1,'fixture exercises wrapped manager names');assert(singleLayout.rowBlocks[2].nameLines.length>1,'fixture exercises wrapped person names');assert.equal(singleLayout.rowBlocks[3].height,32,'an ordinary single-month consultant stays compact');
 assert(singleLayout.rowBlocks.every(row=>row.monthHeight===row.height));assert.equal(singleLayout.tableHeight,singleLayout.headerHeight+singleLayout.rowBlocks.reduce((sum,row)=>sum+row.height,0));assert(singleLayout.tableHeight<sameRowsThree.tableHeight);
 const opsStart=ops.length,boxesStart=boxes.length,singleBlob=await H.renderMonthlyStorePNG(singleModel),singleOps=ops.slice(opsStart),singleBoxes=boxes.slice(boxesStart);
 assert(singleBlob.height<blob.height,'one-month output is smaller than the same store three-month output');assert(!singleOps.some(x=>['9月','10月','903','1003','9.0%','10.0%'].includes(x.text)),'non-selected source months do not leak into the image');assert.equal(singleOps.filter(x=>x.text==='11.0%').length,22);assert(singleOps.some(x=>x.text==='1103'));
 assert(!singleOps.some(x=>x.text==='门店'||x.text==='店组'),'single-month entity cells omit the small kind caption');
 let blockTop=singleLayout.titleHeight+singleLayout.headerHeight;
 for(const [i,row] of singleLayout.rowBlocks.entries()){
  for(const [lineIndex,line] of row.nameLines.entries()){const op=singleOps.find(x=>x.text===line&&Math.abs(x.y-(blockTop+row.nameTop+lineIndex*28))<1e-8);assert(op,'all wrapped entity-name lines are drawn');assert(op.y>=blockTop&&op.y+22<=blockTop+row.height,'name must stay inside its object block');}
  for(const [lineIndex,line] of row.managerLines.entries()){const op=singleOps.find(x=>x.text===line&&Math.abs(x.y-(blockTop+row.managerTop+lineIndex*18))<1e-8);assert(op,'manager names are not truncated');assert(op.y+14<=blockTop+row.height,'manager text cannot overlap the following row');}
  const cells=singleBoxes.filter(b=>Math.abs(b.y-blockTop)<1e-8);assert.equal(cells.length,9,'object, month and all seven metrics share one row');assert(cells.every(b=>Math.abs(b.height-row.height)<1e-8),'all selected-month metrics use the same computed row height');
  const metricText=singleOps.find(x=>x.text===String(1103+i));assert(metricText&&metricText.y>=blockTop&&metricText.y+20<=blockTop+row.height);blockTop+=row.height;
 }
 assert.equal(blockTop,singleLayout.titleHeight+singleLayout.tableHeight);assert(singleOps.find(x=>x.text.startsWith('本店活动量标杆与重点提醒')).y>blockTop);
 const downloads=[],pending=new Map();H.monthlyExportModel=store=>({store,months,rows:[{}]});H.renderMonthlyStorePNG=m=>new Promise(resolve=>pending.set(m.store,resolve));H.download=(name,blob)=>downloads.push({name,blob});H.toast=()=>{};
 const first=H.saveMonthlyStore('合成甲店'),second=H.saveMonthlyStore('合成乙店');pending.get('合成甲店')('甲图片');await first;pending.get('合成乙店')('乙图片');await second;
 assert(downloads[0].name.startsWith('合成甲店_'));assert.equal(downloads[0].blob,'甲图片');assert(downloads[1].name.startsWith('合成乙店_'));assert.equal(downloads[1].blob,'乙图片');
 assert(downloads[0].name.includes('2026-09至2026-11'),'three-month filenames retain their date range');
 H.monthlyExportModel=store=>({store,months:[selectedMonth],rows:[{}]});const one=H.saveMonthlyStore('合成单月店');pending.get('合成单月店')('单月图片');await one;assert.equal(downloads[2].name,'合成单月店_活动量_2026-11.png');assert.equal(downloads[2].blob,'单月图片');
 console.log('monthly export: complete hierarchy, one-month-only data, dynamic name/manager row heights, unchanged three-month rows, zeros, rates, marks, column order and concurrent filenames passed');
})().catch(e=>{console.error(e);process.exit(1);});
