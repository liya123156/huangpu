/* V3.2 image layout: same column sizing as screen, larger type, no private notes. */
'use strict';
(() => {
const H=HP;
const wrap=(ctx,text,width)=>{const lines=[];let line='';for(const ch of String(text??'')){if(ch==='\n'){lines.push(line);line='';continue}if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line=ch}else line+=ch}lines.push(line);return lines};
H.renderPNG=async(model,rows,page,total)=>{
 await document.fonts.ready;
 const widths=H.tableWidths(model),margin=32,width=widths.reduce((a,b)=>a+b,0)+margin*2,fontSize=Number(H.data.tableDisplay?.fontSize)||18;
 const scratch=document.createElement('canvas').getContext('2d');scratch.font='15px "Microsoft YaHei",sans-serif';const notes=(model.notes||[]).flatMap(n=>wrap(scratch,n,width-margin*2-16));
 const titleHeight=116,two=model.groupHeaders!==false,headerHeight=two?138:90,rowHeight=Math.max(64,fontSize*2+28),height=titleHeight+headerHeight+Math.max(1,rows.length)*rowHeight+notes.length*24+70;
 const scale=Math.min(2,Math.sqrt(20000000/(width*height)),14000/width,14000/height);const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.textBaseline='middle';
 ctx.fillStyle='#241537';ctx.font='bold 29px "Microsoft YaHei",sans-serif';ctx.fillText(model.title,margin,42);ctx.font='16px "Microsoft YaHei",sans-serif';ctx.fillStyle='#786886';ctx.fillText((model.subtitle||'')+(total>1?' · 第'+(page+1)+'/'+total+'张':''),margin,82);
 const rect=(x,y,w,h,fill)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#cdbfdd';ctx.lineWidth=.9;ctx.strokeRect(x,y,w,h)};
 const text=(s,x,y,w,h,{bold=false,color='#32273f',align='center',size=fontSize,max=4}={})=>{ctx.font=(bold?'bold ':'')+size+'px "Microsoft YaHei",sans-serif';ctx.fillStyle=color;const lines=wrap(ctx,s,w-22),shown=lines.slice(0,max);if(lines.length>max)shown[max-1]=shown[max-1].slice(0,-1)+'…';const lineHeight=size+5,top=y+(h-shown.length*lineHeight)/2+lineHeight/2;shown.forEach((l,i)=>{const tx=align==='left'?x+12:x+(w-ctx.measureText(l).width)/2;ctx.fillText(l,tx,top+i*lineHeight)})};
 let x=margin,y=titleHeight;
 if(two){rect(x,y,widths[0],headerHeight,'#eee6f7');text(model.columns[0].label,x,y,widths[0],headerHeight,{bold:true,align:'left'});x+=widths[0];const groups=[];model.columns.slice(1).forEach((c,i)=>{const g=c.g||'result';if(groups.at(-1)?.g===g)groups.at(-1).w+=widths[i+1];else groups.push({g,w:widths[i+1]})});for(const g of groups){rect(x,y,g.w,48,{result:'#382366',house:'#614290',customer:'#8966b1'}[g.g]||'#614290');text(H.groupNames[g.g]||g.g,x,y,g.w,48,{bold:true,color:'#ffffff',size:18});x+=g.w}x=margin+widths[0];model.columns.slice(1).forEach((c,i)=>{rect(x,y+48,widths[i+1],90,'#f0eaf7');text(c.label+(c.unit?'\n'+c.unit:''),x,y+48,widths[i+1],90,{bold:true,size:16});x+=widths[i+1]})}else{model.columns.forEach((c,i)=>{rect(x,y,widths[i],headerHeight,'#eee6f7');text(c.label+(c.unit?'\n'+c.unit:''),x,y,widths[i],headerHeight,{bold:true,size:16});x+=widths[i]})}
 y+=headerHeight;
 const drawRows=rows.length?rows:[{cells:['暂无数据',...model.columns.slice(1).map(()=> '—')]}];
 drawRows.forEach((r,ri)=>{x=margin;const fill={region:'#e9dff5',store:'#f0e9f8',group:'#f7f3fc'}[r.level]||(ri%2?'#fcfbfe':'#ffffff');model.columns.forEach((c,i)=>{rect(x,y,widths[i],rowHeight,fill);text(r.cells[i]??'',x,y,widths[i],rowHeight,{bold:['region','store'].includes(r.level),align:i===0?'left':'center',size:fontSize,max:2});x+=widths[i]});y+=rowHeight});
 ctx.font='15px "Microsoft YaHei",sans-serif';ctx.fillStyle='#73647f';notes.forEach((line,i)=>ctx.fillText(line,margin,y+30+i*24));ctx.font='13px "Microsoft YaHei",sans-serif';ctx.fillText('黄浦大区 · 目标与活动量工作台',margin,height-22);
 return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片生成失败')),'image/png'));
};
})();
