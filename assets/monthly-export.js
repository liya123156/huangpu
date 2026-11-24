/* Complete store snapshots, drawn locally from the same monthly view as the screen. */
'use strict';
(() => {
const H=HP,face='"Microsoft YaHei","Noto Sans CJK SC","PingFang SC",sans-serif';
const wrap=(ctx,text,width)=>{const lines=[];let line='';for(const ch of String(text??'')){if(ch==='\n'){lines.push(line);line='';continue;}if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line=ch;}else line+=ch;}lines.push(line);return lines;};
const monthLabel=m=>Number(String(m).slice(5,7))+'月';
const rankReason=(item,ranking,side)=>{
 if(typeof H.monthlyRankReason==='function')return H.monthlyRankReason(item,ranking,side);
 const values=item.values||{};
 return '买卖带看 '+H.fmt(values.view)+' 次；重点渠道新增 '+H.fmt(values.channel)+'。两项等权百分位综合'+(side==='bottom'?'位于本店末段，建议核实活动安排与需要的支持。':'位于本店前列，可结合具体案例分享做法。');
};
H.monthlyImageLayout=model=>{
 const columns=model.columns.filter(c=>!['organization','object','month'].includes(c.key||c.id));
 const width=1440,pad=36,objectWidth=210,monthWidth=84,remaining=width-pad*2-objectWidth-monthWidth;
 const weights={house:1,owner:.82,hmall:1,channel:1,entered:1.25,rate:1.2,view:1};
 const total=columns.reduce((s,c)=>s+(weights[c.key||c.id]||1),0);
 return {width,pad,columns,widths:[objectWidth,monthWidth,...columns.map(c=>remaining*(weights[c.key||c.id]||1)/total)],rowHeight:44,headerHeight:110,titleHeight:130};
};
H.renderMonthlyStorePNG=async model=>{
 if(document.fonts?.ready)await document.fonts.ready;
 if(!model.rows?.length)throw Error('该店暂无可导出的月度记录');
 const layout=H.monthlyImageLayout(model),{width,pad,columns,widths,rowHeight,headerHeight,titleHeight}=layout;
 const months=model.months,measure=document.createElement('canvas').getContext('2d');
 if(!measure)throw Error('当前浏览器无法生成图片');
 measure.font='16px '+face;
 const notes=(model.notes||[]).flatMap(n=>wrap(measure,n,width-pad*2));
 const ranking=model.ranking,halfWidth=(width-pad*2-24)/2,rankCards=[];
 if(ranking){
  const separate=ranking.status==='separate';
  const groups=separate?[{title:'标杆前三名',items:ranking.top||[],side:'top'},{title:'后三名 · 重点提醒',items:ranking.bottom||[],side:'bottom'}]:[{title:'本店活动量情况',items:ranking.all||[],side:'all'}];
  for(const group of groups){
   const cardWidth=separate?halfWidth:width-pad*2;
   const entries=group.items.map(item=>{
    measure.font='bold 20px '+face;
    const title=wrap(measure,(item.name||item.person||'')+' · '+String(item.group||'').replace(model.store,''),cardWidth-38);
    measure.font='16px '+face;
    const reason=wrap(measure,rankReason(item,ranking,group.side),cardWidth-38);
    return {title,reason,values:item.values||{},height:44+title.length*28+reason.length*24};
   });
   rankCards.push({...group,entries,width:cardWidth,height:60+Math.max(70,entries.reduce((s,x)=>s+x.height,0))+18});
  }
 }
 measure.font='16px '+face;
 const rankingNotes=[];
 if(ranking){
  rankingNotes.push('比较月份：'+monthLabel(model.rankMonth||months.at(-1))+'；按已核对顾问的买卖带看、重点渠道新增两项等权百分位比较，第三位并列全部保留。');
  if(ranking.status!=='separate')rankingNotes.push(ranking.status==='none'?'可比较记录不足，暂不划分前三和后三。':'人数不足、同分或前后范围交叉时，只展示现有数据，不强行划分前三和后三。');
  if(ranking.missing?.length)rankingNotes.push('资料待补：'+ranking.missing.map(p=>(p.name||p.person)+'（'+(p.missing||[]).join('、')+'）').join('；')+'。缺失未作为0参与排名。');
 }
 const rankNoteLines=rankingNotes.flatMap(n=>wrap(measure,n,width-pad*2));
 const tableHeight=headerHeight+model.rows.length*months.length*rowHeight;
 const notesHeight=notes.length?28+notes.length*24:0;
 const ranksHeight=ranking?76+Math.max(0,...rankCards.map(c=>c.height))+24+rankNoteLines.length*24:0;
 const height=titleHeight+tableHeight+notesHeight+ranksHeight+62;
 const scale=Math.min(1.6,Math.sqrt(22000000/(width*height)),16000/height,16000/width);
 if(scale<.7)throw Error('这家店的记录过长，请缩短对比月份后再复制');
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器无法生成图片');
 ctx.scale(scale,scale);ctx.textBaseline='top';ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
 const text=(s,x,y,size=20,color='#252139',bold=false)=>{ctx.font=(bold?'700 ':'400 ')+size+'px '+face;ctx.fillStyle=color;ctx.fillText(String(s??''),x,y);};
 const box=(x,y,w,h,fill)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#ddd6ed';ctx.lineWidth=.8;ctx.strokeRect(x,y,w,h);};
 const center=(s,x,y,w,h,size=20,color='#252139',bold=false)=>{ctx.font=(bold?'700 ':'400 ')+size+'px '+face;const lines=wrap(ctx,s,w-20),lineHeight=size+7,top=y+(h-lines.length*lineHeight)/2+2;for(let i=0;i<lines.length;i++)text(lines[i],x+(w-ctx.measureText(lines[i]).width)/2,top+i*lineHeight,size,color,bold);};
 ctx.fillStyle='#210d54';ctx.fillRect(pad,22,width-pad*2,90);
 text(model.title||model.store+' · 月度活动量',pad+22,39,29,'#ffffff',true);
 text(model.subtitle||months.map(monthLabel).join(' / ')+' · 门店、店组、个人',pad+22,78,17,'#e2d8f3');
 let x=pad,y=titleHeight;
 const headers=['组织 / 姓名','月份',...columns.map(c=>c.label)];
 widths.forEach((w,i)=>{box(x,y,w,headerHeight,'#eee9f8');center(headers[i],x,y,w,headerHeight,20,'#3a2856',true);x+=w;});
 y+=headerHeight;
 for(const node of model.rows){
  const orgFill=node.level==='store'?'#eee6fa':node.level==='group'?'#f5f0fb':'#ffffff';
  box(pad,y,widths[0],rowHeight*months.length,orgFill);
  const indent=node.level==='person'?26:node.level==='group'?18:12;
  const levelLabel=node.level==='person'&&node.role&&node.role!=='待核对'?node.role:({region:'大区',store:'门店',group:'店组',person:'个人'}[node.level]||'');
  text(levelLabel,pad+indent,y+20,14,'#79678e');
  ctx.font=(node.level==='person'?'400 ':'700 ')+'22px '+face;
  const nameLines=wrap(ctx,node.label||node.person||node.group||node.store,widths[0]-indent-16);
  nameLines.forEach((line,i)=>text(line,pad+indent,y+47+i*29,22,'#3b275c',node.level!=='person'));
  for(const month of months){
   x=pad+widths[0];const fill=month===months.at(-1)?'#f8f5fc':'#ffffff';
   box(x,y,widths[1],rowHeight,fill);center(monthLabel(month),x,y,widths[1],rowHeight,18,'#655a75');x+=widths[1];
   columns.forEach((column,index)=>{
    const key=column.key||column.id,value=node.months?.[month]?.[key],cell=H.monthlyFormatCell(node,month,key),zero=value===0;
    box(x,y,widths[index+2],rowHeight,zero?'#fcf0f2':fill);
    center(cell.text,x,y,widths[index+2],rowHeight,20,zero?'#c83245':value===null||value===undefined?'#9a90a6':'#252139',zero);
    if(cell.asterisk)text('*',x+widths[index+2]-14,y+5,15,'#a76811');
    x+=widths[index+2];
   });
   y+=rowHeight;
  }
  ctx.fillStyle='#cbbde1';ctx.fillRect(pad,y-1,width-pad*2,2);
 }
 if(notes.length){y+=18;for(const line of notes){text(line,pad,y,16,'#776783');y+=24;}y+=10;}
 if(ranking){
  y+=20;text('本店活动量标杆与重点提醒 · '+monthLabel(model.rankMonth||months.at(-1)),pad,y,25,'#352047',true);y+=50;
  const cardHeight=Math.max(0,...rankCards.map(c=>c.height));
  rankCards.forEach((card,index)=>{
   const cx=pad+(rankCards.length===2?index*(halfWidth+24):0);
   box(cx,y,card.width,cardHeight,card.side==='bottom'?'#fff9f5':'#faf7fe');
   text(card.title,cx+18,y+18,22,card.side==='bottom'?'#825537':'#4c316b',true);
   let cy=y+56;
   if(!card.entries.length)text('暂无可比较对象',cx+18,cy+10,17,'#81738d');
   for(const entry of card.entries){
    entry.title.forEach((line,i)=>text(line,cx+18,cy+i*28,20,'#352447',true));cy+=entry.title.length*28;
    let tx=cx+18;
    for(const part of [{s:'买卖带看 '},{s:H.fmt(entry.values.view),zero:entry.values.view===0,bold:true},{s:' 次；重点渠道新增 '},{s:H.fmt(entry.values.channel),zero:entry.values.channel===0,bold:true}]){text(part.s,tx,cy,16,part.zero?'#c83245':'#6f627d',part.bold);tx+=ctx.measureText(part.s).width;}
    cy+=26;entry.reason.forEach((line,i)=>text(line,cx+18,cy+i*24,16,'#6f627d'));cy+=entry.reason.length*24+18;
   }
  });
  y+=cardHeight+22;for(const line of rankNoteLines){text(line,pad,y,16,'#776783');y+=24;}
 }
 text('黄浦大区 · 组织管理与人效 · 内部工作资料',pad,height-30,14,'#8a7a98');
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片生成失败')),'image/png'));
};
H.previewMonthlyStore=(blob,filename)=>{
 if(H.monthlyPreviewURL)URL.revokeObjectURL(H.monthlyPreviewURL);
 H.monthlyExportBlob=blob;H.monthlyExportFilename=filename;H.monthlyPreviewURL=URL.createObjectURL(blob);
 H.modal('门店看板图片','<p class="subtle">已包含本店全部店组和个人。可右键复制图片，或保存后发送。</p><img style="display:block;width:100%;height:auto;border:1px solid #ddd3ea" src="'+H.monthlyPreviewURL+'" alt="完整门店月度活动量看板图片">','<button class="btn" onclick="HP.close()">关闭</button><button class="btn primary" onclick="HP.download(HP.monthlyExportFilename,HP.monthlyExportBlob)">保存图片</button>');
};
const exportStore=async(store,copy)=>{
 try{
  const model=H.monthlyExportModel(store);if(!store||!model.rows?.length){H.toast('请先选择有数据的门店');return;}
  const filename=(store+'_活动量_'+model.months[0]+'至'+model.months.at(-1)+'.png').replace(/[\\/:*?"<>|]/g,'_');
  const promise=H.renderMonthlyStorePNG(model);
  if(copy&&navigator.clipboard?.write&&globalThis.ClipboardItem){
   try{await navigator.clipboard.write([new ClipboardItem({'image/png':promise})]);H.toast('本店完整看板已复制，可直接粘贴图片');return;}
   catch(error){const blob=await promise;H.previewMonthlyStore(blob,filename);H.toast('浏览器未允许直接复制，已打开完整图片，可右键复制或保存');return;}
  }
  const blob=await promise;if(copy)H.previewMonthlyStore(blob,filename);else{H.download(filename,blob);H.toast('本店完整看板图片已生成');}
 }catch(error){H.toast('图片未生成：'+error.message);}
};
H.copyMonthlyStore=store=>exportStore(store,true);
H.saveMonthlyStore=store=>exportStore(store,false);
})();
