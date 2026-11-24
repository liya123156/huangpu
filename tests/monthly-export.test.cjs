/* Synthetic export checks: complete hierarchy, current column order and true zeros. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ops=[],boxes=[],encoded=[];
const ctx={font:'',fillStyle:'',textBaseline:'',strokeStyle:'',lineWidth:1,scale(){},measureText(t){return {width:String(t).length*10};},fillText(t,x,y){ops.push({text:String(t),x,y,color:this.fillStyle});},fillRect(){},strokeRect(x,y,width,height){boxes.push({x,y,width,height});}};
const H={fmt:x=>x===null||x===undefined?'—':String(x),monthlyFormatCell(n,m,k){const value=n.months[m][k]??0;return {text:k==='rate'?(value*100).toFixed(1)+'%':String(value),value,zero:value===0,asterisk:k==='owner'&&m==='2026-10'};}};
const document={fonts:{ready:Promise.resolve()},createElement(){return {width:0,height:0,getContext:()=>ctx,toBlob(cb){const blob={type:'image/png',width:this.width,height:this.height};encoded.push(blob);cb(blob);}};}};
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
 // A region-group image is one combined PNG, not a loop of store exports. Its
 // wider object column keeps store, group and manager labels together, and a
 // defensive kind boundary excludes any accidental person rows or rankings.
 const groupStores=['合成甲店','合成乙店','合成丙店','合成丁店'],groupRows=groupStores.flatMap((store,si)=>['A','B','C','D'].map((letter,gi)=>({level:'group',store,group:store+letter+'组',label:store+' · '+letter+'组',managerNames:['合成经理'+(si*4+gi+1)],months:Object.fromEntries(months.map(m=>[m,{...values,view:700+si*4+gi}]))})));
 const strayPerson={level:'person',label:'不应导出的合成个人',months:Object.fromEntries(months.map(m=>[m,{...values,view:98765}]))};
 const groupModel={...model,kind:'groups',store:'黄浦大区',title:'黄浦大区｜店组活动量',subtitle:'11月 · 16个店组',months:[selectedMonth],rows:[...groupRows,strayPerson]},groupBefore=JSON.stringify(groupModel),groupLayout=H.monthlyImageLayout(groupModel);
 assert.equal(groupLayout.widths[0],260);assert.equal(layout.widths[0],210);assert.equal(groupLayout.rowBlocks.length,16);assert(Math.abs(groupLayout.widths.reduce((sum,w)=>sum+w,0)+groupLayout.pad*2-groupLayout.width)<1e-8);
 const groupOpsStart=ops.length,encodedBefore=encoded.length,groupBlob=await H.renderMonthlyStorePNG(groupModel),groupOps=ops.slice(groupOpsStart);
 assert.equal(encoded.length,encodedBefore+1,'all sixteen groups are encoded into a single image');assert.equal(groupBlob.type,'image/png');
 for(const row of groupRows){assert(groupOps.some(op=>op.text===row.label),'every group is present');assert(groupOps.some(op=>op.text==='经理：'+row.managerNames[0]),'every manager label is present');assert(groupOps.some(op=>op.text===String(row.months[selectedMonth].view)),'every group total is present');}
 assert.equal(groupOps.filter(op=>op.text==='25.0%').length,16);assert(!groupOps.some(op=>['不应导出的合成个人','98765','合成标杆 · A组','合成提醒 · B组'].includes(op.text)));assert(!groupOps.some(op=>op.text.startsWith('本店活动量标杆与重点提醒')),'group exports have no individual ranking section');assert.equal(JSON.stringify(groupModel),groupBefore,'export filtering never edits the source model');
 const downloads=[],pending=new Map();H.monthlyExportModel=store=>({store,months,rows:[{}]});H.renderMonthlyStorePNG=m=>new Promise(resolve=>pending.set(m.store,resolve));H.download=(name,blob)=>downloads.push({name,blob});H.toast=()=>{};
 const first=H.saveMonthlyStore('合成甲店'),second=H.saveMonthlyStore('合成乙店');pending.get('合成甲店')('甲图片');await first;pending.get('合成乙店')('乙图片');await second;
 assert(downloads[0].name.startsWith('合成甲店_'));assert.equal(downloads[0].blob,'甲图片');assert(downloads[1].name.startsWith('合成乙店_'));assert.equal(downloads[1].blob,'乙图片');
 assert(downloads[0].name.includes('2026-09至2026-11'),'three-month filenames retain their date range');
 H.monthlyExportModel=store=>({store,months:[selectedMonth],rows:[{}]});const one=H.saveMonthlyStore('合成单月店');pending.get('合成单月店')('单月图片');await one;assert.equal(downloads[2].name,'合成单月店_活动量_2026-11.png');assert.equal(downloads[2].blob,'单月图片');
 const requestedGroups=[],renderedGroups=[],previews=[],messages=[];
 H.monthlyGroupExportModel=store=>{requestedGroups.push(store);return {...groupModel,store:store||'黄浦大区',rows:store?groupRows.filter(row=>row.store===store):groupRows};};H.monthlyExportModel=()=>{throw Error('group actions must use the group model');};
 H.renderMonthlyStorePNG=async exported=>{renderedGroups.push(exported);return {type:'image/png',scope:exported.store};};H.previewMonthlyStore=(blob,name,kind)=>previews.push({blob,name,kind});H.toast=message=>messages.push(message);
 await H.saveMonthlyGroups();assert.equal(downloads.length,4,'one region-group action creates one download');assert.equal(downloads[3].name,'黄浦大区_店组活动量_2026-11.png');assert.equal(renderedGroups[0].rows.length,16);assert.equal(renderedGroups[0].kind,'groups');assert.equal(renderedGroups[0].ranking,null);assert(messages.includes('店组看板图片已生成'));
 await H.copyMonthlyGroups('合成甲店');assert.equal(previews.length,1);assert.equal(previews[0].name,'合成甲店_店组活动量_2026-11.png');assert.equal(previews[0].kind,'groups');assert.equal(previews[0].blob.scope,'合成甲店');assert.equal(renderedGroups[1].rows.length,4);assert.equal(requestedGroups[1],'合成甲店');
 const clipboardWrites=[];sandbox.ClipboardItem=class{constructor(items){this.items=items;}};sandbox.navigator.clipboard={write:async items=>clipboardWrites.push(items)};
 await H.copyMonthlyGroups();assert.equal(clipboardWrites.length,1);assert.equal(clipboardWrites[0].length,1);assert.equal((await clipboardWrites[0][0].items['image/png']).scope,'黄浦大区');assert.equal(previews.length,1,'successful clipboard copy does not create a separate preview');assert(messages.includes('店组看板已复制，可直接粘贴图片'));
 sandbox.navigator.clipboard.write=async()=>{throw Error('synthetic clipboard rejection');};await H.copyMonthlyGroups('合成乙店');assert.equal(previews.length,2);assert.equal(previews[1].kind,'groups');assert.equal(previews[1].name,'合成乙店_店组活动量_2026-11.png');
 H.monthlyGroupExportModel=store=>({...groupModel,store:store||'黄浦大区',months,rows:groupRows.filter(row=>row.store===store)});await H.saveMonthlyGroups('合成丁店');assert.equal(downloads.at(-1).name,'合成丁店_店组活动量_2026-09至2026-11.png');assert.equal(renderedGroups.at(-1).rows.length,4);
 console.log('monthly export: full store and combined sixteen-group images, correct model/copy/save dispatch, single-month heights and isolation, three-month layout, zeros, rates, marks, column order and filenames passed');
})().catch(e=>{console.error(e);process.exit(1);});
