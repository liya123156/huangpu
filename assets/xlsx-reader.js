/* Canonical XLSX reader. Preserve blank XML cells separately from explicit zero. */
'use strict';
(() => {
const H=HP;
H.xlsxCell=(value,type,shared=[],inline='',hasFormula=false)=>{
 if(type==='inlineStr')return inline;
 if(value===undefined||value===null||String(value).trim()==='')return hasFormula?'公式未缓存':'';
 if(type==='s')return shared[Number(value)]??'';
 if(!type||type==='n'){const n=Number(value);if(!Number.isFinite(n))throw Error('Excel包含无效数字单元格');return n}
 return value;
};
const doc=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('Excel XML结构无法读取');return d};
const els=(e,n)=>[...e.getElementsByTagNameNS('*',n)];
const hasData=value=>value!==undefined&&value!==null&&(typeof value!=='string'||value.trim()!=='');
// A workbook can contain formatting all the way to row 1,048,576. Count data,
// not row coordinates, and retain coordinates separately for source tracing.
H.xlsxTableBuilder=()=>({rows:[],rowNumbers:[],dataCells:0,
 append(rowNumber,values){
  if(!Number.isInteger(rowNumber)||rowNumber<1||rowNumber>1048576)throw Error('Excel行号无效');
  let last=-1,count=0;for(let i=0;i<values.length;i++)if(hasData(values[i])){last=i;count++}
  if(last<0)return false;
  if(last>=300)throw Error('工作表有效数据超过300列');
  if(this.rows.length>=200000)throw Error('单张工作表有效数据超过200,000行');
  if(this.dataCells+count>2000000)throw Error('单张工作表有效数据超过2,000,000个单元格');
  this.rows.push(values.slice(0,last+1));this.rowNumbers.push(rowNumber);this.dataCells+=count;return true;
 }
});
// Yield a bounded import task without chaining timers. Hidden browser tabs can
// throttle setTimeout chains to one callback per minute.
H.xlsxYield=()=>{
 if(typeof globalThis.scheduler?.yield==='function')return globalThis.scheduler.yield();
 if(typeof globalThis.MessageChannel==='function')return new Promise(resolve=>{
  const channel=new globalThis.MessageChannel();
  channel.port1.onmessage=()=>{channel.port1.onmessage=null;channel.port1.close();channel.port2.close();resolve();};
  channel.port2.postMessage(null);
 });
 return Promise.resolve();
};
H.readXlsx=async (buffer,options={})=>{
 const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder();let tail=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){tail=i;break}
 if(tail<0)throw Error('请另存为标准.xlsx；暂不支持加密文件或旧.xls');
 const count=view.getUint16(tail+10,true);if(count>3000||count===65535)throw Error('工作簿过大或ZIP64暂不支持');
 let pos=view.getUint32(tail+16,true),rawTotal=0;const entries=new Map();
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('Excel压缩目录损坏');
  if(view.getUint16(pos+8,true)&1)throw Error('请先解除工作簿密码');
  const size=view.getUint32(pos+20,true),raw=view.getUint32(pos+24,true),nl=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
  rawTotal+=raw;if(rawTotal>80*1024*1024||raw>30*1024*1024)throw Error('解压内容超过限制');
  entries.set(decoder.decode(bytes.slice(pos+46,pos+46+nl)),{offset:view.getUint32(pos+42,true),size,raw,method:view.getUint16(pos+10,true)});pos+=46+nl+extra+comment;
 }
 const text=async name=>{
  const e=entries.get(name);if(!e)return '';const p=e.offset;if(p+30>bytes.length)throw Error('Excel文件损坏');
  const start=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);if(start+e.size>bytes.length)throw Error('Excel内容不完整');
  let value=bytes.slice(start,start+e.size);
  if(e.method===8){if(!globalThis.DecompressionStream)throw Error('请升级Chrome/Edge，或改用CSV');value=new Uint8Array(await new Response(new Blob([value]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}
  else if(e.method!==0)throw Error('不支持该Excel压缩方式');
  if(value.length!==e.raw)throw Error('Excel解压长度不一致');return decoder.decode(value);
 };
 const book=doc(await text('xl/workbook.xml')),relations=doc(await text('xl/_rels/workbook.xml.rels')),paths=new Map();
 for(const r of els(relations,'Relationship')){if(r.getAttribute('TargetMode')==='External')continue;const target=r.getAttribute('Target');const parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),out=[];for(const p of parts)if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);paths.set(r.getAttribute('Id'),out.join('/'))}
 const sharedXML=await text('xl/sharedStrings.xml'),shared=sharedXML?els(doc(sharedXML),'si').map(s=>els(s,'t').map(t=>t.textContent).join('')):[];
 const date1904=['1','true'].includes(els(book,'workbookPr')[0]?.getAttribute('date1904')),sheets=[],bookSheets=els(book,'sheet');let workbookCells=0;
 const report=async info=>{if(typeof options.onProgress==='function')options.onProgress(info);await H.xlsxYield();};
 for(let si=0;si<bookSheets.length;si++){
  const sheet=bookSheets[si],name=sheet.getAttribute('name')||'工作表';
  const id=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),path=paths.get(id);if(!path)continue;
  await report({sheet:name,index:si+1,total:bookSheets.length,processedRows:0,dataRows:0});
  const xml=doc(await text(path)),table=H.xlsxTableBuilder();let nextRow=0,processedRows=0,lastYieldRows=0,lastYieldCells=0;
  for(const row of els(xml,'row')){
   const ri=row.hasAttribute('r')?Number(row.getAttribute('r'))-1:nextRow;nextRow=ri+1;const values=[];let nextCol=0;
   for(const cell of els(row,'c')){
    const letters=(cell.getAttribute('r')||'').match(/^[A-Z]+/i)?.[0];let col=nextCol;
    if(letters){col=0;for(const letter of letters.toUpperCase())col=col*26+letter.charCodeAt(0)-64;col--}if(col<0||col>=16384)throw Error('Excel列号无效');nextCol=col+1;
    const value=els(cell,'v')[0]?.textContent,type=cell.getAttribute('t'),inline=els(cell,'t').map(t=>t.textContent).join('');
    const parsed=H.xlsxCell(value,type,shared,inline,els(cell,'f').length>0);
    // Empty formatting in far-right columns must not allocate wide arrays.
    if(hasData(parsed)){if(col>=300)throw Error('工作表有效数据超过300列');values[col]=parsed}
    else if(col<300)values[col]=parsed;
   }
   table.append(ri+1,values);processedRows++;
   if(table.dataCells-lastYieldCells>=12000||processedRows-lastYieldRows>=8192){
    lastYieldRows=processedRows;lastYieldCells=table.dataCells;
    await report({sheet:name,index:si+1,total:bookSheets.length,processedRows,dataRows:table.rows.length});
   }
  }
  workbookCells+=table.dataCells;if(workbookCells>4000000)throw Error('工作簿有效数据超过4,000,000个单元格');
  if(table.rows.length)sheets.push({name,rows:table.rows,rowNumbers:table.rowNumbers,date1904});
  await report({sheet:name,index:si+1,total:bookSheets.length,processedRows,dataRows:table.rows.length,done:true});
 }
 if(!sheets.length)throw Error('未找到可读取工作表');return sheets;
};
})();
