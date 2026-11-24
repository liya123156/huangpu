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
    {id: 'group', level: 'group', label: 'A组', store: '合成门店', group: 'A组', parent: 'store'},
    {id: 'person', level: 'person', label: '合成顾问<script>', person: '合成顾问<script>', personId: 'DEMO-1', role: '顾问', store: '合成门店', group: 'A组', parent: 'group'},
    {id: 'manager', level: 'person', label: '合成经理', person: '合成经理', personId: 'DEMO-2', role: '店经理', store: '合成门店', group: 'A组', parent: 'group'}
  ];
  const nodes = base.map(node => ({...node, months: Object.fromEntries(months.map(month => [month, {...values}])), cellMeta: {'2026-10': {owner: {asterisk: true, note: '统计范围待核对'}}}}));
  const item = {name: '合成顾问', group: 'A组', values: {view: 7, channel: 4}, parts: {view: {rank: 1, percentile: 100, median: 3}, channel: {rank: 2, percentile: 75, median: 2}}, score: 87.5, rank: 1, bottomRank: 7, ties: 1};
  const ranking = {count: 7, eligible: 8, status: 'separate', all: [item], top: [item], bottom: [{...item, name: '合成提醒', values: {view: 0, channel: 0}, rank: 7, bottomRank: 1}], missing: [{name: '合成待补', missing: ['买卖带看']}], notJoined: []};
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
  return {H, view, nodes, ranking, listeners, saves, messages, badge, status};
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
  assert.equal((H.html.match(/rowspan="3"/g) || []).length, 4);
  assert.equal(H.currentModel, null);
  assert.equal(H.version, '3.7');
  assert.equal(badge.textContent, '组织管理版 V3.7');
});

test('true zero, missing, ratio denominator and source marks remain distinct', () => {
  const {H, nodes} = setup();
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'house').zero, true);
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'hmall').text, '—');
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'hmall').zero, false);
  assert.equal(H.monthlyFormatCell(nodes[3], months[0], 'rate').text, '25.0%');
  assert.equal(H.monthlyFormatCell({months: {m: {rate: null}}}, 'm', 'rate').text, '—');
  assert.equal(H.monthlyFormatCell({months: {m: {rate: 0}}}, 'm', 'rate').text, '0.0%');
  const marked = H.monthlyFormatCell(nodes[3], months[1], 'owner');
  assert.equal(marked.asterisk, true);
  assert.equal(marked.text, '2');
  assert.equal(marked.title, '统计范围待核对');
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
  assert.equal(model.rows.length, 4);
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

test('rankings use the model cohort, keep missing people out of the bottom group, and export the same month', () => {
  const {H} = setup();
  H.render();
  const rankingHTML = H.html.slice(H.html.indexOf('<section class="hp-monthly-review"'));
  assert(!rankingHTML.includes('合成经理'));
  assert(rankingHTML.includes('合成待补（缺买卖带看）'));
  assert(rankingHTML.includes('以上人员未计入后三名'));
  assert(rankingHTML.includes('数据依据：'));
  H.ui.monthlyBoard.rankMonth = '2026-10';
  const model = H.monthlyExportModel('合成门店');
  assert.equal(model.rankMonth, '2026-10');
  assert.equal(model.ranking.count, 7);
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
  H.data.novRoster = Array.from({length: 8}, (_, i) => ({personId: 'SYNTH-' + i, person: i === 6 ? '合成经理' : i === 7 ? '合成待补' : '合成顾问' + i, store, group, role: i === 6 ? '店经理' : '顾问', joinDate: '2020-01-01'}));
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
  assert.equal(model.rows.length, 10);
  assert.equal(model.ranking.count, 6);
  assert.equal(model.ranking.missing.length, 1);
  assert.equal(model.ranking.missing[0].name, '合成待补');
  assert(!model.ranking.all.some(person => person.name === '合成经理'));
  assert.equal(model.rows.find(node => node.person === '合成待补').months['2026-11'].view, null);
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
