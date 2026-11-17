/* One composite PNG for all currently selected TOP5 cards. Entirely client-side. */
'use strict';
(() => {
const H=HP;
const face='"Microsoft YaHei","Noto Sans CJK SC","PingFang SC",sans-serif';
function wrap(ctx,text,width){const lines=[];let line='';for(const ch of String(text??'')){if(ch==='\n'){lines.push(line);line='';continue;}if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line=ch;}else line+=ch;}lines.push(line);return lines;}
H.renderLeaderboardPNG=async(model=H.lbModel())=>{
 await document.fonts.ready;
 if(!model.cards.length)throw Error('请先选择至少一个活动量指标');
 const width=1440,pad=40,gap=24,cw=(width-pad*2-gap)/2,measure=document.createElement('canvas').getContext('2d');
 const heights=model.cards.map(card=>{
  measure.font='700 23px '+face;const titleLines=wrap(measure,card.metric.label,cw-160);
  const titleHeight=74+Math.max(1,titleLines.length)*31;
  measure.font='15px '+face;const periodLines=wrap(measure,H.lbPeriodText(card)+(card.partial&&card.status==='ready'?' · 已导入部分':''),cw-48);
  const headHeight=titleHeight+periodLines.length*23+18;
  const displayRows=H.lbDisplayRows(card);
  const rowHeights=displayRows.map(row=>{if(row.members)return 50+Math.ceil(row.members.length/2)*(card.level==='person'?64:60);measure.font='600 22px '+face;const n=wrap(measure,H.lbName(row.entity),cw-170);measure.font='15px '+face;const meta=card.level==='person'?wrap(measure,H.lbMeta(row.entity),cw-170):[];return Math.max(68,n.length*28+meta.length*22+26);});
  const footer=(card.status==='ready'?`${card.knownCount}/${card.poolCount}${card.level==='group'?'个店组':'人'}有可比较数据${card.missingCount?' · '+card.missingCount+'个对象待补／待核':''}${card.tieExtra?' · 第5位同量全部保留':''}`:'缺失不补0，不生成虚构名次。');
  measure.font='14px '+face;const footerLines=wrap(measure,footer,cw-48),footerH=22+footerLines.length*21;
  return {headHeight,titleLines,periodLines,displayRows,rowHeights,footerLines,footerH,total:headHeight+Math.max(340,rowHeights.reduce((s,h)=>s+h,0))+footerH};
 });
 const rowHeights=[];for(let i=0;i<heights.length;i+=2)rowHeights.push(Math.max(...heights.slice(i,i+2).map(x=>x.total)));
 measure.font='16px '+face;
 const notes=[...model.notes,...(model.rolling.length?['近30天快照不计入自然周期：'+model.rolling.join('、')+'。']:[])];
 const footerLines=notes.flatMap(n=>wrap(measure,n,width-pad*2));
 const titleHeight=180,height=titleHeight+rowHeights.reduce((s,h)=>s+h,0)+gap*Math.max(0,rowHeights.length-1)+48+footerLines.length*26+54;
 const scale=Math.min(2,Math.sqrt(20000000/(width*height)),14000/height,14000/width);
 if(scale<.45)throw Error('榜单内容较多，请减少显示指标后再生成整张图片');
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
 const c=canvas.getContext('2d');c.scale(scale,scale);c.textBaseline='top';c.fillStyle='#f8f5fc';c.fillRect(0,0,width,height);
 function box(x,y,w,h,r,fill,stroke){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
 function text(str,x,y,size=18,color='#3f2a54',weight='400'){c.font=weight+' '+size+'px '+face;c.fillStyle=color;c.fillText(str,x,y);}
 box(pad,28,width-pad*2,126,16,'#311768');text(model.scope+' · '+model.range.label,pad+26,46,18,'#dfcff0');
 text('单项活动量标杆 TOP5',pad+26,81,34,'#ffffff','700');
 const levels=model.level==='both'?'店组＋个人':model.level==='group'?'店组':'个人',role=model.level==='group'?'':(' · '+(model.role==='all'?'顾问＋店经理':model.role));
 c.font='17px '+face;const badge=levels+role;text(badge,width-pad-26-c.measureText(badge).width,107,17,'#eadff7');
 let y=titleHeight;
 model.cards.forEach((card,i)=>{
  if(i&&i%2===0)y+=rowHeights[Math.floor(i/2)-1]+gap;
  const x=pad+(i%2)*(cw+gap),h=rowHeights[Math.floor(i/2)],d=heights[i];
  box(x,y,cw,h,14,'#ffffff','#dcccE9');
  text(card.level==='group'?'店组榜':'个人榜',x+24,y+20,15,'#8661a1','600');
  d.titleLines.forEach((line,j)=>text(line,x+24,y+48+j*31,23,'#3c235b','700'));
  text('TOP 5',x+cw-104,y+24,23,'#835e9f','700');
  const periodY=y+74+d.titleLines.length*31;d.periodLines.forEach((line,j)=>text(line,x+24,periodY+j*23,15,'#7d698c'));
  c.fillStyle='#eee6f5';c.fillRect(x+20,y+d.headHeight-3,cw-40,1);
  let ry=y+d.headHeight;
  if(card.status==='ready'){
   d.displayRows.forEach((row,j)=>{
    const rh=d.rowHeights[j],top=ry+12;
    box(x+23,top+3,30,30,8,row.rank<=3?'#68418e':'#f0eaf7');text(String(row.rank),x+30,top+7,18,row.rank<=3?'#ffffff':'#786386','700');
    if(row.members){
     text('并列第'+row.rank+' · '+row.members.length+(card.level==='group'?'个店组':'人'),x+68,top,20,'#382342','600');
     const tw=(cw-170)/2;
     row.members.forEach((member,k)=>{const tx=x+68+(k%2)*tw,ty=top+36+Math.floor(k/2)*(card.level==='person'?64:60);
      c.font='600 19px '+face;wrap(c,H.lbName(member.entity),tw-10).forEach((line,q)=>text(line,tx,ty+q*24,19,'#382342','600'));
      if(card.level==='person'){c.font='13px '+face;wrap(c,H.lbMeta(member.entity),tw-10).forEach((line,q)=>text(line,tx,ty+25+q*18,13,'#82708d'));}
     });
    }else{
     c.font='600 22px '+face;const lines=wrap(c,H.lbName(row.entity),cw-170);lines.forEach((line,k)=>text(line,x+68,top+k*28,22,'#382342','600'));
     let sy=top+lines.length*28;
     if(card.level==='person'){c.font='15px '+face;const meta=wrap(c,H.lbMeta(row.entity),cw-170);meta.forEach((line,k)=>text(line,x+68,sy+k*22,15,'#82708d'));sy+=meta.length*22;}
    }
    box(x+68,ry+rh-12,cw-170,4,2,'#f1eaf7');box(x+68,ry+rh-12,Math.max(4,(cw-170)*row.n/card.max),4,2,card.metric.g==='house'?'#9874bc':'#b391cc');
    const val=H.fmt(row.n);c.font='700 28px '+face;text(val,x+cw-24-c.measureText(val).width,top+5,28,'#52297a','700');
    ry+=rh;
   });
  }else{c.font='18px '+face;const lines=wrap(c,card.message,cw-100);text('—',x+cw/2-18,ry+85,36,'#c0b0ce');lines.forEach((line,k)=>{c.font='18px '+face;text(line,x+(cw-c.measureText(line).width)/2,ry+144+k*30,18,'#826d91');});}
  const fy=y+h-d.footerH;c.fillStyle='#f0e9f6';c.fillRect(x+20,fy,cw-40,1);d.footerLines.forEach((line,k)=>text(line,x+24,fy+11+k*21,14,'#826d91'));
 });
 let ny=titleHeight+rowHeights.reduce((s,h)=>s+h,0)+gap*Math.max(0,rowHeights.length-1)+28;
 footerLines.forEach(line=>{text(line,pad,ny,16,'#786785');ny+=26;});
 text('黄浦大区 · 组织管理与人效 · 内部工作资料',pad,height-30,14,'#8a7896');
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('排行榜图片生成失败')),'image/png'));
};
H.previewLeaderboard=blob=>{
 if(H.lbPreviewURL)URL.revokeObjectURL(H.lbPreviewURL);
 H.lbExportBlob=blob;H.lbPreviewURL=URL.createObjectURL(blob);
 H.modal('整张排行榜｜可右键复制或下载','<p class="subtle">只包含当前选择的单项榜单、周期和统计说明，不包含绩效评价或私密跟进。</p><img class="lb-export-preview" src="'+H.lbPreviewURL+'" alt="单项活动量TOP5完整排行榜">','<button class="btn" onclick="HP.close()">关闭</button><button class="btn primary" onclick="HP.download(\'黄浦_单项活动量TOP5.png\',HP.lbExportBlob)">下载整张图片</button>');
};
H.exportLeaderboard=async copy=>{
 const model=H.lbModel();if(!model.cards.length){H.toast('请先选择至少一个活动量指标');return;}
 const name='黄浦_单项活动量TOP5_'+model.range.start+'_'+model.range.end+'.png';
 const promise=H.renderLeaderboardPNG(model);
 try{
  if(copy&&navigator.clipboard?.write&&globalThis.ClipboardItem){
   try{await navigator.clipboard.write([new ClipboardItem({'image/png':promise})]);H.toast('整张排行榜已复制，可直接粘贴到微信');return;}catch(e){const blob=await promise;H.previewLeaderboard(blob);H.toast('浏览器未允许直接复制，已打开整张图片，可右键复制或下载');return;}
  }
  const blob=await promise;if(copy){H.previewLeaderboard(blob);}else{H.download(name,blob);H.toast('整张TOP5排行榜已生成');}
 }catch(e){H.toast('生成排行榜失败：'+e.message);}
};
})();
