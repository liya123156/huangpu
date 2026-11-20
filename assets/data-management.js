/* Import lifecycle and management-role metadata. Public code: no employee data. */
'use strict';
(() => {
const H=HP;
H.version='3.2';
const arrays=['facts','novRoster','novChannels','flowFacts','novUnassigned','novAudit','history'];
const empty=H.empty,clean=H.cleanBackup;
H.empty=()=>({...empty(),sourceTrash:[],tableDisplay:{fontSize:18,objectWidth:220},maintenanceVersion:0});
H.isLeader=r=>!!r.management||/大区总|店总|大区负责人/.test(String(r.role||''));
H.migrateManagers=d=>{
 let changed=false;
 // This legacy supplementary roster was explicitly identified by the owner as management.
 // Never infer that arbitrary missing assignments are managers, and never guess a store.
 for(const r of d.novRoster||[]){
  if(r.source==='本次消息 / 补充入职名单'&&!r.store&&!r.group&&r.role==='岗位归属待补'){
   r.role='大区总／店总';r.management=true;r.roleBasis='用户确认：本批补充名单为大区总和店总；具体岗位与门店可编辑';changed=true;
  }
 }
 if(!d.sourceTrash)d.sourceTrash=[];
 if(!d.tableDisplay)d.tableDisplay={fontSize:18,objectWidth:220};
 d.maintenanceVersion=1;
 return changed;
};
H.cleanBackup=source=>{
 const d=clean(source);
 if(!Array.isArray(d.sourceTrash)||d.sourceTrash.length>1000)throw Error('回收记录格式不正确或超出上限');
 for(const x of d.sourceTrash){if(!x||typeof x.id!=='string'||!x.removed||typeof x.removed!=='object')throw Error('回收记录缺少来源信息');for(const k of arrays){if(x.removed[k]!==undefined&&!Array.isArray(x.removed[k]))throw Error('回收记录数组不正确');}}
 if(!d.tableDisplay||typeof d.tableDisplay!=='object')d.tableDisplay={};
 d.tableDisplay.fontSize=Math.max(15,Math.min(22,Number(d.tableDisplay.fontSize)||18));
 d.tableDisplay.objectWidth=Math.max(180,Math.min(360,Number(d.tableDisplay.objectWidth)||220));
 H.migrateManagers(d);return d;
};
H.sourceFile=(r,collection,data=H.data)=>{
 if(collection==='novAudit'||collection==='history')return typeof r.file==='string'?r.file:'';
 if(r.sourceFile)return String(r.sourceFile);
 const source=String(r.source||'');
 const match=source.match(/^(.*?\.(?:xlsx|xls|csv|tsv|txt|json|png|jpg|jpeg|webp))(?:\s*\/\s*.*)?$/i);
 if(match)return match[1];
 const hashes=(data.history||[]).filter(x=>x.file&&r.sourceHash&&x.hash===r.sourceHash);
 if(hashes.length===1)return hashes[0].file;
 if(source.startsWith('本次消息 / '))return (data.history||[]).find(x=>x.file&&x.category==='roster'&&String(x.file).includes('人员名单'))?.file||'本次消息中的三份人员名单';
 return source.split(' / ')[0]||'';
};
H.sourceList=(data=H.data)=>{
 const map=new Map();
 const get=file=>{if(!map.has(file))map.set(file,{file,counts:{},periods:new Set(),purposes:new Set(),details:[],sheets:new Set(),referenceOnly:false});return map.get(file)};
 for(const k of arrays){for(const r of data[k]||[]){const f=H.sourceFile(r,k,data);if(!f)continue;const x=get(f);x.counts[k]=(x.counts[k]||0)+1;if(k==='facts'&&r.category!=='roster')x.counts.activityFacts=(x.counts.activityFacts||0)+1;
  if(['facts','novChannels','flowFacts'].includes(k)&&r.periodType!=='rosterSnapshot')x.periods.add(H.periodText(r));
  if(k==='novAudit'){if(r.period)x.periods.add(r.period);if(r.purpose)x.purposes.add(r.purpose);if(r.detail)x.details.push(String(r.detail));x.referenceOnly=/校核|核对/.test(r.status||'')&&!/已接入/.test(r.status||'');}
  if(k==='history'){if(r.purpose)x.purposes.add(r.purpose);if(r.sheet&&r.sheet!=='见源表')x.sheets.add(r.sheet);}
 }}
 return [...map.values()].map(x=>({...x,periods:[...x.periods],purposes:[...x.purposes],sheets:[...x.sheets],referenceOnly:!x.counts.facts&&!x.counts.novRoster&&!x.counts.novChannels}));
};
H.planSourceRemoval=(file,data=H.data)=>{
 const info=H.sourceList(data).find(x=>x.file===file);if(!info)throw Error('该来源已不存在，请刷新列表');
 const removed={};for(const k of arrays)removed[k]=(data[k]||[]).filter(r=>H.sourceFile(r,k,data)===file);
 return {id:H.id(),file,info,deletedAt:new Date().toISOString(),removed};
};
H.removeSourceFromData=(data,file)=>{
 const plan=H.planSourceRemoval(file,data),d=H.clone(data);
 for(const k of arrays){const indices=new Set((data[k]||[]).map((r,i)=>H.sourceFile(r,k,data)===file?i:-1));d[k]=(data[k]||[]).filter((r,i)=>!indices.has(i)).map(H.clone);}
 d.sourceTrash=[...(d.sourceTrash||[]),H.clone(plan)];
 d.history.push({id:H.id(),type:'source-deleted',at:plan.deletedAt,sourceName:file,counts:plan.info.counts});
 return {data:d,plan};
};
H.recordKey=(r,k)=>{
 if(k==='facts')return H.factKey(r);
 if(k==='novRoster')return r.personId||[r.store,r.group,r.person].join('|');
 if(k==='novChannels')return JSON.stringify([r.personId||r.person,r.channel,r.start,r.end]);
 if(k==='flowFacts')return JSON.stringify([r.store,r.group,r.personId||r.person,r.estate,r.business,r.start,r.end]);
 if(k==='novUnassigned')return JSON.stringify([r.source,r.row]);
 if(k==='history')return r.id||JSON.stringify([r.file,r.sheet,r.hash,r.at]);
 return JSON.stringify([r.file,r.purpose,r.period,r.detail]);
};
H.restoreSourceToData=(data,id)=>{
 const d=H.clone(data),entry=d.sourceTrash?.find(x=>x.id===id);if(!entry)throw Error('回收记录不存在');
 let restored=0,conflicts=0;const remaining={};
 for(const k of arrays){const map=new Map((d[k]||[]).map(r=>[H.recordKey(r,k),r]));remaining[k]=[];
  for(const r of entry.removed[k]||[]){const key=H.recordKey(r,k),old=map.get(key);if(!old){map.set(key,r);restored++;}else if(JSON.stringify(old)!==JSON.stringify(r)){remaining[k].push(r);conflicts++;}}
  d[k]=[...map.values()];
 }
 if(conflicts){entry.removed=remaining;entry.partialRestore=true;}else d.sourceTrash=d.sourceTrash.filter(x=>x.id!==id);
 d.history.push({id:H.id(),type:'source-restored',at:new Date().toISOString(),sourceName:entry.file,restored,conflicts});
 H.migrateManagers(d);return {data:d,restored,conflicts};
};
H.changeDataSafely=async next=>{
 const before=H.data;H.data=next;const ok=await H.save();if(!ok){H.data=before;H.toast('本机保存失败，未执行本次修改。请先导出备份。');return false;}
 if(H.ui.store&&!H.entities().some(e=>e.level==='store'&&e.store===H.ui.store)){H.ui.store='';H.ui.group='';}
 if(H.ui.group&&!H.entities().some(e=>e.level==='group'&&e.group===H.ui.group))H.ui.group='';
 H.ui.expanded.clear();return true;
};
// Attach exact source identity to new imports; old backups remain readable.
const normalize=H.normalize;
H.normalize=q=>{const out=normalize(q);for(const k of ['facts','roster','channels','flows','issues'])for(const r of out[k]||[]){r.sourceFile=q.file;r.sourceSheet=q.sheet;}
 if(q.category==='roster'||q.kind==='roster')for(const r of out.roster){const row=q.rows[q.rowNumbers?q.rowNumbers.indexOf(r.row):r.row-1]||[],roleIndex=q.mapping.indexOf('_role'),raw=String(row[roleIndex]||'');if(/大区总|大区负责人/.test(raw)){r.role='大区总';r.management=true;}else if(/店总/.test(raw)){r.role='店总';r.management=true;}}
 return out;
};
// Managers without a team are not missing consultant assignments or consultant ranking entries.
const pool=H.orgPool;
H.orgPool=(level,rule)=>pool(level,rule).filter(e=>e.level!=='person'||!H.isLeader(H.staff(e)));
})();
