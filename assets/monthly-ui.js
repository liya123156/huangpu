/* Monthly activity page. All personnel and business values come from the local model. */
'use strict';
(() => {
  const H = HP, E = H.esc;
  H.version = '3.8.2';
  const KEYS = ['house', 'owner', 'hmall', 'channel', 'entered', 'rate', 'view'];
  const LABELS = {
    house: '新增买卖房源', owner: '业主面见', hmall: 'hmall陪带次数',
    channel: '重点渠道新增', entered: '重点渠道当月进入带看',
    rate: '重点渠道进入带看率', view: '买卖带看次数'
  };
  const HEADS = {
    house: ['新增买卖', '房源'], owner: ['业主', '面见'], hmall: ['hmall', '陪带次数'],
    channel: ['重点渠道', '新增'], entered: ['重点渠道', '当月进入带看'],
    rate: ['重点渠道', '进入带看率'], view: ['买卖', '带看次数']
  };
  const SHARES = {house: 10, owner: 9, hmall: 10, channel: 11, entered: 13, rate: 13, view: 10};
  const scopeNote = '个人仅显示当前在职顾问；门店、店组保留当期历史合计。';
  const zeroNote = '未记录活动量按0；新增与进入带看均为0时，进入带看率按0.0%显示。';
  const kind = {region: '大区', store: '门店', group: '店组', person: '个人'};
  const monthLabel = month => /^\d{4}-\d{2}$/.test(String(month)) ? Number(month.slice(5)) + '月' : String(month || '');
  const periodLabel = months => {
    let previousYear = '';
    return months.map(month => {
      const year = String(month).slice(0, 4), prefix = year !== previousYear ? year + '年' : '';
      previousYear = year;
      return prefix + monthLabel(month);
    }).join('、');
  };
  const number = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const state = () => {
    if (!H.ui.monthlyBoard || typeof H.ui.monthlyBoard !== 'object') H.ui.monthlyBoard = {};
    return H.ui.monthlyBoard;
  };
  const columns = () => {
    const definitions = Array.isArray(H.monthlyColumns) ? H.monthlyColumns : [];
    const requested = typeof H.getMonthlyColumnOrder === 'function' ? H.getMonthlyColumnOrder() : H.data.monthlyBoard?.columnOrder;
    const order = [...new Set([...(Array.isArray(requested) ? requested : []), ...KEYS])].filter(key => KEYS.includes(key));
    return order.map(key => {
      const definition = definitions.find(column => (column.key || column.id) === key) || {};
      return {...definition, id: key, key, label: LABELS[key], unit: definition.unit || '', share: SHARES[key]};
    });
  };

  // These helpers are also used by the image exporter so images and the page agree.
  H.monthlyFormatCell = (node, month, key) => {
    const rawValue = node?.months?.[month]?.[key];
    const meta = node?.cellMeta?.[month]?.[key] || {};
    const asterisk = !!meta.asterisk;
    if (meta.status === 'conflict' || (rawValue != null && !finite(rawValue))) return {
      text: '待核对', value: null, zero: false, pending: true, asterisk,
      title: meta.note || '来源数值存在异常，请核对后再比较', className: 'hp-monthly-missing'
    };
    const value = rawValue == null ? 0 : rawValue;
    const title = meta.note || (rawValue == null ? '未记录活动量，按0显示' : '');
    return {
      text: key === 'rate' ? (value * 100).toFixed(1) + '%' : number(value),
      value, zero: value === 0, pending: false, asterisk, title,
      className: value === 0 ? 'hp-monthly-zero' : ''
    };
  };

  H.monthlyRankReason = (person, ranking, direction) => {
    const values = person?.values || {}, parts = person?.parts || {};
    if (direction === 'top') {
      if (parts.view?.rank === 1 && parts.channel?.rank === 1) return '两项均为本店本次参评顾问最高，综合排名靠前。';
      const facts = [];
      for (const [key, label] of [['view', '买卖带看'], ['channel', '重点渠道新增']]) {
        const part = parts[key];
        if (part && part.percentile >= 50 && finite(part.rank)) facts.push(label + '在本店' + (part.tied ? '并列' : '') + '第' + part.rank + '名');
      }
      const place = finite(person?.rank) ? '两项等权综合后' + (person.ties > 1 ? '并列' : '') + '第' + person.rank + '名。' : '按本月两项活动数据排序。';
      return (facts.length ? facts.join('；') + '。' : '') + place;
    }
    if (direction === 'bottom') {
      const facts = [];
      for (const [key, label] of [['view', '买卖带看'], ['channel', '重点渠道新增']]) {
        const value = values[key], median = parts[key]?.median;
        if (value === 0) facts.push(label + '为0');
        else if (finite(value) && finite(median) && value < median) facts.push(label + number(value) + '，低于本店参评顾问中位数' + number(median));
      }
      return (facts.length ? facts.join('；') + '。' : '') + '两项等权综合后位于本店后三名范围。';
    }
    if (ranking?.status === 'tied') return '本月两项综合分相同，保留并列，不区分前三与后三。';
    return '按本月两项活动数据展示，相同综合分保留并列。';
  };

  const storeRows = (view, store) => {
    const candidates = (view.nodes || []).filter(node => node.store === store && node.level !== 'region');
    const children = new Map(), used = new Set(), result = [];
    for (const node of candidates) {
      if (!children.has(node.parent)) children.set(node.parent, []);
      children.get(node.parent).push(node);
    }
    const walk = node => {
      if (used.has(node.id)) return;
      used.add(node.id); result.push(node);
      for (const child of children.get(node.id) || []) walk(child);
    };
    for (const node of candidates.filter(node => node.level === 'store')) walk(node);
    // Preserve any source record whose parent was not included in a source table.
    for (const node of candidates) if (!used.has(node.id)) walk(node);
    return result;
  };
  const sourceNotes = view => {
    const notes = new Set(), records = [];
    const shortDate = (date, month) => date.slice(0, 4) === month.slice(0, 4) ? Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10)) : date;
    const simplify = note => [...new Set(String(note || '').split(/[；;]/).map(part => part.replace(/[。\s]+$/g, '').trim()).filter(part => part && !/^仅累计已提供记录/.test(part)))].join('；');
    for (const node of view.nodes || []) {
      if (view.selectedStore && node.level === 'region') continue;
      for (const month of view.months || []) for (const key of KEYS) {
        const meta = node.cellMeta?.[month]?.[key];
        if (meta && (meta.status === 'unconfirmed' || meta.status === 'conflict' || meta.asterisk)) records.push({month, key, meta});
      }
    }
    const handled = new Set();
    for (const month of view.months || []) {
      const items = records.filter(record => record.month === month && record.key === 'owner' && record.meta.status !== 'conflict');
      if (!items.length) continue;
      const periods = [...new Set(items.flatMap(record => record.meta.sourcePeriods || []))];
      const match = periods.length === 1 && periods[0].match(/^(\d{4}-\d{2}-\d{2})至(\d{4}-\d{2}-\d{2})$/);
      const prefix = monthLabel(month) + '业主面见' + (items.some(record => record.meta.asterisk) ? '＊' : '') + '：';
      if (match) {
        const [, start, end] = match;
        if (start.slice(0, 7) === month && start > month + '-01') notes.add(prefix + '来源范围' + shortDate(start, month) + '—' + shortDate(end, month) + '，暂不视为整月累计。');
        else if (end.slice(0, 7) === month) notes.add(prefix + '原表截至' + shortDate(end, month) + '，完整月范围待核对。');
        else notes.add(prefix + '来源范围' + shortDate(start, month) + '—' + shortDate(end, month) + '，该月统计范围待核对。');
        handled.add(month + '|owner');
      }
    }
    const hmall = records.filter(record => record.key === 'hmall' && record.meta.status === 'unconfirmed' && !record.meta.observedThrough);
    if (hmall.length) {
      notes.add('hmall陪带：按原表月份统计，未提供日级截止。');
      hmall.forEach(record => handled.add(record.month + '|hmall'));
    }
    for (const {month, key, meta} of records) {
      if (meta.status !== 'conflict' && handled.has(month + '|' + key)) continue;
      const note = simplify(meta.note);
      if (note) notes.add(monthLabel(month) + LABELS[key] + '：' + note + '。');
    }
    // Older imports may not yet have structured metadata. Keep their distinct
    // source warnings, while removing repetition introduced by parent totals.
    if (!records.length) for (const item of view.notes || []) {
      const note = simplify(typeof item === 'string' ? item : item?.text || item?.note || '');
      if (note) notes.add(note + '。');
    }
    return [...notes];
  };
  const currentView = store => {
    const ui = state();
    const view = H.monthlyView({store: store === undefined ? ui.store || '' : store, endMonth: ui.endMonth});
    const availableMonths = view.months || [];
    const selectedMonth = availableMonths.includes(ui.month) ? ui.month : '';
    ui.month = selectedMonth;
    if (!selectedMonth) return {...view, availableMonths, selectedMonth};
    const cutoffs = (view.nodes || []).filter(node => !view.selectedStore || node.level !== 'region').flatMap(node => KEYS.map(key => node.cellMeta?.[selectedMonth]?.[key]?.observedThrough)).filter(Boolean).sort();
    const sourceCutoff = cutoffs.at(-1) || '';
    // Filter the presentation only. Keep source facts and the monthly totals
    // intact, and derive notes from this month's own structured cell metadata.
    return {...view, months: [selectedMonth], availableMonths, selectedMonth, notes: [], sourceCutoff, coverage: {...view.coverage, sourceCutoff}};
  };
  H.monthlyExportModel = store => {
    const view = currentView(store), ui = state();
    const months = view.months || [], rankMonth = months.includes(ui.rankMonth) ? ui.rankMonth : months.at(-1);
    return {
      title: store + '｜活动量月度对比',
      subtitle: periodLabel(months), store, months, columns: columns(),
      rows: storeRows(view, store),
      notes: [scopeNote, zeroNote, ...sourceNotes(view)],
      sourceCutoff: view.sourceCutoff || '',
      rankMonth, ranking: view.rankings?.[store]?.[rankMonth] || (H.monthlyRanking ? H.monthlyRanking({store, month: rankMonth}) : null)
    };
  };

  const valueHTML = (node, month, key) => {
    const value = H.monthlyFormatCell(node, month, key);
    return '<td class="' + value.className + '"' + (value.title ? ' title="' + E(value.title) + '"' : '') + '>' + E(value.text) + (value.asterisk ? '<sup class="hp-monthly-source-mark" aria-label="统计范围待核对">＊</sup>' : '') + '</td>';
  };
  const managerNames = node => node.level === 'group' ? [...new Set((Array.isArray(node.managerNames) ? node.managerNames : node.managerName ? [node.managerName] : []).filter(name => typeof name === 'string' && name.trim()))] : [];
  H.monthlyEntityLabel = node => (node.label || node.person || node.group || node.store || '黄浦大区合计') + (managerNames(node).length ? ' · ' + managerNames(node).join('、') : '');
  const nameLabelHTML = node => E(node.label || node.person || node.group || node.store || '黄浦大区合计') + (managerNames(node).length ? '<span class="hp-monthly-manager"> · ' + managerNames(node).map(E).join('、') + '</span>' : '');
  const kindHTML = node => node.level === 'person' ? '' : '<span class="hp-monthly-kind">' + E(kind[node.level] || '') + '</span>';
  const tableHTML = (rows, months, store) => {
    const ordered = columns();
    return '<div class="hp-monthly-table-wrap" data-monthly-table-store="' + E(store) + '"><table class="hp-monthly-table" aria-label="' + E((store || '黄浦大区') + periodLabel(months) + '活动量，全列显示') + '">' +
      '<colgroup><col style="width:17%"><col style="width:7%">' + ordered.map(column => '<col style="width:' + column.share + '%">').join('') + '</colgroup>' +
      '<thead><tr><th scope="col">组织 / 姓名</th><th scope="col">月份</th>' + ordered.map((column, index) =>
        '<th scope="col" class="hp-monthly-column" draggable="true" tabindex="0" data-monthly-column="' + column.key + '" aria-label="' + E(column.label + '；可拖动，或按左右方向键调整顺序') + '" title="拖动表头调整顺序，也可用左右方向键">' +
        '<span class="hp-monthly-grip" aria-hidden="true">⠿</span><span class="hp-monthly-column-title">' + HEADS[column.key].map(E).join('<br>') + '</span>' +
        '<span class="hp-monthly-column-moves"><button type="button" data-monthly-move="-1" data-column="' + column.key + '" aria-label="' + E(column.label + '向左移动') + '"' + (index === 0 ? ' disabled' : '') + '>‹</button><button type="button" data-monthly-move="1" data-column="' + column.key + '" aria-label="' + E(column.label + '向右移动') + '"' + (index === ordered.length - 1 ? ' disabled' : '') + '>›</button></span></th>'
      ).join('') + '</tr></thead>' + rows.map(node => '<tbody class="hp-monthly-entity hp-monthly-level-' + E(node.level) + '">' + months.map((month, index) =>
        '<tr class="' + (index === months.length - 1 ? 'hp-monthly-last' : '') + '">' +
        (index === 0 ? '<th scope="rowgroup" rowspan="' + months.length + '" class="hp-monthly-name">' + kindHTML(node) + '<span class="hp-monthly-name-label">' + nameLabelHTML(node) + '</span></th>' : '') +
        '<td class="hp-monthly-month">' + E(monthLabel(month)) + '</td>' + ordered.map(column => valueHTML(node, month, column.key)).join('') + '</tr>'
      ).join('') + '</tbody>').join('') + '</table></div>' +
      '<div class="hp-monthly-mobile">' + rows.map(node => '<section class="hp-monthly-mobile-entity hp-monthly-level-' + E(node.level) + '"><h3><span>' + nameLabelHTML(node) + '</span>' + (node.level === 'person' ? '' : '<small>' + E(kind[node.level] || '') + '</small>') + '</h3>' + months.map(month =>
        '<div class="hp-monthly-mobile-month"><h4>' + E(monthLabel(month)) + '</h4><div class="hp-monthly-mobile-values">' + ordered.map(column => {
          const value = H.monthlyFormatCell(node, month, column.key);
          return '<div><span>' + E(column.label) + '</span><b class="' + value.className + '"' + (value.title ? ' title="' + E(value.title) + '"' : '') + '>' + E(value.text) + (value.asterisk ? '<sup class="hp-monthly-source-mark">＊</sup>' : '') + '</b></div>';
        }).join('') + '</div></div>'
      ).join('') + '</section>').join('') + '</div>';
  };
  const exportButtons = (store, primary) => '<div class="hp-monthly-image-actions"><button class="btn' + (primary ? ' primary' : '') + '" type="button" data-monthly-action="copy" data-store="' + E(store) + '">' + (primary ? '复制本店图片' : '复制图片') + '</button><button class="btn" type="button" data-monthly-action="save" data-store="' + E(store) + '">保存图片</button></div>';
  const amount = rawValue => {
    const value = rawValue == null ? 0 : rawValue;
    return finite(value) ? '<b' + (value === 0 ? ' class="hp-monthly-zero"' : '') + '>' + number(value) + '</b>' : '<b class="hp-monthly-missing">待核对</b>';
  };
  const rankCard = (person, ranking, direction) => {
    const place = direction === 'bottom' ? (person.ties > 1 ? '并列' : '') + '倒数第' + person.bottomRank : (person.ties > 1 ? '并列' : '') + '第' + person.rank + '名';
    return '<article class="hp-monthly-rank-item"><div class="hp-monthly-rank-name"><strong>' + E(person.name || person.person || '') + '</strong><span>' + E(person.group || '') + '</span><small>' + E(place) + '</small></div>' +
      '<div class="hp-monthly-rank-values"><span>买卖带看 ' + amount(person.values?.view) + ' 次</span><span>重点渠道新增 ' + amount(person.values?.channel) + '</span></div>' +
      '<p class="hp-monthly-rank-reason"><span>数据依据：</span>' + E(H.monthlyRankReason(person, ranking, direction)) + '</p></article>';
  };
  const rankingHTML = (view, stores, month) => stores.map(store => {
    const ranking = view.rankings?.[store]?.[month] || (H.monthlyRanking ? H.monthlyRanking({store, month}) : null);
    if (!ranking) return '<section class="hp-monthly-store-review"><h3>' + E(store) + ' · ' + E(monthLabel(month)) + '</h3><p class="hp-monthly-empty">暂无可参评数据。</p></section>';
    const top = ranking.top || [], bottom = ranking.bottom || [], all = ranking.all || [], missing = ranking.missing || [];
    let content;
    if (ranking.status === 'separate') {
      content = '<div class="hp-monthly-rank-grid"><section class="hp-monthly-rank-panel"><h4>标杆前三名' + (top.length > 3 ? '<small>含并列</small>' : '') + '</h4>' + top.map(person => rankCard(person, ranking, 'top')).join('') + (top.length > 3 ? '<p class="hp-monthly-tie-note">第3位边界同分，共展示' + top.length + '人。</p>' : '') + '</section>' +
        '<section class="hp-monthly-rank-panel hp-monthly-rank-low"><h4>后三名 · 重点提醒' + (bottom.length > 3 ? '<small>含并列</small>' : '') + '</h4>' + bottom.map(person => rankCard(person, ranking, 'bottom')).join('') + (bottom.length > 3 ? '<p class="hp-monthly-tie-note">第3位边界同分，共展示' + bottom.length + '人。</p>' : '') + '</section></div>';
    } else {
      const messages = {none: '暂无可比较的顾问数据，请核对来源与统计截止。', tied: '本月参评顾问综合分相同，暂不区分前三、后三。', small: '参评人数不足6人，按活动量顺序展示全部人员。', overlap: '前三、后三的边界出现同分，按活动量顺序展示并保留并列。'};
      content = '<section class="hp-monthly-rank-panel"><p class="hp-monthly-rank-status">' + E(messages[ranking.status] || '按本月已提供数据展示。') + '</p>' + all.map(person => rankCard(person, ranking, 'all')).join('') + '</section>';
    }
    return '<section class="hp-monthly-store-review"><h3>' + E(store) + ' · ' + E(monthLabel(month)) + '</h3>' +
      '<p class="hp-monthly-coverage">当前在职顾问中，' + Number(ranking.count || 0) + '人参与比较' + (missing.length ? '，' + missing.length + '人待核对' : '') + '。</p>' + content +
      (missing.length ? '<p class="hp-monthly-rank-missing"><strong>待核对：</strong>' + missing.map(person => E((person.name || person.person || '') + '（' + (person.missing || []).join('、') + '）')).join('；') + '。以上人员暂不参与排名。</p>' : '') + '</section>';
  }).join('');

  H.renderActivity = () => {
    H.currentModel = null;
    if (typeof H.monthlyView !== 'function') return '<section id="monthly-activity"><h1>活动量月度对比</h1><p class="hp-monthly-empty">月度数据正在准备，请稍后刷新。</p></section>';
    const ui = state();
    if (ui.store === undefined) ui.store = H.ui.store || '';
    let view = currentView();
    if (ui.store && !(view.stores || []).includes(ui.store)) { ui.store = ''; view = currentView(''); }
    const stores = view.stores || [], months = view.months || [], availableMonths = view.availableMonths || months;
    const multipleYears = new Set(availableMonths.map(month => String(month).slice(0, 4))).size > 1;
    const optionLabel = month => (multipleYears ? String(month).slice(0, 4) + '年' : '') + monthLabel(month);
    const selected = ui.store || '', shownStores = selected ? [selected] : stores;
    if (!months.includes(ui.rankMonth)) ui.rankMonth = months.at(-1) || '';
    H.monthlyActiveView = view;
    const period = periodLabel(months);
    const region = (view.nodes || []).filter(node => node.level === 'region');
    const notes = sourceNotes(view);
    return '<div id="monthly-activity"><header class="hp-monthly-heading"><div><div class="eyebrow">黄浦大区 · 组织管理</div><h1>活动量月度对比</h1><p>' + E(period) + '</p></div>' +
      '<div class="hp-monthly-controls"><label for="monthly-store">门店<select id="monthly-store" data-monthly-filter="store"><option value="">黄浦大区 · 全部门店</option>' + stores.map(store => '<option value="' + E(store) + '"' + (selected === store ? ' selected' : '') + '>' + E(store) + '</option>').join('') + '</select></label>' +
      '<label for="monthly-month">月份<select id="monthly-month" data-monthly-filter="month"><option value=""' + (!ui.month ? ' selected' : '') + '>全部月份</option>' + availableMonths.map(month => '<option value="' + E(month) + '"' + (ui.month === month ? ' selected' : '') + '>' + E(optionLabel(month)) + '</option>').join('') + '</select></label>' + (selected ? exportButtons(selected, true) : '') + '</div></header>' +
      '<div class="hp-monthly-table-help"><span>门店、店组、在职顾问全部显示</span><span>拖动表头调整指标顺序<span class="hp-monthly-key-hint">，或选中表头后按 ← / →</span></span></div>' +
      (!selected && region.length ? '<section class="hp-monthly-section hp-monthly-region"><div class="hp-monthly-section-head"><h2>黄浦大区合计</h2></div>' + tableHTML(region, months, '') + '</section>' : '') +
      shownStores.map(store => '<section class="hp-monthly-section" data-monthly-store="' + E(store) + '"><div class="hp-monthly-section-head"><h2>' + E(store) + '</h2>' + (!selected ? exportButtons(store, false) : '') + '</div>' + tableHTML(storeRows(view, store), months, store) + '</section>').join('') +
      (!shownStores.length ? '<section class="hp-monthly-empty"><p>导入活动量底表后，在这里按月查看门店、店组和个人数据。</p><button class="btn primary" type="button" data-monthly-action="import">前往数据导入</button></section>' : '') +
      '<p class="hp-monthly-legend">未记录活动量按<b class="hp-monthly-zero">0</b>；新增与进入带看均为0时，进入带看率按<b class="hp-monthly-zero">0.0%</b>显示。</p>' +
      '<section class="hp-monthly-review" aria-label="门店顾问活动量前三与后三"><div class="hp-monthly-review-head"><h2>活动量标杆与重点提醒</h2><label for="monthly-rank-month">评选月份<select id="monthly-rank-month" data-monthly-filter="rankMonth"' + (ui.month ? ' disabled' : '') + '>' + months.map(month => '<option value="' + E(month) + '"' + (month === ui.rankMonth ? ' selected' : '') + '>' + E(optionLabel(month)) + '</option>').join('') + '</select></label></div>' +
      '<p class="hp-monthly-rule">买卖带看、重点渠道新增分别在同店顾问中排名，各占50%。第3位同分者一并展示；未记录活动量按0。对应月份来源未导入、统计截止不一致或来源冲突时，暂不比较。</p>' +
      '<div id="monthly-ranking-output" aria-live="polite">' + rankingHTML(view, shownStores, ui.rankMonth) + '</div></section>' +
      '<footer class="hp-monthly-notes"><p>' + scopeNote + '</p><p>数据依据说明活动表现，具体原因需结合沟通了解。</p>' + notes.map(note => '<p>' + E(note) + '</p>').join('') + '</footer>' +
      '<span id="monthly-order-status" class="hp-monthly-sr-only" role="status" aria-live="polite"></span></div>';
  };

  const focusColumn = (key, store) => {
    const heads = [...document.querySelectorAll('#monthly-activity [data-monthly-column]')];
    const head = heads.find(element => element.dataset.monthlyColumn === key && element.closest('[data-monthly-table-store]')?.dataset.monthlyTableStore === store) || heads.find(element => element.dataset.monthlyColumn === key);
    head?.focus({preventScroll: true});
  };
  H.setMonthlyColumnOrder = async (requested, focusKey, store = '') => {
    if (!Array.isArray(requested) || requested.length !== KEYS.length || new Set(requested).size !== KEYS.length || requested.some(key => !KEYS.includes(key))) return false;
    if (columns().every((column, index) => column.key === requested[index])) return true;
    H.data.monthlyBoard = {...(H.data.monthlyBoard || {}), columnOrder: requested.slice()};
    H.render();
    if (focusKey) focusColumn(focusKey, store);
    const ok = await H.save();
    H.toast(ok ? '指标顺序已保存，图片将使用相同顺序' : '顺序已调整；本机保存不可用，请导出备份');
    const status = document.getElementById('monthly-order-status');
    if (status) status.textContent = (LABELS[focusKey] || '指标') + '已调整，组织和月份列保持在左侧';
    return !!ok;
  };
  H.moveMonthlyColumn = (key, step, store = '') => {
    const order = columns().map(column => column.key), from = order.indexOf(key), to = from + step;
    if (from < 0 || to < 0 || to >= order.length || ![-1, 1].includes(step)) return;
    order.splice(from, 1); order.splice(to, 0, key);
    return H.setMonthlyColumnOrder(order, key, store);
  };

  let dragging = null, pointerDrag = null, suppressClickUntil = 0;
  const inPage = event => event.target?.closest?.('#monthly-activity');
  const clearDrag = () => {
    document.querySelectorAll('#monthly-activity .hp-monthly-dragging, #monthly-activity .hp-monthly-drop-target').forEach(element => element.classList.remove('hp-monthly-dragging', 'hp-monthly-drop-target'));
    dragging = null;
  };
  const reorderTo = (key, targetKey, store) => {
    const order = columns().map(column => column.key), from = order.indexOf(key), to = order.indexOf(targetKey);
    if (from < 0 || to < 0 || from === to) return;
    order.splice(from, 1); order.splice(to, 0, key);
    return H.setMonthlyColumnOrder(order, key, store);
  };
  const stopPointerDrag = () => {
    const current = pointerDrag;
    pointerDrag = null;
    if (!current) return null;
    current.head.setAttribute?.('draggable', current.previousDraggable);
    current.head.classList.remove('hp-monthly-dragging');
    current.page.classList?.remove('hp-monthly-is-dragging');
    try { current.head.releasePointerCapture?.(current.pointerId); } catch (_) { /* Pointer already released. */ }
    clearDrag();
    return current;
  };
  const pointerTarget = event => {
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const head = element?.closest?.('[data-monthly-column]');
    return head?.closest?.('#monthly-activity') ? head : null;
  };
  document.addEventListener('pointerdown', event => {
    const page = inPage(event);
    if (!page || pointerDrag || event.isPrimary === false || (event.button != null && event.button !== 0) || event.target.closest('button')) return;
    const head = event.target.closest('[data-monthly-column]');
    if (!head || !KEYS.includes(head.dataset.monthlyColumn)) return;
    pointerDrag = {
      pointerId: event.pointerId, head, page, key: head.dataset.monthlyColumn,
      store: head.closest('[data-monthly-table-store]')?.dataset.monthlyTableStore || '',
      startX: event.clientX, startY: event.clientY, active: false, targetKey: null,
      previousDraggable: head.getAttribute?.('draggable') || 'true'
    };
    // Let ordinary clicks focus the header. Pointer movement owns the drag, so
    // the browser's native drag cannot cancel pointer events halfway through it.
    head.setAttribute?.('draggable', 'false');
  });
  document.addEventListener('pointermove', event => {
    const current = pointerDrag;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = Math.abs(event.clientX - current.startX), dy = Math.abs(event.clientY - current.startY);
    if (!current.active) {
      if (dy > 10 && dy > dx) { stopPointerDrag(); return; }
      if (dx < 6) return;
      current.active = true;
      current.head.classList.add('hp-monthly-dragging');
      current.page.classList?.add('hp-monthly-is-dragging');
      try { current.head.setPointerCapture?.(event.pointerId); } catch (_) { /* Document handlers still receive movement. */ }
    }
    event.preventDefault();
    const head = pointerTarget(event);
    current.targetKey = head?.dataset.monthlyColumn || null;
    document.querySelectorAll('#monthly-activity .hp-monthly-drop-target').forEach(element => element.classList.remove('hp-monthly-drop-target'));
    if (head && current.targetKey !== current.key) head.classList.add('hp-monthly-drop-target');
  }, {passive: false});
  document.addEventListener('pointerup', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const targetKey = pointerTarget(event)?.dataset.monthlyColumn || null;
    const current = stopPointerDrag();
    if (!current?.active) return;
    event.preventDefault();
    suppressClickUntil = Date.now() + 350;
    reorderTo(current.key, targetKey, current.store);
  });
  document.addEventListener('pointercancel', event => {
    if (pointerDrag && event.pointerId === pointerDrag.pointerId) stopPointerDrag();
  });
  globalThis.addEventListener?.('blur', stopPointerDrag);
  document.addEventListener('click', event => {
    if (!inPage(event)) return;
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation?.(); return; }
    const move = event.target.closest('[data-monthly-move]');
    if (move) {
      H.moveMonthlyColumn(move.dataset.column, Number(move.dataset.monthlyMove), move.closest('[data-monthly-table-store]')?.dataset.monthlyTableStore || '');
      return;
    }
    const button = event.target.closest('[data-monthly-action]');
    if (!button) return;
    if (button.dataset.monthlyAction === 'import') { H.go('import'); return; }
    const handler = button.dataset.monthlyAction === 'copy' ? H.copyMonthlyStore : H.saveMonthlyStore;
    if (typeof handler !== 'function') { H.toast('图片导出正在准备，请稍后重试'); return; }
    try {
      const result = handler(button.dataset.store);
      if (result?.catch) result.catch(error => H.toast('生成图片失败：' + error.message));
    } catch (error) { H.toast('生成图片失败：' + error.message); }
  });
  document.addEventListener('change', event => {
    if (!inPage(event)) return;
    const control = event.target.closest('[data-monthly-filter]');
    if (!control) return;
    const ui = state();
    if (control.dataset.monthlyFilter === 'store') { ui.store = control.value; H.render(); }
    if (control.dataset.monthlyFilter === 'month') { ui.month = control.value; H.render(); }
    if (control.dataset.monthlyFilter === 'rankMonth') {
      const view = H.monthlyActiveView || currentView(), stores = ui.store ? [ui.store] : view.stores || [];
      if (ui.month || !(view.months || []).includes(control.value)) return;
      ui.rankMonth = control.value;
      const output = document.getElementById('monthly-ranking-output');
      if (output) output.innerHTML = rankingHTML(view, stores, ui.rankMonth);
    }
  });
  document.addEventListener('keydown', event => {
    if (!inPage(event) || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const head = event.target.closest('[data-monthly-column]');
    if (!head || event.target.closest('button')) return;
    event.preventDefault();
    H.moveMonthlyColumn(head.dataset.monthlyColumn, event.key === 'ArrowLeft' ? -1 : 1, head.closest('[data-monthly-table-store]')?.dataset.monthlyTableStore || '');
  });
  document.addEventListener('dragstart', event => {
    if (!inPage(event)) return;
    if (pointerDrag || event.target.closest('button')) { event.preventDefault(); return; }
    const head = event.target.closest('[data-monthly-column]');
    if (!head) return;
    dragging = {key: head.dataset.monthlyColumn, store: head.closest('[data-monthly-table-store]')?.dataset.monthlyTableStore || ''};
    head.classList.add('hp-monthly-dragging');
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragging.key); }
  });
  document.addEventListener('dragover', event => {
    if (!dragging || !inPage(event)) return;
    const head = event.target.closest('[data-monthly-column]');
    if (!head) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#monthly-activity .hp-monthly-drop-target').forEach(element => element.classList.remove('hp-monthly-drop-target'));
    if (head.dataset.monthlyColumn !== dragging.key) head.classList.add('hp-monthly-drop-target');
  });
  document.addEventListener('drop', event => {
    if (!dragging || !inPage(event)) return;
    const head = event.target.closest('[data-monthly-column]');
    if (!head) { clearDrag(); return; }
    event.preventDefault();
    const key = dragging.key, store = dragging.store, targetKey = head.dataset.monthlyColumn;
    clearDrag();
    reorderTo(key, targetKey, store);
  });
  document.addEventListener('dragend', () => { if (!pointerDrag) clearDrag(); });
  const previousRender = H.render;
  H.render = () => {
    previousRender();
    const badge = document.querySelector('.topbar .pill');
    if (badge) badge.textContent = '组织管理版 V3.8.2';
  };
})();
