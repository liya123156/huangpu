/* Activity TOP5 is rendered below the main table; export includes only this chart. */
'use strict';
(() => {
const H=HP,E=H.esc,T=H.token;
H.lbChange=(key,value)=>{
 const s=H.lbSettings();
 if(key==='mode'&&['week','month','year'].includes(value))s.mode=value;
 else if(key==='level'&&['both','group','person'].includes(value))s.level=value;
 else if(key==='role'&&['顾问','店经理','all'].includes(value))s.role=value;
 else if(key==='anchor'&&H.date(value))s.anchor=H.date(value);
 H.lbRefresh();
};
H.lbShift=delta=>{
 const s=H.lbSettings(),r=H.lbRange(s),d=new Date(r.start+'T00:00:00Z');
 if(s.mode==='week')d.setUTCDate(d.getUTCDate()+7*delta);else if(s.mode==='year')d.setUTCFullYear(d.getUTCFullYear()+delta);else d.setUTCMonth(d.getUTCMonth()+delta);
 s.anchor=d.toISOString().slice(0,10);H.lbRefresh();
};
H.lbMonth=value=>{if(/^\d{4}-\d{2}$/.test(value))H.lbChange('anchor',value+'-01');};
H.lbYear=value=>{if(/^\d{4}$/.test(value)&&Number(value)>=2000&&Number(value)<=2100)H.lbChange('anchor',value+'-01-01');else H.toast('请选择2000—2100年的年份');};
H.lbToggleMetric=id=>{
 const s=H.lbSettings();if(!Array.isArray(s.metrics))s.metrics=H.lbModel().selected.map(m=>m.id);
 s.metrics=s.metrics.includes(id)?s.metrics.filter(x=>x!==id):[...s.metrics,id];H.lbRefresh();
};
H.lbRefresh=()=>{const box=document.getElementById('activity-leaderboard');if(box)box.outerHTML=H.renderLeaderboard();};
H.lbCardHTML=card=>`<article class="lb-card ${card.metric.g==='house'?'lb-house':'lb-customer'}">
 <header class="lb-card-head"><div><span class="lb-category">${card.level==='group'?'店组榜':'个人榜'}</span><h3>${E(card.metric.label)}</h3></div><span class="lb-top-mark">TOP <b>5</b></span></header>
 <div class="lb-coverage"><span>${E(H.lbPeriodText(card))}</span>${card.partial&&card.status==='ready'?'<b>已导入部分</b>':''}</div>
 ${card.status==='ready'?`<ol class="lb-list">${H.lbDisplayRows(card).map(row=>`<li class="lb-row"><span class="lb-rank ${row.rank<=3?'lb-podium':''}">${row.rank}</span><div class="lb-who">${row.members?`<div class="lb-name">并列第${row.rank} · ${row.members.length}${card.level==='group'?'个店组':'人'}</div><div class="lb-tie-members">${row.members.map(r=>`<span><b>${E(H.lbName(r.entity))}</b>${card.level==='person'?`<small>${E(H.lbMeta(r.entity))}</small>`:''}</span>`).join('')}</div>`:`<div class="lb-name">${E(H.lbName(row.entity))}</div>`}${!row.members&&card.level==='person'?`<div class="lb-meta">${E(H.lbMeta(row.entity))}</div>`:''}<div class="lb-track"><i style="width:${Math.max(1,row.n/card.max*100).toFixed(3)}%"></i></div></div><b class="lb-value">${H.fmt(row.n)}</b></li>`).join('')}</ol>`:`<div class="lb-empty"><span>—</span><p>${E(card.message)}</p></div>`}
 <footer class="lb-card-foot">${card.status==='ready'?`${card.knownCount}/${card.poolCount}${card.level==='group'?'个店组':'人'}有可比较数据${card.missingCount?' · '+card.missingCount+'个对象待补／待核':''}${card.tieExtra?' · 同量并列，多展示'+card.tieExtra+'个对象':''}`:'不将缺失值当作0，不生成虚构名次。'}</footer></article>`;
H.renderLeaderboard=()=>{
 const m=H.lbModel(),s=H.lbSettings(),selected=new Set(m.selected.map(x=>x.id));
 const picker=s.mode==='month'?`<input aria-label="排行榜月份" type="month" value="${s.anchor.slice(0,7)}" onchange="HP.lbMonth(this.value)">`:s.mode==='year'?`<input aria-label="排行榜年份" type="number" min="2000" max="2100" step="1" value="${s.anchor.slice(0,4)}" onchange="HP.lbYear(this.value)">`:`<input aria-label="排行榜周内日期" type="date" value="${s.anchor}" onchange="HP.lbChange('anchor',this.value)">`;
 return `<section id="activity-leaderboard" class="panel lb-panel" aria-label="单项活动量标杆TOP5排行榜">
 <div class="lb-heading"><div><div class="eyebrow">发现方法 · 看见努力</div><h2>单项活动量标杆 TOP5</h2><p>每项分别排榜，店组与个人分开看；范围跟随上方门店／店组筛选。</p></div><div class="actions"><button class="btn primary" onclick="HP.exportLeaderboard(true)">复制整张排行榜</button><button class="btn" onclick="HP.exportLeaderboard(false)">下载排行榜</button></div></div>
 <div class="lb-controls"><div class="seg" aria-label="排行榜对象">${[['both','店组＋个人'],['group','店组'],['person','个人']].map(([k,label])=>`<button class="${s.level===k?'active':''}" onclick="HP.lbChange('level','${k}')">${label}</button>`).join('')}</div><div class="seg" aria-label="排行榜周期">${[['week','周度'],['month','月度'],['year','年度']].map(([k,label])=>`<button class="${s.mode===k?'active':''}" onclick="HP.lbChange('mode','${k}')">${label}</button>`).join('')}</div><div class="lb-calendar"><button class="btn small" aria-label="上一个周期" onclick="HP.lbShift(-1)">‹</button>${picker}<button class="btn small" aria-label="下一个周期" onclick="HP.lbShift(1)">›</button></div>${s.level!=='group'?`<label class="lb-role">个人范围<select aria-label="排行榜个人范围" onchange="HP.lbChange('role',this.value)">${[['顾问','顾问'],['店经理','店经理'],['all','顾问＋店经理']].map(([k,l])=>`<option value="${k}" ${s.role===k?'selected':''}>${l}</option>`).join('')}</select></label>`:''}</div>
 <div class="lb-metrics"><span>显示指标</span>${m.allMetrics.map(metric=>`<button class="lb-metric ${selected.has(metric.id)?'selected':''}" aria-pressed="${selected.has(metric.id)}" onclick="HP.lbToggleMetric('${E(metric.id)}')">${E(metric.label)}</button>`).join('')}</div>
 <div class="lb-figure" id="leaderboard-figure"><div class="lb-figure-title"><div><small>${E(m.scope)} · 单项数量排名</small><h3>${E(m.range.label)}</h3></div><div class="lb-figure-scope">${s.level==='both'?'店组 / 个人':s.level==='group'?'店组':'个人'}${s.level!=='group'?' · '+E(s.role==='all'?'顾问＋店经理':s.role):''}</div></div><div class="lb-grid ${s.level==='both'?'':'lb-single'}">${m.cards.map(H.lbCardHTML).join('')||'<div class="lb-no-metrics">选择上方指标，即可查看各单项TOP5；未导入的数据不产生排名。</div>'}</div><div class="lb-foot">${m.notes.map(E).join('<br>')}${m.rolling.length?'<br>近30天快照不计入自然周期：'+E(m.rolling.join('、'))+'。':''}</div></div></section>`;
};
const activity=H.renderActivity;
H.renderActivity=()=>activity()+H.renderLeaderboard();
})();
