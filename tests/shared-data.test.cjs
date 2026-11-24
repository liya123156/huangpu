/* Synthetic-only privacy, snapshot and viewer-contract tests for shared activity. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const KEYS = ['house', 'owner', 'hmall', 'channel', 'entered', 'rate', 'view'];
const MONTHS = ['2030-12', '2031-01', '2031-02'];
const STORES = ['合成甲店', '合成乙店'];
const PRIVATE = 'PRIVATE_HR_SENTINEL_NEVER_SHARE';
const clone = value => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const nodeKey = node => JSON.stringify([node.level, node.store, node.group, node.person]);

function setup() {
  const document = {
    addEventListener() {}, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  const context = {console, Date, Map, Set, JSON, Number, String, Math, URL, Blob,
    crypto: require('node:crypto').webcrypto, document};
  context.window = context;
  vm.createContext(context);
  for (const file of ['core', 'imports', 'views', 'organization-model', 'data-management',
    'weekly-model', 'monthly-model', 'monthly-ui', 'shared-data']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/' + file + '.js'), 'utf8'),
      context, {filename: file + '.js'});
  }
  const H = context.HP;
  H.today = () => '2031-02-24';
  return H;
}

function staff(index, store = STORES[0], more = {}) {
  return {level: 'person', store, group: store + (index % 2 ? 'B组' : 'A组'),
    person: store + '合成顾问' + index, personId: 'PRIVATE_EMPLOYEE_' + store + '_' + index,
    role: '顾问', joinDate: '2010-04-09', grade: PRIVATE, ...more};
}

function fact(person, metric, value, selectedMonth, more = {}) {
  const end = selectedMonth === '2031-02' ? '2031-02-28' : selectedMonth + '-31';
  return {...person, category: 'activity', metric, value, month: selectedMonth,
    start: selectedMonth + '-01', end, periodType: 'monthly',
    observedThrough: selectedMonth === '2031-02' ? '2031-02-22' : end,
    sourceKind: 'monthlySynthetic', sourceHash: PRIVATE + metric,
    sourceFile: PRIVATE + '.xlsx', sourceSheet: PRIVATE + '明细', sourceRow: 17,
    sourceStart: selectedMonth + '-01', sourceEnd: end,
    sourceMetrics: [metric], sourceMonths: [selectedMonth], sourceStores: [person.store],
    importedAt: '2031-02-24T01:00:00Z', coverageConfirmed: true,
    periodComplete: selectedMonth !== '2031-02', ...more};
}

function fixture(H) {
  const data = H.empty();
  data.monthlyBoard.columnOrder = ['view', 'channel', 'house', 'owner', 'hmall', 'entered', 'rate'];
  data.followItems = [{text: PRIVATE, personId: 'PRIVATE_FOLLOW_EMPLOYEE'}];
  data.history = [{before: {joinDate: '2010-04-09', note: PRIVATE}}];
  data.novAudit = [{raw: PRIVATE}];
  for (let storeIndex = 0; storeIndex < STORES.length; storeIndex++) {
    const store = STORES[storeIndex];
    for (let i = 0; i < 8; i++) data.novRoster.push(staff(i, store));
    const manager = staff(90, store, {role: '店经理', person: store + '合成经理'});
    const former = staff(91, store, {employmentStatus: '离职', person: store + '历史成员'});
    data.novRoster.push(manager, former);
    for (let m = 0; m < MONTHS.length; m++) {
      const selectedMonth = MONTHS[m];
      for (let i = 0; i < 8; i++) {
        const person = staff(i, store);
        const amount = (8 - i) * (m + 1) + storeIndex;
        for (const [metric, value] of [['view', amount], ['channel', amount * 2],
          ['channelMonthEntered', amount], ['newhouse', i % 3], ['ownermeet', i + m],
          ['hmallassist', i === 0 ? 0 : amount + 1]]) {
          const extra = metric === 'ownermeet' && selectedMonth === '2031-01'
            ? {coverageConfirmed: false, coverageNote: PRIVATE + ' PRIVATE_EMPLOYEE_COMMENT',
              displayAsterisk: true, sourceEnd: '2031-01-03'} : {};
          data.facts.push(fact(person, metric, value, selectedMonth, extra));
        }
      }
      // Historical and manager source activity remains in aggregate totals,
      // while neither becomes a current-consultant person row or ranking entry.
      data.facts.push(fact(manager, 'view', 2, selectedMonth));
      data.facts.push(fact(former, 'view', 3, selectedMonth));
    }
  }
  data.facts.push(fact(staff(0), 'actual', 999, '2031-02', {privateMemo: PRIVATE}));
  return data;
}

function localView(H, data) {
  const previousData = H.data, previousBoard = H.ui.monthlyBoard;
  const hadBoard = own(H.ui, 'monthlyBoard');
  try {
    H.data = data; H.ui.monthlyBoard = {};
    return H.monthlyView({store: ''});
  } finally {
    H.data = previousData;
    if (hadBoard) H.ui.monthlyBoard = previousBoard;
    else delete H.ui.monthlyBoard;
  }
}

function assertPrivateFieldsAbsent(value) {
  const forbidden = new Set(['personId', 'joinDate', 'sourceEvidence', 'sourceHash', 'sourceFile',
    'sourceSheet', 'sourceRow', 'sourceRows', 'sourceField', 'sourceColumn', 'sourceValue',
    'sourceGroups', 'signature', 'facts', 'flowFacts', 'novRoster', 'followItems', 'history',
    'employmentStatus', 'privateMemo', 'raw', 'grade']);
  function visit(item, location = '$') {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      assert.ok(!forbidden.has(key), 'Private field at ' + location + '.' + key);
      visit(child, location + '.' + key);
    }
  }
  visit(value);
  const json = JSON.stringify(value);
  for (const sentinel of [PRIVATE, 'PRIVATE_EMPLOYEE_', 'PRIVATE_FOLLOW_EMPLOYEE', '2010-04-09']) {
    assert.ok(!json.includes(sentinel), 'Private value leaked: ' + sentinel);
  }
}

function assertSameRanking(original, projected) {
  for (const key of ['count', 'eligible', 'eligibleCount', 'status', 'through']) {
    assert.equal(projected[key], original[key], 'Ranking ' + key);
  }
  assert.deepEqual(clone(projected.notJoined), clone(original.notJoined));
  for (const list of ['all', 'top', 'bottom', 'missing']) {
    assert.equal(projected[list].length, original[list].length, list + ' length');
    for (let i = 0; i < original[list].length; i++) {
      const source = original[list][i], target = projected[list][i];
      for (const key of ['name', 'group']) assert.equal(target[key], source[key] || '');
      for (const key of ['score', 'rank', 'bottomRank', 'ties']) assert.equal(target[key], source[key] ?? null);
      assert.deepEqual(clone(target.values), {
        view: source.values?.view ?? null, channel: source.values?.channel ?? null
      });
      if (source.parts) assert.deepEqual(clone(target.parts), clone(source.parts));
      assert.deepEqual(clone(target.missing), clone(source.missing || []));
    }
  }
}

test('publishing uses the supplied snapshot, all stores and all three months independent of owner filters', () => {
  const H = setup(), data = fixture(H);
  H.data = H.empty();
  H.data.followItems.push({text: 'Unrelated live owner state'});
  H.ui.store = STORES[1]; H.ui.group = STORES[1] + 'B组';
  H.ui.monthlyBoard = {store: STORES[1], month: '2029-03', endMonth: '2029-04', display: 'groups'};
  const liveData = H.data, liveUI = H.ui, board = H.ui.monthlyBoard;
  const beforeData = JSON.stringify(liveData), beforeUI = JSON.stringify(liveUI), beforeSnapshot = JSON.stringify(data);
  const payload = H.buildSharedActivity(data);
  assert.equal(payload.format, 'huangpu-activity-share-v1');
  assert.deepEqual(clone(payload.view.months), MONTHS);
  assert.deepEqual(clone(payload.view.stores), STORES);
  assert.equal(payload.view.nodes.filter(node => node.level === 'person').length, 16);
  assert.equal(payload.view.nodes.filter(node => node.level === 'group').length, 4);
  assert.equal(payload.view.selectedStore, '');
  assert.equal(payload.view.endMonth, MONTHS.at(-1));
  assert.deepEqual(clone(payload.view.columnOrder), data.monthlyBoard.columnOrder);
  assert.equal(H.data, liveData); assert.equal(H.ui, liveUI); assert.equal(H.ui.monthlyBoard, board);
  assert.equal(JSON.stringify(H.data), beforeData); assert.equal(JSON.stringify(H.ui), beforeUI);
  assert.equal(JSON.stringify(data), beforeSnapshot, 'Publishing cannot alter the submitted snapshot');
});

test('projection retains every numerical cell, current-person count, manager label and ranking', () => {
  const H = setup(), data = fixture(H), expected = localView(H, data);
  const projected = H.buildSharedActivity(data).view;
  assert.equal(projected.nodes.length, expected.nodes.length);
  const originals = new Map(expected.nodes.map(node => [nodeKey(node), node]));
  const ids = new Set(projected.nodes.map(node => node.id));
  for (const node of projected.nodes) {
    const source = originals.get(nodeKey(node));
    assert.ok(source, 'Projected node retains its display identity');
    assert.match(node.id, /^n\d+$/); assert.ok(node.parent === null || ids.has(node.parent));
    assert.deepEqual(clone(node.months), clone(source.months));
    assert.deepEqual(clone(node.managerNames), clone(source.managerNames || []));
    for (const selectedMonth of MONTHS) for (const key of KEYS) {
      const meta = node.cellMeta[selectedMonth][key], before = source.cellMeta[selectedMonth][key];
      for (const field of ['status', 'asterisk', 'observedThrough', 'comparable', 'sourceCovered', 'assumedZero']) {
        assert.equal(meta[field], before[field], node.label + ' ' + selectedMonth + ' ' + key + ' ' + field);
      }
      assert.deepEqual(clone(meta.sourcePeriods), clone(before.sourcePeriods));
    }
  }
  assert.deepEqual(clone(projected.displayCounts), clone(expected.displayCounts));
  for (const store of STORES) for (const selectedMonth of MONTHS) {
    assertSameRanking(expected.rankings[store][selectedMonth], projected.rankings[store][selectedMonth]);
  }
  assert.equal(projected.rankings[STORES[0]]['2031-02'].count, 8);
});

test('employee IDs, join dates, source rows and free-form coverage/HR notes never enter the projection', () => {
  const H = setup(), data = fixture(H);
  const local = localView(H, data);
  assert.ok(JSON.stringify(local).includes(PRIVATE), 'Fixture exercises raw-source note propagation');
  const payload = H.buildSharedActivity(data);
  assertPrivateFieldsAbsent(payload);
  const ownerCell = payload.view.nodes.find(node => node.level === 'person').cellMeta['2031-01'].owner;
  assert.equal(ownerCell.asterisk, true);
  assert.equal(ownerCell.status, 'unconfirmed');
  assert.ok(ownerCell.note.length > 0, 'A safe coverage explanation replaces the private source note');
  assert.deepEqual(clone(ownerCell.sourcePeriods), ['2031-01-01至2031-01-03']);
});

test('receiving a share recursively re-whitelists unknown private fields and unsafe note content', () => {
  const H = setup(), payload = clone(H.buildSharedActivity(fixture(H)));
  payload.backup = {facts: [PRIVATE]}; payload.view.history = [PRIVATE];
  payload.view.notes = [PRIVATE]; payload.view.organizationTotalsNote = PRIVATE;
  const node = payload.view.nodes[0];
  node.personId = 'PRIVATE_EMPLOYEE_INJECTED'; node.joinDate = '2010-04-09'; node.raw = PRIVATE;
  const meta = node.cellMeta['2031-01'].owner;
  meta.note = PRIVATE; meta.sourceEvidence = [{sourceHash: PRIVATE}];
  meta.sourcePeriods.push(PRIVATE);
  const rank = payload.view.rankings[STORES[0]]['2031-02'];
  rank.sourceEvidence = [PRIVATE]; rank.all[0].personId = 'PRIVATE_EMPLOYEE_INJECTED';
  rank.all[0].sourceGroups = [PRIVATE]; rank.all[0].privateMemo = PRIVATE;
  payload.view.columns[0].sourceFile = PRIVATE;
  H.data = H.empty();
  const view = H.useSharedActivity(payload);
  assertPrivateFieldsAbsent(view);
  assertPrivateFieldsAbsent(H.monthlyView());
  assertPrivateFieldsAbsent(H.monthlyRanking({store: STORES[0], month: '2031-02'}));
  assert.ok(view.nodes[0].cellMeta['2031-01'].owner.sourcePeriods.every(value => !value.includes(PRIVATE)));
});

test('viewer store and month filters keep grouping, counts, ranking and image-export values aligned', () => {
  const H = setup(), payload = H.buildSharedActivity(fixture(H));
  H.data = H.empty();
  H.ui.monthlyBoard = {store: STORES[1], month: '2031-01', rankMonth: '2031-01'};
  H.useSharedActivity(payload);
  const view = H.monthlyView({store: STORES[1]});
  assert.ok(view.nodes.every(node => node.level === 'region' || node.store === STORES[1]));
  assert.equal(view.nodes.filter(node => node.level === 'person').length, 8);
  assert.equal(view.nodes.filter(node => node.level === 'group').length, 2);
  assert.deepEqual(clone(view.displayCounts), clone(payload.view.displayCounts));
  assert.deepEqual(clone(view.stores), STORES, 'Dropdown retains the unselected store');
  const detail = H.monthlyExportModel(STORES[1]), groups = H.monthlyGroupExportModel(STORES[1]);
  assert.deepEqual(clone(detail.months), ['2031-01']);
  assert.deepEqual(clone(groups.months), ['2031-01']);
  assert.equal(groups.rows.length, 2);
  assert.ok(groups.rows.every(row => row.level === 'group' && row.store === STORES[1]));
  const sourceGroups = payload.view.nodes.filter(node => node.level === 'group' && node.store === STORES[1]);
  assert.deepEqual(clone(groups.rows.map(row => row.months['2031-01'])), clone(sourceGroups.map(row => row.months['2031-01'])));
  assertSameRanking(payload.view.rankings[STORES[1]]['2031-01'], detail.ranking);
  assertPrivateFieldsAbsent(detail); assertPrivateFieldsAbsent(groups);
});

test('malformed formats, periods, node types and duplicate IDs reject without replacing a valid shared view', () => {
  const H = setup(), payload = H.buildSharedActivity(fixture(H));
  H.useSharedActivity(payload);
  const valid = JSON.stringify(H.monthlyView());
  const cases = [
    value => { value.format = 'unrecognized'; },
    value => { value.view.months = []; },
    value => { value.view.months = ['2031-13']; },
    value => { value.view.nodes[0].level = 'private-record'; },
    value => { value.view.nodes[1].id = value.view.nodes[0].id; },
    value => { value.view.nodes = new Array(5001).fill(value.view.nodes[0]); }
  ];
  for (const invalidate of cases) {
    const invalid = clone(payload); invalidate(invalid);
    assert.throws(() => H.useSharedActivity(invalid));
    assert.equal(JSON.stringify(H.monthlyView()), valid, 'Failed receive retains previous view');
  }
});

test('build restores an absent UI board property and owner state after success and failure', () => {
  const H = setup(), data = fixture(H), originalData = H.data;
  delete H.ui.monthlyBoard;
  const keys = Object.keys(H.ui).sort();
  H.buildSharedActivity(data);
  assert.equal(own(H.ui, 'monthlyBoard'), false, 'Publishing must not create an absent UI property');
  assert.deepEqual(Object.keys(H.ui).sort(), keys);
  assert.equal(H.data, originalData);
  assert.throws(() => H.buildSharedActivity({...data, facts: {invalid: true}}));
  assert.equal(own(H.ui, 'monthlyBoard'), false);
  assert.equal(H.data, originalData);
});

test('zero and null remain distinct in a received view, invalid numerical values cannot become a number', () => {
  const H = setup(), payload = clone(H.buildSharedActivity(fixture(H)));
  const cell = payload.view.nodes[0].months['2031-02'];
  cell.house = 0; cell.owner = null; cell.hmall = '123'; cell.view = Infinity;
  const view = H.useSharedActivity(payload), actual = view.nodes[0].months['2031-02'];
  assert.equal(actual.house, 0); assert.equal(actual.owner, null);
  assert.equal(actual.hmall, null); assert.equal(actual.view, null);
});

test('clear returns the local model functions without changing local personnel or facts', () => {
  const H = setup(), data = fixture(H);
  H.data = data;
  const viewFunction = H.monthlyView, rankFunction = H.monthlyRanking;
  const before = JSON.stringify(data), payload = H.buildSharedActivity(data);
  H.useSharedActivity(payload); H.clearSharedActivity();
  assert.equal(H.monthlyView, viewFunction); assert.equal(H.monthlyRanking, rankFunction);
  assert.equal(JSON.stringify(H.data), before);
  assert.equal(H.monthlyView({store: STORES[0]}).rankings[STORES[0]]['2031-02'].count, 8);
});
