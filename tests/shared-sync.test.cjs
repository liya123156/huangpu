/* Synthetic-only cloud sharing tests: no credentials or private records leave this process. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../assets/shared-sync.js'), 'utf8');
const EDITOR = 'E'.repeat(43), READER = 'R'.repeat(43);
const ENDPOINT = 'https://synthetic.invalid/functions/v1/share';
const PREFIX = 'huangpu.shared.v1:' + encodeURIComponent(ENDPOINT + '|synthetic');
const COLS = ['house', 'owner', 'hmall', 'channel', 'entered', 'rate', 'view'];
const PRIVATE = 'NEVER_PUBLISH_PRIVATE_HR';
const clone = value => JSON.parse(JSON.stringify(value));
function storage(seed = {}) { const values = new Map(Object.entries(seed)); return {values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)}; }
function data(value = 1) { return {facts: [{value}], novRoster: [{personId: PRIVATE}], followItems: [{note: PRIVATE}], updatedAt: '2031-02-24T00:00:00Z', monthlyBoard: {columnOrder: COLS.slice()}}; }
function dtoFor(value) { return {format: 'huangpu-activity-share-v1', generatedAt: '2031-02-24T00:00:00Z', view: {months: ['2031-02'], columnOrder: COLS.slice(), value}}; }
const response = (value, status = 200) => new Response(status === 304 ? null : JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

function setup(options = {}) {
  const elements = new Map();
  function element(id = '') {
    const item = {id, innerHTML: '', textContent: '', className: '', setAttribute() {}, querySelector() { return null; },
      appendChild(child) { elements.set(child.id, child); }, insertBefore(child) { elements.set(child.id, child); }};
    if (id) elements.set(id, item); return item;
  }
  for (const id of ['main', 'nav', 'sidebar', 'breadcrumb']) element(id);
  const document = {hidden: false, body: element(), getElementById: id => elements.get(id) || null, createElement: () => element()};
  const location = new URL('https://local.invalid/app/' + (options.hash || '#activity'));
  const history = {state: options.historyState || null, replaceState(state, _, url) { this.state = state; location.href = new URL(url, location.href).href; }};
  const localStorage = options.localStorage || storage();
  const sessionStorage = options.sessionStorage || storage();
  const calls = [], timers = new Map(), events = {}, copied = [];
  let timer = 0, initCount = 0, saveCount = 0, remoteView = null, clearCount = 0;
  const H = {data: data(), ui: {page: 'activity', monthlyBoard: {}}, nav: [['activity', '活动量'], ['import', '导入']],
    empty: () => ({facts: [], novRoster: [], followItems: [], monthlyBoard: {columnOrder: COLS.slice()}, updatedAt: ''}),
    esc: value => String(value).replace(/[&<>\"]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;'}[character])),
    async init() { initCount++; this.data = clone(options.data || data()); if (options.initSaves) await this.save(); this.render(); },
    async save() { saveCount++; this.data.updatedAt = '2031-02-24T01:00:00Z'; return options.save ? options.save(saveCount, this) : options.saveResult !== false; },
    render() { elements.get('main').innerHTML = 'LOCAL_OR_SHARED_CONTENT:' + (remoteView ? remoteView.value : this.data.facts[0]?.value); },
    go(page) { this.ui.page = page; this.render(); },
    buildSharedActivity(snapshot) { return dtoFor(snapshot.facts[0]?.value || 0); },
    useSharedActivity(dto) { assert.equal(dto.format, 'huangpu-activity-share-v1'); remoteView = clone(dto.view); return remoteView; },
    clearSharedActivity() { remoteView = null; clearCount++; }, modal() {}, close() {}, toast() {}};
  const context = {HP: H, HP_SHARED_CONFIG: {endpoint: ENDPOINT, workspace: 'synthetic'}, document, location, history,
    localStorage, sessionStorage, navigator: {clipboard: {async writeText(value) { copied.push(value); }}},
    URL, URLSearchParams, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Blob, Response,
    AbortController, crypto: webcrypto, btoa, atob, console,
    setTimeout(fn, delay) { const id = ++timer; timers.set(id, {fn, delay}); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { return {fn, delay, unref() {}}; }, addEventListener(name, handler) { events[name] = handler; },
    async fetch(url, request) { calls.push({url: String(url), ...request}); return options.fetch ? options.fetch(String(url), request, calls) : response({}, 503); }};
  context.window = context; vm.createContext(context); vm.runInContext(source, context, {filename: 'shared-sync.js'});
  return {H, context, elements, calls, timers, events, localStorage, sessionStorage, location, history, copied,
    counts: () => ({init: initCount, save: saveCount, cleared: clearCount}), remote: () => remoteView};
}
async function metadata(H, value) {
  return {format: 'huangpu-publish-state-v1', contentHash: await H.sharedCodec.sha256(new TextEncoder().encode(JSON.stringify(dtoFor(value).view))), sourceUpdatedAt: '2031-02-24T00:00:00Z'};
}
async function editorReply(H, value, revision = 1) {
  return {role: 'editor', revision, updatedAt: '2031-02-24T00:00:00Z', payload: await H.sharedCodec.encode(await metadata(H, value))};
}
async function viewerReply(H, value, revision = 1) {
  return {role: 'viewer', revision, updatedAt: '2031-02-24T00:00:00Z', payload: await H.sharedCodec.encode(dtoFor(value))};
}

test('explicit reader link overrides saved owner; viewer never opens owner DB or saves business state', async () => {
  const local = storage({[PREFIX + ':owner']: JSON.stringify({editor: EDITOR, reader: READER})});
  let reply;
  const env = setup({hash: '#activity?share=' + READER, localStorage: local, fetch: async (_, req) => { assert.equal(req.headers['x-hp-token'], READER); return response(reply); }});
  reply = await viewerReply(env.H, 7); await env.H.init();
  assert.equal(env.H.sharedSyncStatus().role, 'viewer'); assert.equal(env.counts().init, 0);
  assert.equal(env.H.data.facts.length, 0); assert.equal(env.H.data.novRoster.length, 0);
  assert.equal(env.location.hash, '#activity'); assert.equal(env.history.state.hpShared.role, 'viewer');
  env.H.data.monthlyBoard.columnOrder.reverse(); assert.equal(await env.H.save(), true);
  assert.equal(env.counts().save, 0); assert.equal(env.calls.some(call => call.method === 'PUT'), false);
  assert.ok(!env.sessionStorage.getItem(PREFIX + ':preferences').includes(PRIVATE));
  env.H.go('import'); assert.equal(env.H.ui.page, 'activity'); assert.equal(env.H.nav.length, 1);
  assert.match(env.elements.get('shared-sync-panel').innerHTML, /上海时间/);
  assert.match(env.elements.get('shared-sync-panel').innerHTML, /8:00:00|08:00:00/);
});

test('cleaned viewer reload keeps viewer isolation even with owner credential in local storage', async () => {
  const env = setup({localStorage: storage({[PREFIX + ':owner']: JSON.stringify({editor: EDITOR, reader: READER})}),
    sessionStorage: storage({[PREFIX + ':viewer']: JSON.stringify({reader: READER})}),
    historyState: {hpShared: {role: 'viewer', scope: PREFIX}}});
  await env.H.init(); assert.equal(env.counts().init, 0); assert.equal(env.H.sharedSyncStatus().role, 'viewer');
  assert.ok(env.calls.every(call => call.headers['x-hp-token'] === READER));
});

test('viewer network failure shows actual error instead of a fabricated zero board; cached view is visibly stale', async () => {
  const env = setup({hash: '#activity?share=' + READER}); await env.H.init();
  assert.equal(env.H.sharedSyncStatus().hasView, false); assert.match(env.elements.get('main').innerHTML, /共享服务暂时不可用/);
  assert.doesNotMatch(env.elements.get('main').innerHTML, /LOCAL_OR_SHARED_CONTENT/);
  const cache = {reader: READER, revision: 2, updatedAt: '2031-02-24T00:00:00Z', payload: await env.H.sharedCodec.encode(dtoFor(8))};
  env.sessionStorage.setItem(PREFIX + ':cache', JSON.stringify(cache)); await env.H.refreshSharedData();
  assert.equal(env.H.sharedSyncStatus().hasView, true); assert.equal(env.H.sharedSyncStatus().stale, true);
  assert.match(env.H.sharedSyncStatus().message, /上次缓存/); assert.equal(env.remote().value, 8);
});

test('owner initialization does not publish; saves preserve local boolean and send only metadata plus activity DTO', async () => {
  let reply;
  const env = setup({hash: '#activity?edit=' + EDITOR + '&share=' + READER, initSaves: true,
    fetch: async (_, req) => req.method === 'GET' ? response(reply) : response({revision: 2, updatedAt: '2031-02-24T02:00:00Z'})});
  reply = await editorReply(env.H, 1); await env.H.init();
  assert.equal(env.H.sharedSyncStatus().ready, true); assert.equal(env.calls.filter(call => call.method === 'PUT').length, 0);
  env.H.data.facts[0].value = 4; assert.equal(await env.H.save(), true); assert.equal(await env.H.flushSharedChanges(), true);
  const put = env.calls.find(call => call.method === 'PUT'), body = JSON.parse(put.body);
  assert.equal(body.expectedRevision, 1);
  const state = await env.H.sharedCodec.decode(body.state), published = await env.H.sharedCodec.decode(body.published);
  assert.deepEqual(Object.keys(state).sort(), ['contentHash', 'format', 'sourceUpdatedAt']);
  assert.equal(state.format, 'huangpu-publish-state-v1'); assert.equal(published.view.value, 4);
  assert.equal(state.contentHash, (await metadata(env.H, 4)).contentHash);
  assert.ok(!JSON.stringify({state, published}).includes(PRIVATE)); assert.ok(!('facts' in state));
  assert.equal(env.H.data.followItems[0].note, PRIVATE); assert.equal(env.H.sharedSyncStatus().dirty, false);
  assert.equal(await env.H.copySharedLink(), true); const link = env.copied[0];
  assert.ok(link.includes('share=' + READER)); assert.ok(!link.includes(EDITOR)); assert.ok(!link.includes('edit='));
});

test('CAS conflict retains unsynced local changes and never retries with an advanced revision', async () => {
  let reply, gets = 0;
  const env = setup({hash: '#activity?edit=' + EDITOR + '&share=' + READER,
    fetch: async (_, req) => { if (req.method === 'PUT') return response({error: 'revision_conflict'}, 409); gets++; return response(gets === 1 ? reply : await editorReply(env.H, 99, 4)); }});
  reply = await editorReply(env.H, 1); await env.H.init(); env.H.data.facts[0].value = 5;
  assert.equal(await env.H.save(), true); assert.equal(await env.H.flushSharedChanges(), false);
  assert.equal(env.H.data.facts[0].value, 5); assert.equal(env.H.sharedSyncStatus().conflict, true);
  assert.equal(env.H.sharedSyncStatus().dirty, true); assert.equal(await env.H.flushSharedChanges(), false);
  assert.equal(env.calls.filter(call => call.method === 'PUT').length, 1);
});

test('metadata mismatch pauses owner without replacing local records or silently publishing', async () => {
  let reply;
  const env = setup({hash: '#activity?edit=' + EDITOR, fetch: async () => response(reply)});
  reply = await editorReply(env.H, 77, 2); await env.H.init();
  assert.equal(env.H.data.facts[0].value, 1); assert.equal(env.H.data.novRoster[0].personId, PRIVATE);
  assert.equal(env.H.sharedSyncStatus().conflict, true); assert.equal(env.H.sharedSyncStatus().ready, false);
  assert.equal(env.remote(), null); assert.equal(env.calls.some(call => call.method === 'PUT'), false);
});

test('a local edit during an in-flight publication stays dirty and uses the next CAS revision', async () => {
  let reply, release, started;
  const requested = new Promise(resolve => { started = resolve; });
  const env = setup({hash: '#activity?edit=' + EDITOR, fetch: async (_, req, calls) => {
    if (req.method === 'GET') return response(reply);
    if (calls.filter(call => call.method === 'PUT').length === 1) { started(); return new Promise(resolve => { release = () => resolve(response({revision: 2})); }); }
    return response({revision: 3});
  }});
  reply = await editorReply(env.H, 1); await env.H.init(); env.H.data.facts[0].value = 2; await env.H.save();
  const first = env.H.flushSharedChanges(); await requested; env.H.data.facts[0].value = 3; await env.H.save(); release(); await first;
  assert.equal(env.H.sharedSyncStatus().dirty, true); await env.H.flushSharedChanges();
  const puts = env.calls.filter(call => call.method === 'PUT').map(call => JSON.parse(call.body));
  assert.equal(puts[0].expectedRevision, 1); assert.equal(puts[1].expectedRevision, 2);
  assert.equal((await env.H.sharedCodec.decode(puts[0].published)).view.value, 2);
  assert.equal((await env.H.sharedCodec.decode(puts[1].published)).view.value, 3);
});

test('network failure does not turn a successful local save into false; lost acknowledgement recognizes exact content', async () => {
  let reply, lost = false;
  const env = setup({hash: '#activity?edit=' + EDITOR, fetch: async (_, req) => {
    if (req.method === 'PUT') { lost = true; throw new Error('synthetic response lost'); }
    return response(lost ? await editorReply(env.H, 6, 2) : reply);
  }});
  reply = await editorReply(env.H, 1); await env.H.init(); env.H.data.facts[0].value = 6;
  assert.equal(await env.H.save(), true); assert.equal(await env.H.flushSharedChanges(), true);
  assert.equal(env.H.sharedSyncStatus().dirty, false); assert.equal(env.calls.filter(call => call.method === 'PUT').length, 1);
});

test('gzip decoding validates compressed hash and enforces decoded byte limits', async () => {
  const {H} = setup(), payload = await H.sharedCodec.encode({text: '合成数据'.repeat(30)});
  assert.equal((await H.sharedCodec.decode(payload)).text, '合成数据'.repeat(30));
  await assert.rejects(H.sharedCodec.decode({...payload, sha256: '0'.repeat(64)}), /校验失败/);
  await assert.rejects(H.sharedCodec.decode(payload, 20), /大小/);
  await assert.rejects(H.sharedCodec.decode({...payload, data: '!invalid'}), /格式/);
});

test('authless local URL keeps existing data and never attempts a cloud request', async () => {
  const env = setup(); await env.H.init();
  assert.equal(env.counts().init, 1); assert.equal(env.H.sharedSyncStatus().role, 'local'); assert.equal(env.calls.length, 0);
  assert.equal(env.H.data.facts[0].value, 1); assert.match(env.elements.get('main').innerHTML, /LOCAL_OR_SHARED_CONTENT/);
  const empty = setup({data: {facts: [], novRoster: [], monthlyBoard: {columnOrder: COLS}}}); await empty.H.init();
  assert.match(empty.elements.get('main').innerHTML, /打开分享链接后查看数据/); assert.equal(empty.calls.length, 0);
});

test('empty owner can read shared activity, but importing partial local data pauses automatic publication', async () => {
  let editor, viewer;
  const env = setup({hash: '#activity?edit=' + EDITOR + '&share=' + READER,
    data: {facts: [], novRoster: [], monthlyBoard: {columnOrder: COLS}},
    fetch: async (_, req) => response(req.headers['x-hp-token'] === EDITOR ? editor : viewer)});
  editor = await editorReply(env.H, 12); viewer = await viewerReply(env.H, 12); await env.H.init();
  assert.equal(env.remote().value, 12); assert.equal(env.H.data.facts.length, 0);
  env.H.data.monthlyBoard.columnOrder.reverse(); assert.equal(await env.H.save(), true);
  assert.equal(env.H.sharedSyncStatus().dirty, false);
  env.H.data.facts.push({value: 1}); assert.equal(await env.H.save(), true);
  assert.equal(env.H.sharedSyncStatus().ready, false); assert.equal(env.H.sharedSyncStatus().conflict, true);
  assert.equal(env.remote(), null); assert.equal(await env.H.flushSharedChanges(), false);
  assert.equal(env.calls.some(call => call.method === 'PUT'), false);
});

test('empty owner keeps separate metadata and loaded-view revisions so a later shared view actually refreshes', async () => {
  let revision = 1;
  const env = setup({hash: '#activity?edit=' + EDITOR + '&share=' + READER,
    data: {facts: [], novRoster: [], monthlyBoard: {columnOrder: COLS}}, fetch: async (url, req) => {
      const known = new URL(url).searchParams.get('known_revision');
      if (known === String(revision)) return response(null, 304);
      return response(req.headers['x-hp-token'] === EDITOR ? await editorReply(env.H, revision, revision) : await viewerReply(env.H, revision, revision));
    }});
  await env.H.init(); assert.equal(env.remote().value, 1); revision = 2; await env.H.refreshSharedData();
  assert.equal(env.remote().value, 2);
  const lastReader = env.calls.filter(call => call.headers['x-hp-token'] === READER).at(-1);
  assert.equal(new URL(lastReader.url).searchParams.get('known_revision'), '1');
});

test('cloud outage retains successful local save and retries dirty content on focus', async () => {
  let down = false, reply;
  const env = setup({hash: '#activity?edit=' + EDITOR, fetch: async (_, req) => {
    if (down) return response({}, 503);
    return req.method === 'GET' ? response(reply) : response({revision: 2});
  }});
  reply = await editorReply(env.H, 1); await env.H.init(); down = true;
  env.H.data.facts[0].value = 5; assert.equal(await env.H.save(), true); assert.equal(await env.H.flushSharedChanges(), false);
  assert.equal(env.H.sharedSyncStatus().dirty, true); assert.equal(env.H.data.facts[0].value, 5);
  const before = env.calls.filter(call => call.method === 'PUT').length; down = false; env.events.focus();
  while (env.H.sharedSyncStatus().publishing) await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.calls.filter(call => call.method === 'PUT').length, before + 1);
  assert.equal(env.H.sharedSyncStatus().dirty, false);
});

test('empty owner can still open data import when the shared service is unavailable', async () => {
  const env = setup({hash: '#activity?edit=' + EDITOR + '&share=' + READER,
    data: {facts: [], novRoster: [], monthlyBoard: {columnOrder: COLS}}});
  await env.H.init(); assert.match(env.elements.get('main').innerHTML, /共享服务暂时不可用/);
  assert.match(env.elements.get('nav').innerHTML, /导入/); env.H.go('import');
  assert.equal(env.H.ui.page, 'import'); assert.match(env.elements.get('main').innerHTML, /LOCAL_OR_SHARED_CONTENT/);
  assert.equal(env.H.nav.length, 2);
});

test('failed local save cannot publish; a later successful local save releases the cloud gate', async () => {
  let reply, successful = false;
  const env = setup({hash: '#activity?edit=' + EDITOR, save: async () => successful,
    fetch: async (_, req) => req.method === 'GET' ? response(reply) : response({revision: 2})});
  reply = await editorReply(env.H, 1); await env.H.init(); env.H.data.facts[0].value = 8;
  assert.equal(await env.H.save(), false); assert.match(env.H.sharedSyncStatus().message, /本机保存失败/);
  assert.equal(await env.H.flushSharedChanges(), false); env.events.focus();
  assert.equal(env.calls.some(call => call.method === 'PUT'), false);
  successful = true; assert.equal(await env.H.save(), true); assert.equal(await env.H.flushSharedChanges(), true);
  assert.equal(env.calls.filter(call => call.method === 'PUT').length, 1);
});

test('pending local save cannot publish before IndexedDB confirms it', async () => {
  let reply, finishSave;
  const env = setup({hash: '#activity?edit=' + EDITOR, save: () => new Promise(resolve => { finishSave = resolve; }),
    fetch: async (_, req) => req.method === 'GET' ? response(reply) : response({revision: 2})});
  reply = await editorReply(env.H, 1); await env.H.init(); env.H.data.facts[0].value = 8;
  const pending = env.H.save(); assert.equal(await env.H.flushSharedChanges(), false); env.events.focus();
  assert.equal(env.calls.some(call => call.method === 'PUT'), false);
  finishSave(true); assert.equal(await pending, true); assert.equal(await env.H.flushSharedChanges(), true);
});

test('concurrent local saves use the newest outcome, while any still-pending save keeps publication blocked', async () => {
  let reply; const settle = [];
  const env = setup({hash: '#activity?edit=' + EDITOR, save: () => new Promise(resolve => { settle.push(resolve); }),
    fetch: async (_, req) => req.method === 'GET' ? response(reply) : response({revision: 2})});
  reply = await editorReply(env.H, 1); await env.H.init(); env.H.data.facts[0].value = 2; const older = env.H.save();
  env.H.data.facts[0].value = 3; const newer = env.H.save(); settle[1](true); assert.equal(await newer, true);
  assert.equal(await env.H.flushSharedChanges(), false); settle[0](false); assert.equal(await older, false);
  assert.equal(await env.H.flushSharedChanges(), true);
  assert.equal((await env.H.sharedCodec.decode(JSON.parse(env.calls.find(call => call.method === 'PUT').body).published)).view.value, 3);
  env.H.data.facts[0].value = 4; const nextOlder = env.H.save(); env.H.data.facts[0].value = 5; const nextNewer = env.H.save();
  settle[3](false); await nextNewer; settle[2](true); await nextOlder;
  assert.equal(await env.H.flushSharedChanges(), false); assert.match(env.H.sharedSyncStatus().message, /本机保存失败/);
  assert.equal(env.calls.filter(call => call.method === 'PUT').length, 1);
});
