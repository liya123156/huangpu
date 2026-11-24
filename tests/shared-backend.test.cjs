/* Synthetic service tests. Never connect to a live project or use real tokens. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash, webcrypto} = require('node:crypto');
const {gzipSync, gunzipSync} = require('node:zlib');
const backend = import(pathToFileURL(path.join(__dirname, '../supabase/functions/huangpu-share-sync/index.js')).href);
const origin = 'https://liya123156.github.io';
const serviceKey = 'synthetic-server-key-not-a-credential';
const readerToken = Buffer.alloc(32, 17).toString('base64url');
const editorToken = Buffer.alloc(32, 29).toString('base64url');
const unknownToken = Buffer.alloc(32, 53).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const packet = value => { const bytes = gzipSync(Buffer.from(JSON.stringify(value))); return {encoding: 'gzip-base64', data: bytes.toString('base64'), sha256: hash(bytes)}; };
const unpack = value => JSON.parse(gunzipSync(Buffer.from(value.data, 'base64')).toString('utf8'));
const publication = marker => ({format: 'huangpu-activity-share-v1', generatedAt: '2032-01-01T00:00:00.000Z', view: {kind: 'synthetic-activity-view', marker, total: 7}});
const metadata = view => ({format: 'huangpu-publish-state-v1', contentHash: hash(JSON.stringify(view)), sourceUpdatedAt: '2032-01-01T00:00:00.000Z'});
const initialPublished = packet(publication('initial'));
const initialState = packet(metadata(publication('initial').view));
const initialRow = () => ({id: 'synthetic_workspace', reader_hash: hash(readerToken), editor_hash: hash(editorToken), state_payload: initialState, published_payload: initialPublished, revision: 1, updated_at: '2032-01-01T00:00:00.000Z'});
const response = value => new Response(JSON.stringify(value), {status: 200, headers: {'Content-Type': 'application/json'}});

async function fixture(options = {}) {
  const {createHandler} = await backend;
  const db = {row: structuredClone(initialRow()), calls: [], patches: 0, beforeRead: null, beforePatch: null};
  const fetchImpl = async (input, request) => {
    const url = new URL(input), headers = new Headers(request.headers);
    assert.equal(url.origin, 'https://synthetic-project.supabase.co');
    assert.equal(url.pathname, '/rest/v1/hp_shared_workspaces');
    assert.equal(headers.get('apikey'), serviceKey);
    assert.equal(headers.get('authorization'), 'Bearer ' + serviceKey);
    assert.equal(headers.get('x-hp-token'), null, 'the reader/editor capability is never forwarded to the database');
    db.calls.push({url, method: request.method, headers, body: request.body ? JSON.parse(request.body) : null});
    if (request.method === 'PATCH' && db.beforePatch) db.beforePatch(db);
    if (request.method === 'GET' && db.beforeRead) db.beforeRead(db, url);
    const match = db.row && [...url.searchParams].filter(([key]) => !['select', 'limit'].includes(key)).every(([key, value]) => value === 'eq.' + db.row[key]);
    if (!match) return response([]);
    if (request.method === 'PATCH') {
      assert.equal(headers.get('prefer'), 'return=representation');
      assert.equal(url.searchParams.get('id'), 'eq.synthetic_workspace');
      assert(url.searchParams.has('revision'), 'every update has a revision precondition');
      assert.equal(url.searchParams.get('editor_hash'), 'eq.' + hash(editorToken));
      Object.assign(db.row, JSON.parse(request.body)); db.patches++;
    } else assert.equal(request.method, 'GET');
    const fields = url.searchParams.get('select').split(',');
    assert(!fields.includes('*'), 'the service selects only the columns it needs');
    return response([Object.fromEntries(fields.map(field => [field, db.row[field]]))]);
  };
  const env = name => ({SUPABASE_URL: 'https://synthetic-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: serviceKey})[name];
  const handler = createHandler({fetchImpl, env, cryptoImpl: webcrypto, now: () => new Date('2032-01-02T03:04:05.000Z'), ...options});
  return {handler, db};
}

function request(method = 'GET', token = readerToken, body, more = {}) {
  const url = new URL('https://synthetic-project.supabase.co/functions/v1/huangpu-share-sync?workspace=synthetic_workspace');
  for (const [key, value] of Object.entries(more.query || {})) url.searchParams.set(key, String(value));
  const headers = new Headers({Origin: origin, ...(token ? {'x-hp-token': token} : {})});
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(more.headers || {})) value === null ? headers.delete(key) : headers.set(key, value);
  return new Request(url, {method, headers, ...(body !== undefined ? {body: typeof body === 'string' ? body : JSON.stringify(body)} : {})});
}
const update = (expectedRevision = 1, marker = 'new') => { const dto = publication(marker); return {expectedRevision, state: packet(metadata(dto.view)), published: packet(dto)}; };

test('missing and malformed capabilities are rejected before database access; bad tokens and unknown workspaces are indistinguishable', async () => {
  const {handler, db} = await fixture();
  for (const token of [null, 'short', 'x'.repeat(44), 'bad token']) {
    const result = await handler(request('GET', token));
    assert.equal(result.status, 401); assert.deepEqual(await result.json(), {error: 'unauthorized'});
  }
  assert.equal(db.calls.length, 0);
  assert.equal((await handler(request('GET', unknownToken, undefined, {query: {known_revision: 1}}))).status, 401, 'a guessed known revision does not bypass authentication');
  assert.equal((await handler(request('GET', readerToken, undefined, {query: {workspace: 'unknown_workspace'}}))).status, 401);
  const queryToken = await handler(request('GET', null, undefined, {query: {token: readerToken}}));
  assert.equal(queryToken.status, 401, 'credentials are accepted only in x-hp-token');
});

test('viewer reads only the published envelope and never receives or fetches editor state or credential hashes', async () => {
  const {handler, db} = await fixture(), result = await handler(request());
  assert.equal(result.status, 200);
  const text = await result.text(), body = JSON.parse(text);
  assert.deepEqual(Object.keys(body).sort(), ['payload', 'revision', 'role', 'updatedAt']);
  assert.equal(body.role, 'viewer'); assert.equal(body.revision, 1);
  assert.deepEqual(unpack(body.payload), publication('initial'));
  for (const secret of [readerToken, editorToken, hash(readerToken), hash(editorToken), initialState.data, serviceKey]) assert(!text.includes(secret));
  assert(db.calls.every(call => !call.url.searchParams.get('select').includes('state_payload')));
  assert.equal(db.calls[1].url.searchParams.get('select'), 'revision,updated_at,published_payload');
  assert.equal(db.calls[1].url.searchParams.get('reader_hash'), 'eq.' + hash(readerToken));
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin); assert.equal(result.headers.get('Cache-Control'), 'no-store');
});

test('editor GET returns publication metadata only; authenticated unchanged revisions return an empty 304 without fetching a payload', async () => {
  const {handler, db} = await fixture();
  const editor = await handler(request('GET', editorToken));
  const body = await editor.json(); assert.equal(body.role, 'editor'); assert.deepEqual(body.payload, initialState);
  assert(!db.calls[1].url.searchParams.get('select').includes('published_payload'));
  db.calls.length = 0;
  const unchanged = await handler(request('GET', readerToken, undefined, {query: {known_revision: 1}}));
  assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), ''); assert.equal(db.calls.length, 1);
  assert(!db.calls[0].url.searchParams.get('select').includes('payload'));
  const invalid = await handler(request('GET', readerToken, undefined, {query: {known_revision: '1.5'}})); assert.equal(invalid.status, 400);
});

test('reader PUT is forbidden before reading its body or attempting an update', async () => {
  const {handler, db} = await fixture(), before = structuredClone(db.row);
  const result = await handler(request('PUT', readerToken, 'not even valid JSON'));
  assert.equal(result.status, 403); assert.deepEqual(await result.json(), {error: 'read_only'});
  assert.equal(db.patches, 0); assert.deepEqual(db.row, before);
});

test('editor PUT atomically replaces both envelopes with id + revision + editor-hash filters', async () => {
  const {handler, db} = await fixture(), body = update();
  const result = await handler(request('PUT', editorToken, body));
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), {revision: 2, updatedAt: '2032-01-02T03:04:05.000Z'});
  assert.equal(db.patches, 1); assert.deepEqual(db.row.state_payload, body.state); assert.deepEqual(db.row.published_payload, body.published);
  assert.equal(db.row.reader_hash, hash(readerToken)); assert.equal(db.row.editor_hash, hash(editorToken));
  const patch = db.calls.find(call => call.method === 'PATCH');
  assert.deepEqual(Object.keys(patch.body).sort(), ['published_payload', 'revision', 'state_payload', 'updated_at']);
  assert.equal(patch.url.searchParams.get('revision'), 'eq.1');
  assert.equal(patch.url.searchParams.get('select'), 'revision,updated_at', 'update responses cannot expose stored envelopes or token hashes');
});

test('stale and competing writes return 409; only one matching revision commits and both payloads stay paired', async () => {
  const {handler, db} = await fixture();
  db.row.revision = 3;
  const stale = await handler(request('PUT', editorToken, update(1)));
  assert.equal(stale.status, 409); assert.deepEqual(await stale.json(), {error: 'revision_conflict', revision: 3}); assert.equal(db.patches, 0);
  db.row.revision = 1;
  const left = update(1, 'left'), right = update(1, 'right');
  const results = await Promise.all([handler(request('PUT', editorToken, left)), handler(request('PUT', editorToken, right))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]); assert.equal(db.patches, 1); assert.equal(db.row.revision, 2);
  const saved = unpack(db.row.published_payload).view.marker === 'left' ? left : right;
  assert.deepEqual(db.row.state_payload, saved.state); assert.deepEqual(db.row.published_payload, saved.published);
  assert.equal(unpack(db.row.state_payload).contentHash, hash(JSON.stringify(unpack(db.row.published_payload).view)));
});

test('capability rotation between authorization and payload read prevents delivery with the old token', async () => {
  const {handler, db} = await fixture();
  db.beforeRead = (_db, url) => { if (url.searchParams.has('reader_hash')) db.row.reader_hash = hash(unknownToken); };
  const result = await handler(request()); assert.equal(result.status, 401); assert.deepEqual(await result.json(), {error: 'unauthorized'});
});

test('fixed-origin CORS handles preflight without auth and rejects unexpected origins, methods or headers', async () => {
  const {handler, db} = await fixture();
  const preflight = await handler(request('OPTIONS', null, undefined, {headers: {'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'Content-Type, X-HP-Token'}}));
  assert.equal(preflight.status, 204); assert.equal(await preflight.text(), ''); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, PUT, OPTIONS'); assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'content-type, x-hp-token'); assert.equal(preflight.headers.get('Vary'), 'Origin');
  const denied = await handler(request('GET', readerToken, undefined, {headers: {Origin: 'https://untrusted.example'}}));
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await handler(request('OPTIONS', null, undefined, {headers: {'Access-Control-Request-Headers': 'authorization'}}))).status, 403);
  const wrongMethod = await handler(request('DELETE')); assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get('Allow'), 'GET, PUT, OPTIONS');
  assert.equal(db.calls.length, 0);
  assert.equal((await handler(request('GET', readerToken, undefined, {headers: {Origin: null}}))).status, 200, 'authorized server requests need no browser Origin header');
});

test('payload integrity, encoding and strict request types are checked before PATCH', async () => {
  const {handler, db} = await fixture();
  const invalid = [
    {...update(), expectedRevision: '1'}, {...update(), expectedRevision: 0}, {...update(), expectedRevision: 1.5}, {...update(), expectedRevision: Number.MAX_SAFE_INTEGER},
    {...update(), editor_hash: hash(unknownToken)},
    {...update(), state: {...initialState, encoding: 'json'}},
    {...update(), published: {...initialPublished, sha256: '0'.repeat(64)}},
    {...update(), state: {...initialState, data: 'invalid*base64==='}},
    {...update(), state: {...initialState, extra: 'not-an-envelope-field'}},
  ];
  for (const body of invalid) assert.equal((await handler(request('PUT', editorToken, body))).status, 400);
  const plain = Buffer.from('this is plain text, not a gzip container');
  assert.equal((await handler(request('PUT', editorToken, {...update(), state: {encoding: 'gzip-base64', data: plain.toString('base64'), sha256: hash(plain)}}))).status, 400);
  assert.equal((await handler(request('PUT', editorToken, '{broken json'))).status, 400);
  assert.equal((await handler(request('PUT', editorToken, update(), {headers: {'Content-Type': 'text/plain'}}))).status, 415);
  assert.equal(db.patches, 0);
});

test('state, publication and actual streamed request sizes have independent enforced caps', async () => {
  const {handler, db} = await fixture(), {SHARE_LIMITS} = await backend;
  for (const [field, limit] of [['state', SHARE_LIMITS.stateBytes], ['published', SHARE_LIMITS.publishedBytes]]) {
    const body = update(); body[field] = {encoding: 'gzip-base64', data: 'A'.repeat(limit), sha256: '0'.repeat(64)};
    const result = await handler(request('PUT', editorToken, body)); assert.equal(result.status, 413);
  }
  assert.equal((await handler(request('PUT', editorToken, update(), {headers: {'Content-Length': String(SHARE_LIMITS.requestBytes + 1)}}))).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(SHARE_LIMITS.requestBytes)); controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; }});
  const streamed = new Request('https://synthetic-project.supabase.co/functions/v1/huangpu-share-sync?workspace=synthetic_workspace', {method: 'PUT', headers: {Origin: origin, 'x-hp-token': editorToken, 'Content-Type': 'application/json'}, body: stream, duplex: 'half'});
  const result = await handler(streamed); assert.equal(result.status, 413); assert(cancelled); assert.equal(db.patches, 0);
});

test('metadata-only state accepts initialization but rejects full backups and extra fields without changing the row', async () => {
  const {handler, db} = await fixture();
  const backup = {facts: [{id: 'synthetic-fact', value: 1}], novRoster: [{personId: 'synthetic-person'}], followItems: [{text: 'synthetic-private-note'}]};
  for (const state of [backup, {...metadata({}), facts: []}, {...metadata({}), contentHash: 'invalid'}, {...metadata({}), sourceUpdatedAt: 'not a date'}]) {
    const before = structuredClone(db.row), result = await handler(request('PUT', editorToken, {...update(), state: packet(state)}));
    assert.equal(result.status, 400); assert.deepEqual(await result.json(), {error: 'invalid_publication_metadata'}); assert.deepEqual(db.row, before);
  }
  assert.equal(db.patches, 0);
  db.row.state_payload = packet({}); db.row.published_payload = packet({});
  assert.equal((await handler(request('GET', editorToken))).status, 502, 'an old empty placeholder is not valid metadata');
  const initialized = await handler(request('PUT', editorToken, update(1, 'initialized')));
  assert.equal(initialized.status, 200, 'initialization needs no prior GET or valid previous payload'); assert.equal(db.patches, 1);
  assert.deepEqual(Object.keys(unpack(db.row.state_payload)).sort(), ['contentHash', 'format', 'sourceUpdatedAt']);
});

test('published DTO rejects complete backups, additional top-level fields and nested forbidden HR fields', async () => {
  const {handler, db} = await fixture();
  const invalidTop = [{facts: [], novRoster: []}, {...publication('bad'), followItems: []}, {...publication('bad'), generatedAt: 'not a date'}, {...publication('bad'), view: []}];
  for (const dto of invalidTop) {
    const result = await handler(request('PUT', editorToken, {...update(), published: packet(dto)})); assert.equal(result.status, 400); assert.deepEqual(await result.json(), {error: 'invalid_activity_publication'});
  }
  const forbidden = ['facts', 'flowFacts', 'followItems', 'novRoster', 'novChannels', 'novAudit', 'personId', 'joinDate', 'sourceEvidence', 'history', 'sourceTrash'];
  for (const key of forbidden) {
    const dto = publication('nested'); dto.view.sections = [{nested: {[key]: 'synthetic-forbidden-value'}}];
    const result = await handler(request('PUT', editorToken, {...update(), published: packet(dto)}));
    assert.equal(result.status, 400, key); assert.deepEqual(await result.json(), {error: 'forbidden_publication_field'});
  }
  assert.equal(db.patches, 0); assert.deepEqual(db.row, initialRow());
  db.row.published_payload = packet({...publication('old'), view: {facts: []}});
  assert.equal((await handler(request())).status, 502, 'invalid historical publication is not returned to a viewer');
});

test('decoded gzip limits stop highly compressed oversized documents before schema parsing or persistence', async () => {
  const {handler, db} = await fixture(), {SHARE_LIMITS} = await backend;
  assert.equal(SHARE_LIMITS.stateBytes, 16 * 1024); assert.equal(SHARE_LIMITS.stateDecodedBytes, 8 * 1024); assert.equal(SHARE_LIMITS.publishedDecodedBytes, 2 * 1024 * 1024);
  const bigState = packet({...metadata({}), padding: 'x'.repeat(SHARE_LIMITS.stateDecodedBytes)});
  assert(JSON.stringify(bigState).length < SHARE_LIMITS.stateBytes);
  const rejectedState = await handler(request('PUT', editorToken, {...update(), state: bigState})); assert.equal(rejectedState.status, 413); assert.deepEqual(await rejectedState.json(), {error: 'decoded_payload_too_large'});
  const bigDTO = publication('large'); bigDTO.view.text = 'x'.repeat(SHARE_LIMITS.publishedDecodedBytes); const bigPublished = packet(bigDTO);
  assert(JSON.stringify(bigPublished).length < SHARE_LIMITS.publishedBytes);
  const rejectedPublished = await handler(request('PUT', editorToken, {...update(), published: bigPublished})); assert.equal(rejectedPublished.status, 413); assert.deepEqual(await rejectedPublished.json(), {error: 'decoded_payload_too_large'}); assert.equal(db.patches, 0);
});

test('upstream and configuration failures return safe errors with CORS but no tokens, keys or payloads', async () => {
  const {handler} = await fixture({fetchImpl: async () => new Response(JSON.stringify({message: serviceKey, payload: initialState}), {status: 503})});
  const result = await handler(request()); assert.equal(result.status, 502); assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin); assert.deepEqual(await result.json(), {error: 'backend_unavailable'});
  const failed = await fixture({fetchImpl: async () => { throw Error('synthetic sensitive connection detail'); }});assert.equal((await failed.handler(request())).status, 502);
  const missing = await fixture({env: () => undefined});assert.equal((await missing.handler(request())).status, 503); assert.equal(missing.db.calls.length, 0);
  const invalidWorkspace = await fixture(); assert.equal((await invalidWorkspace.handler(request('GET', readerToken, undefined, {query: {workspace: 'synthetic_workspace,or(revision.gt.0)'}}))).status, 400); assert.equal(invalidWorkspace.db.calls.length, 0);
});

test('the declarative schema locks the isolated table to the service role and contains no public policy or plaintext capability', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/schema/huangpu-sharing.sql'), 'utf8');
  assert.match(sql, /alter table public\.hp_shared_workspaces enable row level security/i);
  assert.match(sql, /revoke all privileges on table public\.hp_shared_workspaces from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.hp_shared_workspaces to service_role/i);
  assert.match(sql, /octet_length\(replace\(state_payload::text, ' ', ''\)\) <= 16384/);
  assert(!/create\s+policy|security\s+definer/i.test(sql));
  for (const token of [readerToken, editorToken, serviceKey]) assert(!sql.includes(token));
});
