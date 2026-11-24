/* Current organizational candidates come from the explicit roster, not history. */
'use strict';
(() => {
const H=HP,text=v=>String(v??'').trim();
const scopedName=r=>JSON.stringify([text(r.store),text(r.group),text(r.person)]);
const sameScope=(a,b)=>text(a.store)===text(b.store)&&text(a.group)===text(b.group);
const rosterLookup=()=>{
 const ids=new Map(),names=new Map();
 for(const row of H.data.novRoster||[]){
  if(!row||!text(row.person))continue;
  const id=text(row.personId),name=scopedName(row);
  if(id){if(!ids.has(id))ids.set(id,[]);ids.get(id).push(row);}
  if(!names.has(name))names.set(name,[]);names.get(name).push(row);
 }
 return entity=>{
  if(!entity)return null;
  // A known code cannot fall back to somebody else's name. With no code,
  // all three source identity fields must match exactly one roster entry.
  const id=text(entity.personId),matches=id?ids.get(id):names.get(scopedName(entity));
  return matches?.length===1?matches[0]:null;
 };
};
H.currentStaffRecord=entity=>rosterLookup()(entity);
const selectCurrent=(rows,{consultantsOnly=false}={})=>{
 const lookup=rosterLookup(),selected=new Map();
 for(const entity of rows){
  const staff=lookup(entity);
  if(!staff||!H.monthlyIsCurrentStaff(staff)||!sameScope(entity,staff))continue;
  if(consultantsOnly&&(!/顾问/.test(staff.role||'')||H.isLeader?.(staff)))continue;
  const id=text(staff.personId),key=id?'id:'+id:'name:'+scopedName(staff),old=selected.get(key);
  // History can contain both coded and uncoded copies of the same identity.
  // Keep one current organization entry, preferring its coded representation.
  if(!old||id&&text(entity.personId)===id&&text(old.personId)!==id)selected.set(key,entity);
 }
 return [...selected.values()];
};
const orgPool=H.orgPool;
H.orgPool=(level=H.ui.focusLevel,rule=H.orgRules())=>{
 const candidates=orgPool(level,rule);
 return level==='person'?selectCurrent(candidates):candidates;
};
if(typeof H.orgConsultantMembers==='function'){
 const members=H.orgConsultantMembers;
 H.orgConsultantMembers=(...args)=>selectCurrent(members(...args),{consultantsOnly:true});
}
})();
