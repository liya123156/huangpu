/* Synthetic-only checks for the monthly page and its image-export contract. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const script = fs.readFileSync(path.join(__dirname, '../assets/monthly-ui.js'), 'utf8');
const keys = ['house', 'owner', 'hmall', 'channel', 'entered', 'rate', 'view'];
const months = ['2026-09', '2026-10', '2026-11'];

function setup(saved = {}) {
  const listeners = {}, saves = [], messages = [], badge = {textContent: ''}, status = {textContent: ''};
  const values = {house: 0, owner: 2, hmall: null, channel: 4, entered: 1, rate: .25, view: 7};
  const base = [
    {id: 'region', level: 'region', label: '合成大区', parent: null, store: ''},
    {id: 'store', level: 'store', label: '合成门店', store: '合成门店', parent: 'region'},
    {id: 'group', level: 'group', label: 'A组', store: '合成门店', group: 'A组', parent: 'store', managerNames: ['合成经理']},
    {id: 'person', level: 'person', label: '合成顾问<script>', person: '合成顾问<script>', personId: 'DEMO-1', role: '顾问', store: '合成门店', group: 'A组', parent: 'group'}
  ];
  const nodes = base.map(node => ({...node, months: Object.fromEntries(months.map(month => [month, {...values}])), cellMeta: {'2026-10': {owner: {asterisk: true, note: '统计范围待核对'}}}}));
  const item = {name: '合成顾问', group: 'A组', values: {view: 7, channel: 4}, parts: {view: {rank: 1, percentile: 100, median: 3}, channel: {rank: 2, percentile: 75, median: 2}}, score: 87.5, rank: 1, bottomRank: 7, ties: 1};
  const ranking = {count: 7, eligible: 8, status: 'separate', all: [item], top: [item], bottom: [{...item, name: '合成提醒', values: {view: 0, channel: 0}, rank: 7, bottomRank: 1}], missing: [{name: '合成待核', missing: ['买卖带看来源未导入']}], notJoined: []};
  const view = {months, stores: ['合成门店'], nodes, rankings: {'合成门店': Object.fromEntries(months.map(month => [month, ranking]))}, notes: ['只按已经提供的数据展示。'], sourceCutoff: '2026-11-22'};
  const document = {
    addEventListener: (name, callback) => { listeners[name] = callback; },
    querySelectorAll: () => [],
    querySelector: selector => selector === '.topbar .pill' ? badge : null,
    getElementById: id => id === 'monthly-order-status' ? status : null
  };
  const H = {
    esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])),
    ui: {store: '合成门店', page: 'activity'}, data: {monthlyBoard: JSON.parse(JSON.stringify(saved))},
    monthlyColumns: keys.map(key => ({key})), monthlyView: () => view,
    toast: message => messages.push(message),
    save: async () => { saves.push(JSON.parse(JSON.stringify(H.data.monthlyBoard))); return true; },
    render: () => { H.html = H.renderActivity(); },
    go: page => { H.ui.page = page; }
  };
  H.getMonthlyColumnOrder = () => H.data.monthlyBoard.columnOrder || keys;
  vm.runInNewContext(script, {HP: H, document});
  return {H, view, nodes, ranking, listeners, saves, messages, badge, status, document};
}

test('the monthly page renders all hierarchy rows and three months without old expansion controls', () => {
  const {H, badge} = setup();
  H.currentModel = {title: '旧导出模型'};
  H.render();
  assert(H.html.includes('合成门店'));
  assert(H.html.includes('合成顾问&lt;script&gt;'));
  assert(H.html.includes('合成经理'));
  assert(!H.html.includes('<script>'));
  assert(!H.html.includes('收起'));
  assert(!H.html.includes('tree-toggle'));
  assert(!H.html.includes('暂含买卖'));
  assert(!H.html.includes('1—22日'));
  assert.equal((H.html.match(/rowspan="3"/g) || []).length, 3);
  assert(!H.html.includes('<span class="hp-monthly-kind">顾问</span>'));
  assert(H.html.includes('<span class="hp-monthly-manager"> · 合成经理</span>'));
  assert(H.html.includes('个人仅显示当前在职顾问；门店、店组保留当期历史合计。'));
  assert.equal(H.currentModel, null);
  assert(!H.html.includes('缺数据不按0'));
  assert(!H.html.includes('0</b> 为底表明确零值'));
  assert(H.html.includes('未记录活动量按'));
  assert.equal(H.version, '3.9.0');
  assert.equal(badge.textContent, '组织管理版 V3.9.0');
});

test('unrecorded activity and ratios display as red zero while source marks stay visible', () => {
  const {H, nodes} = setup();
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'house').zero, true);
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'hmall').text, '0');
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'hmall').zero, true);
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'hmall').className, 'hp-monthly-zero');
  assert.equal(H.monthlyFormatCell({}, 'm', 'view').value, 0);
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'rate').text, '25.0%');
  assert.equal(H.monthlyFormatCell({months: {m: {rate: null}}}, 'm', 'rate').text, '0.0%');
  assert.equal(H.monthlyFormatCell({}, 'm', 'rate').text, '0.0%');
  assert.equal(H.monthlyFormatCell({months: {m: {rate: 0}}}, 'm', 'rate').text, '0.0%');
  const marked = H.monthlyFormatCell(nodes[3], months[1], 'owner');
  assert.equal(marked.asterisk, true);
  assert.equal(marked.text, '2');
  assert.equal(marked.title, '统计范围待核对');
});

test('source conflicts and invalid values remain pending instead of becoming zero', () => {
  const {H} = setup();
  const conflicted = {months: {m: {view: null, rate: 0}}, cellMeta: {m: {view: {status: 'conflict', note: '同一周期来源不一致'}, rate: {status: 'conflict'}}}};
  for (const key of ['view', 'rate']) {
    const cell = H.monthlyFormatCell(conflicted, 'm', key);
    assert.equal(cell.text, '待核对');
    assert.equal(cell.value, null);
    assert.equal(cell.zero, false);
    assert.equal(cell.pending, true);
    assert.notEqual(cell.className, 'hp-monthly-zero');
  }
  assert.equal(H.monthlyFormatCell(conflicted, 'm', 'view').title, '同一周期来源不一致');
  assert.equal(H.monthlyFormatCell({months: {m: {view: NaN}}}, 'm', 'view').text, '待核对');
  assert.equal(H.monthlyFormatCell({months: {m: {view: '错误'}}}, 'm', 'view').text, '待核对');
});

test('moving a column moves its values, keeps two fixed columns, persists and survives reload', async () => {
  const {H, saves, nodes} = setup();
  H.render();
  const requested = ['view', 'house', 'owner', 'hmall', 'channel', 'entered', 'rate'];
  assert.equal(await H.setMonthlyColumnOrder(requested), true);
  assert.deepEqual(saves.at(-1).columnOrder, requested);
  const model = H.monthlyExportModel('合成门店');
  assert.deepEqual(Array.from(model.columns, column => column.key), requested);
  assert.equal(model.columns.reduce((sum, column) => sum + column.share, 0), 76);
  assert.equal(H.monthlyFormatCell(model.rows[2], months[0], model.columns[0].key).value, 7);
  assert(H.html.indexOf('data-monthly-column="view"') < H.html.indexOf('data-monthly-column="house"'));
  const personBody = H.html.slice(H.html.indexOf('<tbody class="hp-monthly-entity hp-monthly-level-person">'));
  assert.match(personBody, /<td class="hp-monthly-month">9月<\/td><td class="">7<\/td><td class="hp-monthly-zero">0<\/td>/);
  assert.equal(model.rows.length, 3);
  assert.equal(model.rows[2].personId, nodes[3].personId);
  const reload = setup(saves.at(-1));
  assert.equal(reload.H.monthlyExportModel('合成门店').columns[0].key, 'view');
  assert.equal(await H.setMonthlyColumnOrder(['view', 'view']), false);
  assert.deepEqual(saves.at(-1).columnOrder, requested);
});

test('store filter keeps all-store selection independent of the old page filter', () => {
  const {H, listeners} = setup();
  H.render();
  assert(H.html.includes('复制本店图片'));
  const page = {}, control = {dataset: {monthlyFilter: 'store'}, value: ''};
  const target = {closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-filter]' ? control : null};
  listeners.change({target});
  assert.equal(H.ui.monthlyBoard.store, '');
  assert.equal(H.ui.store, '合成门店');
  H.render();
  assert(H.html.includes('黄浦大区合计'));
  assert(!H.html.includes('复制本店图片'));
  assert(H.html.includes('data-monthly-action="copy" data-store="合成门店"'));
  control.value = '合成门店';
  listeners.change({target});
  assert(H.html.includes('复制本店图片'));
  assert(!H.html.includes('<h2>黄浦大区合计</h2>'));
});

function changeFilter(app, name, value) {
  const page = {}, control = {dataset: {monthlyFilter: name}, value};
  const target = {closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-filter]' ? control : null};
  app.listeners.change({target});
}
function selectMarkup(html, id) {
  const match = html.match(new RegExp('<select\\b([^>]*\\bid="' + id + '"[^>]*)>([\\s\\S]*?)<\\/select>'));
  assert(match, 'Expected select #' + id);
  return {attributes: match[1], content: match[2], values: [...match[2].matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*>/g)].map(option => option[1])};
}
function tableMarkup(html) {
  const match = html.match(/<table\b[^>]*class="[^"]*hp-monthly-table[^"]*"[^>]*>[\s\S]*?<\/table>/);
  assert(match, 'Expected monthly activity table');
  return match[0];
}

function groupsSetup() {
  const app = setup(), {H, view} = app;
  const stores = ['合成甲店', '合成乙店', '合成丙店', '合成丁店'];
  const make = node => ({...node, months: Object.fromEntries(months.map((month, index) => [month, {house: 0, owner: index + 1, hmall: 2, channel: 4, entered: 1, rate: .25, view: 5 + index}])), cellMeta: {}});
  view.stores = stores;
  view.nodes = [make({id: 'region', level: 'region', label: '合成大区', store: '', parent: null})];
  view.rankings = {};
  for (const [storeIndex, store] of stores.entries()) {
    const storeId = 'store-' + storeIndex;
    view.nodes.push(make({id: storeId, level: 'store', label: store, store, parent: 'region'}));
    view.rankings[store] = Object.fromEntries(months.map(month => [month, {...app.ranking, month}]));
    for (const [groupIndex, letter] of ['A', 'B', 'C', 'D'].entries()) {
      const group = store + letter + '组', groupId = 'group-' + storeIndex + '-' + groupIndex;
      view.nodes.push(make({id: groupId, level: 'group', label: letter + '组', store, group, parent: storeId, managerNames: ['合成经理' + storeIndex + groupIndex]}));
      view.nodes.push(make({id: 'person-' + storeIndex + '-' + groupIndex, level: 'person', label: '合成顾问' + storeIndex + groupIndex, person: '合成顾问' + storeIndex + groupIndex, personId: 'GROUP-SYNTH-' + storeIndex + groupIndex, role: '顾问', store, group, parent: groupId}));
    }
  }
  H.ui.store = stores[0];
  H.data.facts = view.nodes.filter(node => node.level === 'person').map(node => ({personId: node.personId, store: node.store, group: node.group, metric: 'view', start: '2026-10-01', value: 6}));
  H.data.novRoster = view.nodes.filter(node => node.level === 'person').map(node => ({personId: node.personId, person: node.person, store: node.store, group: node.group, role: '顾问'}));
  return {...app, stores};
}

test('groups display shows sixteen groups in one table and keeps the selected month', () => {
  const app = groupsSetup(), {H, view} = app;
  const sourceBefore = JSON.stringify(view), factsBefore = JSON.stringify(H.data.facts);
  H.render();
  assert.equal(H.ui.monthlyBoard.display, 'detail');
  const displaySelect = selectMarkup(H.html, 'monthly-display');
  assert(displaySelect.attributes.includes('data-monthly-filter="display"'));
  assert.deepEqual(displaySelect.values, ['detail', 'groups']);
  assert(displaySelect.content.includes('门店、店组、个人') && displaySelect.content.includes('只看店组'));
  changeFilter(app, 'month', '2026-10');
  changeFilter(app, 'display', 'groups');
  assert.equal(H.ui.monthlyBoard.display, 'groups');
  assert.equal(H.ui.monthlyBoard.store, '', 'entering the regional group view clears the previous store filter');
  assert.equal(H.ui.monthlyBoard.month, '2026-10');
  assert.equal((H.html.match(/<table\b[^>]*class="[^"]*hp-monthly-table/g) || []).length, 1);
  const table = tableMarkup(H.html);
  assert.equal((table.match(/<tbody\b[^>]*hp-monthly-level-group/g) || []).length, 16);
  assert.equal((table.match(/rowspan="1"/g) || []).length, 16);
  assert(!table.includes('hp-monthly-level-store') && !table.includes('hp-monthly-level-person') && !table.includes('hp-monthly-level-region'));
  assert(!H.html.includes('id="monthly-ranking-output"'));
  assert(!H.html.includes('活动量标杆与重点提醒'));
  assert(!H.html.includes('合成顾问00'));
  const model = H.monthlyGroupExportModel();
  assert.equal(model.kind, 'groups');
  assert.equal(model.store, '黄浦大区');
  assert.equal(model.rows.length, 16);
  assert(model.rows.every(row => row.level === 'group'));
  assert.deepEqual(Array.from(model.months), ['2026-10']);
  assert.equal(model.ranking, null);
  assert.equal(model.subtitle, '2026年10月 · 16个店组');
  for (const row of model.rows) {
    assert.notEqual(row, view.nodes.find(node => node.id === row.id), 'group labels belong to projected clones, not the source nodes');
    assert(row.label.includes(row.store));
    assert(row.label.includes(row.group.slice(row.store.length)));
    assert(H.monthlyEntityLabel(row).includes(row.managerNames[0]));
    assert(table.includes(row.managerNames[0]));
  }
  assert.equal(JSON.stringify(view), sourceBefore);
  assert.equal(JSON.stringify(H.data.facts), factsBefore);
});

test('group filters narrow to four groups, restore three months, and return to the complete detail hierarchy', () => {
  const app = groupsSetup(), {H, view, stores} = app;
  const sourceBefore = JSON.stringify(view), factsBefore = JSON.stringify(H.data.facts);
  H.render();
  changeFilter(app, 'display', 'groups');
  assert.equal((tableMarkup(H.html).match(/rowspan="3"/g) || []).length, 16);
  changeFilter(app, 'month', '2026-10');
  changeFilter(app, 'store', stores[2]);
  H.render();
  assert.equal(H.ui.monthlyBoard.store, stores[2], 'rendering an existing group view must not reset the store again');
  assert.equal(H.ui.monthlyBoard.month, '2026-10');
  let exported = H.monthlyGroupExportModel();
  assert.equal(exported.store, stores[2]);
  assert.equal(exported.rows.length, 4);
  assert(exported.rows.every(row => row.store === stores[2] && row.level === 'group'));
  assert.deepEqual(Array.from(exported.months), ['2026-10']);
  assert.equal((tableMarkup(H.html).match(/rowspan="1"/g) || []).length, 4);
  changeFilter(app, 'month', '');
  exported = H.monthlyGroupExportModel();
  assert.deepEqual(Array.from(exported.months), months);
  assert.equal((tableMarkup(H.html).match(/rowspan="3"/g) || []).length, 4);
  changeFilter(app, 'display', 'detail');
  assert.equal(H.ui.monthlyBoard.display, 'detail');
  assert.equal(H.ui.monthlyBoard.store, stores[2]);
  assert(H.html.includes('id="monthly-ranking-output"'));
  const detail = H.monthlyExportModel(stores[2]);
  assert.equal(detail.rows.filter(row => row.level === 'store').length, 1);
  assert.equal(detail.rows.filter(row => row.level === 'group').length, 4);
  assert.equal(detail.rows.filter(row => row.level === 'person').length, 4);
  assert.equal((tableMarkup(H.html).match(/rowspan="3"/g) || []).length, 9);
  assert.equal(view.nodes.find(node => node.level === 'group').label, 'A组');
  assert.equal(JSON.stringify(view), sourceBefore);
  assert.equal(JSON.stringify(H.data.facts), factsBefore);
});

test('group image buttons dispatch the combined exporters with current filters and column order', async () => {
  const app = groupsSetup(), {H, stores} = app;
  H.render();
  changeFilter(app, 'display', 'groups');
  changeFilter(app, 'month', '2026-11');
  changeFilter(app, 'store', stores[1]);
  const order = ['view', 'house', 'owner', 'hmall', 'channel', 'entered', 'rate'];
  await H.setMonthlyColumnOrder(order);
  assert(H.html.includes('data-monthly-action="copyGroups"'));
  assert(H.html.includes('data-monthly-action="saveGroups"'));
  const calls = [];
  H.copyMonthlyGroups = () => calls.push({action: 'copy', model: H.monthlyGroupExportModel()});
  H.saveMonthlyGroups = () => calls.push({action: 'save', model: H.monthlyGroupExportModel()});
  H.copyMonthlyStore = () => { throw Error('The group image must not dispatch the detail store exporter'); };
  H.saveMonthlyStore = H.copyMonthlyStore;
  const page = {}, button = {dataset: {monthlyAction: 'copyGroups'}};
  const target = {closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-action]' ? button : null};
  app.listeners.click({target});
  button.dataset.monthlyAction = 'saveGroups'; app.listeners.click({target});
  assert.deepEqual(calls.map(call => call.action), ['copy', 'save']);
  for (const {model} of calls) {
    assert.equal(model.kind, 'groups');
    assert.equal(model.store, stores[1]);
    assert.equal(model.rows.length, 4);
    assert.equal(model.ranking, null);
    assert.deepEqual(Array.from(model.months), ['2026-11']);
    assert.deepEqual(Array.from(model.columns, column => column.key), order);
  }
});

test('month filter starts with all base months and leaves the ranking month independently selectable', () => {
  const app = setup(), {H} = app;
  H.render();
  const selector = selectMarkup(H.html, 'monthly-month');
  assert(selector.attributes.includes('data-monthly-filter="month"'));
  assert(selector.content.includes('全部月份'));
  assert.deepEqual(selector.values, ['', ...months]);
  assert.equal(H.ui.monthlyBoard.month, '');
  assert.deepEqual(Array.from(H.monthlyExportModel('合成门店').months), months);
  const rankSelector = selectMarkup(H.html, 'monthly-rank-month');
  assert.deepEqual(rankSelector.values, months);
  assert(!/\bdisabled\b/.test(rankSelector.attributes));
  changeFilter(app, 'rankMonth', '2026-09');
  H.render();
  assert.equal(H.monthlyExportModel('合成门店').rankMonth, '2026-09');
  assert.deepEqual(Array.from(H.monthlyExportModel('合成门店').months), months, 'independent ranking changes must not filter the main table');
});

test('one selected month preserves every hierarchy node and synchronizes table, notes, ranking and export', () => {
  const app = setup(), {H, view, nodes} = app;
  for (const node of nodes) for (const month of months) {
    node.months[month].view = month === '2026-09' ? 17 : month === '2026-10' ? 27 : 37;
    node.cellMeta[month] = {owner: {status: 'unconfirmed', note: month + '来源范围待核', sourcePeriods: [month + '-10至' + month + '-12']}};
  }
  for (const month of months) view.rankings['合成门店'][month] = {...app.ranking, month};
  H.data.facts = [{personId: 'SYNTHETIC-MONTH', metric: 'view', start: '2026-09-01', value: 17}];
  const beforeFacts = JSON.stringify(H.data.facts), beforeView = JSON.stringify(view);
  H.render();
  const allIds = Array.from(H.monthlyExportModel('合成门店').rows, row => row.id);
  changeFilter(app, 'month', '2026-10');
  assert.equal(H.ui.monthlyBoard.month, '2026-10');
  const table = tableMarkup(H.html);
  assert.equal((table.match(/rowspan="1"/g) || []).length, 3);
  assert.equal((table.match(/class="hp-monthly-month">10月<\/td>/g) || []).length, 3);
  assert(!table.includes('>9月<') && !table.includes('>11月<'));
  assert(table.includes('合成门店') && table.includes('A组') && table.includes('合成顾问&lt;script&gt;'));
  assert.match(table, /aria-label="[^"]*10月[^"]*"/);
  assert(!table.includes('三个月活动量'));
  assert(H.html.includes('<p>2026年10月</p>'));
  const rankingSelect = selectMarkup(H.html, 'monthly-rank-month');
  assert.deepEqual(rankingSelect.values, ['2026-10']);
  assert(/\bdisabled\b/.test(rankingSelect.attributes));
  assert.equal(H.ui.monthlyBoard.rankMonth, '2026-10');
  const exported = H.monthlyExportModel('合成门店');
  assert.deepEqual(Array.from(exported.months), ['2026-10']);
  assert.deepEqual(Array.from(exported.rows, row => row.id), allIds);
  assert.equal(exported.subtitle, '2026年10月');
  assert.equal(exported.rankMonth, '2026-10');
  assert.equal(exported.ranking.month, '2026-10');
  assert.equal(H.monthlyFormatCell(exported.rows[2], exported.months[0], 'view').value, 27);
  const notes = exported.notes.join('\n');
  assert(notes.includes('10月业主面见'));
  assert(!notes.includes('9月业主面见') && !notes.includes('11月业主面见'));
  const footer = H.html.slice(H.html.indexOf('<footer class="hp-monthly-notes">'));
  assert(footer.includes('10月业主面见'));
  assert(!footer.includes('9月业主面见') && !footer.includes('11月业主面见'));
  assert.equal(JSON.stringify(H.data.facts), beforeFacts);
  assert.equal(JSON.stringify(view), beforeView, 'display filtering must not rewrite the base model or its month list');
});

test('changing stores retains the selected month and choosing all restores all base months', () => {
  const app = setup(), {H, view} = app;
  view.stores.push('合成二店');
  view.rankings['合成二店'] = Object.fromEntries(months.map(month => [month, {...app.ranking, month}]));
  const secondNodes = view.nodes.filter(node => node.level !== 'region').map(node => ({...JSON.parse(JSON.stringify(node)), id: node.id + '-second', parent: node.parent === 'region' ? 'region' : node.parent + '-second', store: '合成二店', label: node.level === 'store' ? '合成二店' : node.label}));
  view.nodes.push(...secondNodes);
  H.render();
  changeFilter(app, 'month', '2026-10');
  changeFilter(app, 'store', '合成二店');
  assert.equal(H.ui.monthlyBoard.month, '2026-10');
  assert.equal(H.ui.monthlyBoard.store, '合成二店');
  assert.deepEqual(Array.from(H.monthlyExportModel('合成二店').months), ['2026-10']);
  assert.equal(H.monthlyExportModel('合成二店').rows.length, 3);
  assert(H.monthlyExportModel('合成二店').rows.every(row => row.store === '合成二店'));
  assert.equal((tableMarkup(H.html).match(/rowspan="1"/g) || []).length, 3);
  changeFilter(app, 'store', '');
  assert.equal(H.ui.monthlyBoard.month, '2026-10');
  assert.equal((H.html.match(/rowspan="1"/g) || []).length, 7, 'all stores must retain region, stores, groups and consultants');
  changeFilter(app, 'month', '');
  assert.equal(H.ui.monthlyBoard.month, '');
  assert.deepEqual(Array.from(H.monthlyExportModel('合成二店').months), months);
  assert.equal((H.html.match(/rowspan="3"/g) || []).length, 7);
  assert(!/\bdisabled\b/.test(selectMarkup(H.html, 'monthly-rank-month').attributes));
  assert.deepEqual(selectMarkup(H.html, 'monthly-month').values, ['', ...months]);
  changeFilter(app, 'rankMonth', '2026-09');
  assert.equal(H.monthlyExportModel('合成二店').rankMonth, '2026-09');
});

test('unavailable month selections fall back to all without altering the base data', () => {
  const app = setup(), {H, view} = app;
  H.ui.monthlyBoard = {store: '合成门店', month: '2031-12', rankMonth: '2026-11'};
  H.data.facts = [{metric: 'view', start: '2026-11-01', value: 9}];
  const beforeFacts = JSON.stringify(H.data.facts), beforeView = JSON.stringify(view);
  H.render();
  assert.equal(H.ui.monthlyBoard.month, '');
  assert.deepEqual(Array.from(H.monthlyExportModel('合成门店').months), months);
  changeFilter(app, 'month', 'not-a-month');
  assert.equal(H.ui.monthlyBoard.month, '');
  assert.deepEqual(selectMarkup(H.html, 'monthly-month').values, ['', ...months]);
  assert.equal(JSON.stringify(H.data.facts), beforeFacts);
  assert.equal(JSON.stringify(view), beforeView);
});

test('rankings label source problems as pending and export the same selected month', () => {
  const {H} = setup();
  H.render();
  const rankingHTML = H.html.slice(H.html.indexOf('<section class="hp-monthly-review"'));
  assert(!rankingHTML.includes('合成经理'));
  assert(rankingHTML.includes('合成待核（买卖带看来源未导入）'));
  assert(rankingHTML.includes('以上人员暂不参与排名'));
  assert(rankingHTML.includes('人参与比较'));
  assert(rankingHTML.includes('待核对：'));
  assert(!rankingHTML.includes('数据待补'));
  assert(rankingHTML.includes('数据依据：'));
  H.ui.monthlyBoard.rankMonth = '2026-10';
  const model = H.monthlyExportModel('合成门店');
  assert.equal(model.rankMonth, '2026-10');
  assert.equal(model.ranking.count, 7);
  assert(model.notes.includes('未记录活动量按0；新增与进入带看均为0时，进入带看率按0.0%显示。'));
  assert(!model.notes.some(note => note.includes('—为未提供') || note.includes('明确零值')));
  assert(H.monthlyRankReason(model.ranking.bottom[0], model.ranking, 'bottom').includes('买卖带看为0'));
});

test('image buttons dispatch the current store without changing page data', () => {
  const {H, listeners} = setup();
  const calls = [];
  H.copyMonthlyStore = store => calls.push(['copy', store]);
  H.saveMonthlyStore = store => calls.push(['save', store]);
  const page = {}, button = {dataset: {monthlyAction: 'copy', store: '合成门店'}};
  const target = {closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-action]' ? button : null};
  listeners.click({target});
  button.dataset.monthlyAction = 'save'; listeners.click({target});
  assert.deepEqual(calls, [['copy', '合成门店'], ['save', '合成门店']]);
});

test('header keyboard and drag actions use valid metric keys and preserve the full permutation', async () => {
  const {H, listeners, saves} = setup();
  H.render();
  const page = {}, table = {dataset: {monthlyTableStore: '合成门店'}};
  const head = {dataset: {monthlyColumn: 'owner'}, classList: {add() {}, remove() {}}, closest: selector => selector === '[data-monthly-table-store]' ? table : null};
  const target = {closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-column]' ? head : null};
  let prevented = false;
  listeners.keydown({target, key: 'ArrowLeft', preventDefault() { prevented = true; }});
  await Promise.resolve();
  assert(prevented);
  assert.equal(H.data.monthlyBoard.columnOrder[0], 'owner');
  const transfer = {setData() {}, effectAllowed: '', dropEffect: ''};
  listeners.dragstart({target, dataTransfer: transfer});
  head.dataset.monthlyColumn = 'view';
  listeners.drop({target, preventDefault() {}});
  await Promise.resolve();
  assert.equal(H.data.monthlyBoard.columnOrder.at(-1), 'owner');
  assert.equal(new Set(saves.at(-1).columnOrder).size, 7);
  assert.deepEqual([...saves.at(-1).columnOrder].sort(), [...keys].sort());
});

function pointerHarness() {
  const app = setup(), classes = () => {
    const names = new Set();
    return {add: (...values) => values.forEach(value => names.add(value)), remove: (...values) => values.forEach(value => names.delete(value)), contains: value => names.has(value)};
  };
  const page = {classList: classes()}, table = {dataset: {monthlyTableStore: '合成门店'}};
  const heads = ['owner', 'view'].map(key => {
    const attributes = {draggable: 'true'};
    const head = {
      dataset: {monthlyColumn: key}, classList: classes(), focused: false,
      getAttribute: key => attributes[key], setAttribute: (key, value) => { attributes[key] = value; },
      setPointerCapture: id => { head.captured = id; }, releasePointerCapture: id => { if (head.captured === id) head.captured = null; },
      focus: () => { head.focused = true; },
      closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-column]' ? head : selector === '[data-monthly-table-store]' ? table : null
    };
    return head;
  });
  app.document.elementFromPoint = (x, y) => y < 0 || y > 90 ? null : x >= 90 && x <= 180 ? heads[0] : x >= 500 && x <= 650 ? heads[1] : null;
  app.document.querySelectorAll = selector => selector.includes('[data-monthly-column]') ? heads : heads.filter(head => (selector.includes('.hp-monthly-dragging') && head.classList.contains('hp-monthly-dragging')) || (selector.includes('.hp-monthly-drop-target') && head.classList.contains('hp-monthly-drop-target')));
  const event = (x, y, extra = {}) => ({pointerId: 1, button: 0, isPrimary: true, target: heads[0], clientX: x, clientY: y, preventDefault() { this.prevented = true; }, ...extra});
  app.H.render();
  return {...app, page, heads, event};
}

test('pointer dragging reorders once, saves once, restores native attributes and avoids an accidental click', async () => {
  const {H, listeners, saves, heads, page, event} = pointerHarness();
  listeners.pointerdown(event(120, 30));
  assert.equal(heads[0].getAttribute('draggable'), 'false');
  const move = event(600, 30); listeners.pointermove(move);
  assert(move.prevented);
  assert(page.classList.contains('hp-monthly-is-dragging'));
  assert(heads[1].classList.contains('hp-monthly-drop-target'));
  assert.equal(heads[0].captured, 1);
  const nativeStart = event(600, 30); listeners.dragstart(nativeStart);
  assert(nativeStart.prevented, 'native drag must not take over an active pointer gesture');
  listeners.pointerup(event(600, 30));
  await Promise.resolve();
  assert.equal(H.data.monthlyBoard.columnOrder.at(-1), 'owner');
  assert.equal(saves.length, 1);
  assert.equal(heads[0].getAttribute('draggable'), 'true');
  assert.equal(heads[0].captured, null);
  assert(!page.classList.contains('hp-monthly-is-dragging'));
  listeners.drop(event(600, 30));
  assert.equal(saves.length, 1, 'a trailing native drop must not apply the move a second time');
  let copied = false;
  H.copyMonthlyStore = () => { copied = true; };
  const button = {dataset: {monthlyAction: 'copy', store: '合成门店'}, closest: selector => selector === '#monthly-activity' ? page : selector === '[data-monthly-action]' ? button : null};
  const click = event(600, 30, {target: button}); listeners.click(click);
  assert(click.prevented);
  assert.equal(copied, false, 'release-generated clicks must not trigger image buttons');
});

test('header clicks, tiny movement, vertical scrolling and cancelled gestures do not reorder', async () => {
  const {H, listeners, saves, heads, page, event} = pointerHarness();
  listeners.pointerdown(event(120, 30));
  listeners.pointermove(event(124, 30));
  listeners.pointerup(event(124, 30));
  assert.equal(saves.length, 0);
  assert.equal(heads[0].getAttribute('draggable'), 'true');
  listeners.pointerdown(event(120, 30));
  const vertical = event(122, 60); listeners.pointermove(vertical);
  assert(!vertical.prevented, 'vertical scrolling is not a horizontal column move');
  assert.equal(heads[0].getAttribute('draggable'), 'true');
  listeners.pointerdown(event(120, 30));
  listeners.pointermove(event(600, 30));
  listeners.pointercancel(event(600, 30));
  listeners.pointerup(event(600, 30));
  assert.equal(saves.length, 0);
  assert(!page.classList.contains('hp-monthly-is-dragging'));
  const button = {closest: selector => selector === '#monthly-activity' ? page : selector === 'button' ? button : selector === '[data-monthly-column]' ? heads[0] : null};
  listeners.pointerdown(event(120, 30, {target: button}));
  listeners.pointermove(event(600, 30));
  listeners.pointerup(event(600, 30));
  assert.equal(saves.length, 0);
  assert.equal(heads[0].getAttribute('draggable'), 'true');
  assert.equal(H.monthlyExportModel('合成门店').columns[0].key, 'house');
});

test('the real monthly model connects to the page, rankings, backup order and image contract', async () => {
  const document = {addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null};
  const sandbox = {window: {}, document};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/core.js'), 'utf8'), sandbox);
  const H = sandbox.window.HP; sandbox.HP = H;
  H.today = () => '2026-11-24'; H.render = () => { H.html = H.renderActivity(); }; H.toast = () => {}; H.save = async () => true;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/monthly-model.js'), 'utf8'), sandbox);
  H.data = H.empty();
  const store = '合成集成店', group = store + 'A组';
  H.data.novRoster = Array.from({length: 8}, (_, i) => ({personId: 'SYNTH-' + i, person: i === 6 ? '合成经理' : i === 7 ? '合成未记录' : '合成顾问' + i, store, group, role: i === 6 ? '店经理' : '顾问', joinDate: '2020-01-01'}));
  const metrics = ['newhouse', 'ownermeet', 'hmallassist', 'channel', 'channelMonthEntered', 'view'];
  for (const month of months) for (let i = 0; i < 7; i++) for (const metric of metrics) {
    const person = H.data.novRoster[i], end = month === '2026-09' ? month + '-30' : month === '2026-10' ? month + '-31' : month + '-22';
    H.data.facts.push({category: 'activity', level: 'person', ...person, metric, value: metric === 'newhouse' ? 0 : metric === 'channelMonthEntered' ? 1 : i + 1, periodType: 'monthly', start: month + '-01', end, observedThrough: end, sourceKind: 'monthlyActivity', sourceFile: 'synthetic.xlsx', sourceSheet: 'synthetic', sourceHash: 'synthetic-only', sourceMonths: months, sourceMetrics: metrics, importScopeStores: [store], importedAt: '2026-11-24T00:00:00Z', coverageConfirmed: true});
  }
  vm.runInContext(script, sandbox);
  H.render();
  const model = H.monthlyExportModel(store);
  assert.deepEqual(Array.from(model.months), months);
  assert.equal(model.subtitle, '2026年9月、10月、11月');
  assert.equal(model.rows.length, 9);
  assert(!model.rows.some(row => row.level === 'person' && row.person === '合成经理'));
  const groupNode = model.rows.find(row => row.level === 'group');
  assert.equal(H.monthlyEntityLabel(groupNode), 'A组 · 合成经理');
  assert.equal(groupNode.months['2026-11'].view, 28, 'hiding the manager row must not delete source contributions');
  assert.equal(model.ranking.count, 7);
  assert.equal(model.ranking.missing.length, 0);
  assert(model.ranking.all.some(person => person.name === '合成未记录' && person.values.view === 0 && person.values.channel === 0));
  assert(!model.ranking.all.some(person => person.name === '合成经理'));
  const unrecorded = model.rows.find(node => node.person === '合成未记录');
  assert.equal(unrecorded.months['2026-11'].view, 0);
  assert.equal(unrecorded.months['2026-11'].rate, 0);
  assert.equal(H.monthlyFormatCell(unrecorded, '2026-11', 'rate').text, '0.0%');
  assert.equal(model.columns.find(column => column.key === 'entered').label, '重点渠道当月进入带看');
  assert.equal(model.columns.find(column => column.key === 'hmall').label, 'hmall陪带次数');
  const order = ['rate', 'view', 'house', 'owner', 'hmall', 'channel', 'entered'];
  await H.setMonthlyColumnOrder(order);
  H.data = H.cleanBackup(JSON.parse(JSON.stringify(H.data)));
  assert.deepEqual(Array.from(H.monthlyExportModel(store).columns, column => column.key), order);
  const node = H.monthlyExportModel(store).rows.find(row => row.personId === 'SYNTH-0');
  assert.equal(H.monthlyFormatCell(node, '2026-11', 'rate').text, '100.0%');
  assert.equal(H.monthlyFormatCell(node, '2026-11', 'house').zero, true);
});
