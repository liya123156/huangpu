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
  assert.equal(H.version, '3.8');
  assert.equal(badge.textContent, '组织管理版 V3.8');
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
  assert.equal(model.rows.length, 9);
  assert(!model.rows.some(row => row.level === 'person' && row.person === '合成经理'));
  const groupNode = model.rows.find(row => row.level === 'group');
  assert.equal(H.monthlyEntityLabel(groupNode), 'A组 · 合成经理');
  assert.equal(groupNode.months['2026-11'].view, 28, 'hiding the manager row must not delete source contributions');
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
