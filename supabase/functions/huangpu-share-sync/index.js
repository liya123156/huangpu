/**
 * Activity-only publication API; state is small publication metadata, not an
 * HR backup. Deploy with verify_jwt=false and JavaScript entry:
 * ./functions/huangpu-share-sync/index.js. This handler authenticates x-hp-token.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY exist only in the server runtime.
 * No request tokens, hashes, payloads or upstream error bodies are logged.
 */

export const ALLOWED_ORIGIN = 'https://liya123156.github.io';
export const SHARE_LIMITS = Object.freeze({
  requestBytes: 12 * 1024 * 1024,
  stateBytes: 16 * 1024,
  stateDecodedBytes: 8 * 1024,
  publishedBytes: 2 * 1024 * 1024,
  publishedDecodedBytes: 2 * 1024 * 1024,
});

const WORKSPACE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[0-9a-f]{64}$/;
const METHODS = ['GET', 'PUT', 'OPTIONS'];
const REQUEST_HEADERS = ['content-type', 'x-hp-token'];
const FORBIDDEN_PUBLICATION_KEYS = new Set(['facts', 'flowFacts', 'followItems', 'novRoster', 'novChannels', 'novAudit', 'personId', 'joinDate', 'sourceEvidence', 'history', 'sourceTrash'].map(key => key.toLowerCase()));
const encoder = new TextEncoder();

class HTTPError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new HTTPError(status, code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value >= 1;
const sameHash = (left, right) => {
  // Inputs are fixed-length digests. Do not early-return on a matching prefix.
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
};
const digest = async (bytes, cryptoImpl) => [...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');

async function readJSON(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > SHARE_LIMITS.requestBytes)) fail(413, 'request_too_large');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) fail(415, 'json_required');
  if (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity') fail(415, 'unsupported_content_encoding');
  if (!request.body) fail(400, 'invalid_request');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SHARE_LIMITS.requestBytes) { await reader.cancel(); fail(413, 'request_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { fail(400, 'invalid_json'); }
}

async function validatePayload(value, maximum, cryptoImpl) {
  if (!object(value) || Object.keys(value).length !== 3 || value.encoding !== 'gzip-base64' || typeof value.data !== 'string' || typeof value.sha256 !== 'string' || !HASH.test(value.sha256)) fail(400, 'invalid_payload');
  // The envelope contains only ASCII once validated below; this is its complete
  // JSON wire size, not just the compressed byte length.
  if (value.data.length > maximum || JSON.stringify(value).length > maximum) fail(413, 'payload_too_large');
  if (!value.data.length || value.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) fail(400, 'invalid_payload');
  let binary;
  try { binary = atob(value.data); } catch { fail(400, 'invalid_payload'); }
  if (btoa(binary) !== value.data || binary.length < 20) fail(400, 'invalid_payload');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Validate the envelope and hash before bounded decompression/schema checks.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8 || (bytes[3] & 0xe0) !== 0) fail(400, 'invalid_payload');
  if (!sameHash(await digest(bytes, cryptoImpl), value.sha256)) fail(400, 'payload_hash_mismatch');
  return {encoding: 'gzip-base64', data: value.data, sha256: value.sha256};
}

async function decodedJSON(payload, maximum) {
  const binary = atob(payload.data), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel().catch(() => {}); fail(413, 'decoded_payload_too_large'); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    fail(400, 'invalid_compressed_json');
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(output)); }
  catch { fail(400, 'invalid_compressed_json'); }
}

const timestamp = value => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
async function validateState(value, cryptoImpl) {
  const payload = await validatePayload(value, SHARE_LIMITS.stateBytes, cryptoImpl);
  const state = await decodedJSON(payload, SHARE_LIMITS.stateDecodedBytes);
  if (!object(state) || Object.keys(state).length !== 3 || state.format !== 'huangpu-publish-state-v1' || typeof state.contentHash !== 'string' || !HASH.test(state.contentHash) || !timestamp(state.sourceUpdatedAt)) fail(400, 'invalid_publication_metadata');
  return payload;
}

async function validatePublished(value, cryptoImpl) {
  const payload = await validatePayload(value, SHARE_LIMITS.publishedBytes, cryptoImpl);
  const publication = await decodedJSON(payload, SHARE_LIMITS.publishedDecodedBytes);
  if (!object(publication) || Object.keys(publication).length !== 3 || publication.format !== 'huangpu-activity-share-v1' || !timestamp(publication.generatedAt) || !object(publication.view)) fail(400, 'invalid_activity_publication');
  // Do not accept a compressed full backup disguised as a view. The application
  // constructs the allowlisted DTO; the service independently rejects HR fields.
  const pending = [publication.view];
  while (pending.length) {
    const current = pending.pop();
    for (const key in current) if (Object.hasOwn(current, key)) {
      if (FORBIDDEN_PUBLICATION_KEYS.has(key.toLowerCase())) fail(400, 'forbidden_publication_field');
      const nested = current[key];
      if (nested !== null && typeof nested === 'object') pending.push(nested);
    }
  }
  return payload;
}

/** Injectable only for local tests; production uses built-in fetch and Deno env. */
export function createHandler({
  fetchImpl = globalThis.fetch,
  env = name => globalThis.Deno?.env?.get(name),
  cryptoImpl = globalThis.crypto,
  now = () => new Date(),
} = {}) {
  return async function handler(request) {
    const origin = request.headers.get('origin');
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
    });
    if (origin === ALLOWED_ORIGIN) headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {status, headers});
    try {
      if (origin && origin !== ALLOWED_ORIGIN) return reply(403, {error: 'origin_not_allowed'});
      if (!METHODS.includes(request.method)) { headers.set('Allow', METHODS.join(', ')); return reply(405, {error: 'method_not_allowed'}); }
      if (request.method === 'OPTIONS') {
        const askedMethod = request.headers.get('access-control-request-method');
        const askedHeaders = (request.headers.get('access-control-request-headers') || '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean);
        if (askedMethod && !METHODS.includes(askedMethod)) return reply(405, {error: 'method_not_allowed'});
        if (askedHeaders.some(name => !REQUEST_HEADERS.includes(name))) return reply(403, {error: 'header_not_allowed'});
        headers.set('Access-Control-Allow-Methods', METHODS.join(', '));
        headers.set('Access-Control-Allow-Headers', REQUEST_HEADERS.join(', '));
        headers.set('Access-Control-Max-Age', '600');
        return reply(204);
      }

      const token = request.headers.get('x-hp-token') || '';
      if (!TOKEN.test(token)) return reply(401, {error: 'unauthorized'});
      const url = new URL(request.url), workspace = url.searchParams.get('workspace') || '';
      if (!WORKSPACE.test(workspace) || url.searchParams.getAll('workspace').length !== 1) return reply(400, {error: 'invalid_workspace'});
      const known = url.searchParams.get('known_revision');
      if (request.method === 'GET' && known !== null && (!/^[1-9]\d*$/.test(known) || !revision(Number(known)) || url.searchParams.getAll('known_revision').length !== 1)) return reply(400, {error: 'invalid_revision'});

      const base = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!base || !serviceKey || !cryptoImpl?.subtle || typeof fetchImpl !== 'function') return reply(503, {error: 'service_unavailable'});
      let restBase;
      try {
        const parsed = new URL(base);
        if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) || parsed.username || parsed.password) throw Error();
        restBase = new URL('/rest/v1/hp_shared_workspaces', parsed);
      } catch { return reply(503, {error: 'service_unavailable'}); }
      const tokenHash = await digest(encoder.encode(token), cryptoImpl);
      const database = async (filters, select, patch) => {
        const endpoint = new URL(restBase);
        endpoint.searchParams.set('select', select);
        endpoint.searchParams.set('id', 'eq.' + workspace);
        for (const [key, value] of Object.entries(filters || {})) endpoint.searchParams.set(key, 'eq.' + value);
        if (!patch) endpoint.searchParams.set('limit', '1');
        const dbHeaders = {apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json'};
        if (patch) { dbHeaders['Content-Type'] = 'application/json'; dbHeaders.Prefer = 'return=representation'; }
        let response;
        try {
          response = await fetchImpl(endpoint.toString(), {
            method: patch ? 'PATCH' : 'GET', headers: dbHeaders,
            ...(patch ? {body: JSON.stringify(patch)} : {}),
            signal: AbortSignal.timeout(12000),
          });
        } catch { fail(502, 'backend_unavailable'); }
        if (!response.ok) fail(502, 'backend_unavailable');
        let rows;
        try { rows = await response.json(); } catch { fail(502, 'backend_unavailable'); }
        if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => !object(row))) fail(502, 'backend_unavailable');
        return rows;
      };
      const [authorization] = await database({}, 'id,reader_hash,editor_hash,revision,updated_at');
      if (!authorization) return reply(401, {error: 'unauthorized'});
      if (!HASH.test(authorization.reader_hash || '') || !HASH.test(authorization.editor_hash || '') || authorization.reader_hash === authorization.editor_hash || !revision(authorization.revision)) fail(502, 'backend_unavailable');
      const isReader = sameHash(tokenHash, authorization.reader_hash), isEditor = sameHash(tokenHash, authorization.editor_hash);
      if (!isReader && !isEditor) return reply(401, {error: 'unauthorized'});
      const role = isEditor ? 'editor' : 'viewer';

      if (request.method === 'GET') {
        if (known !== null && Number(known) === authorization.revision) return reply(304);
        // Role-specific projection is intentional: a viewer query never fetches
        // publication metadata, even on the server. Recheck token rotation.
        const column = isEditor ? 'state_payload' : 'published_payload';
        const [row] = await database({[isEditor ? 'editor_hash' : 'reader_hash']: tokenHash}, 'revision,updated_at,' + column);
        if (!row) return reply(401, {error: 'unauthorized'});
        if (!revision(row.revision) || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) fail(502, 'backend_unavailable');
        let payload;
        try { payload = await (isEditor ? validateState(row[column], cryptoImpl) : validatePublished(row[column], cryptoImpl)); }
        catch { fail(502, 'stored_payload_invalid'); }
        return reply(200, {role, revision: row.revision, updatedAt: row.updated_at, payload});
      }

      if (!isEditor) return reply(403, {error: 'read_only'});
      const body = await readJSON(request);
      if (!object(body) || Object.keys(body).length !== 3 || !Object.hasOwn(body, 'state') || !Object.hasOwn(body, 'published') || !revision(body.expectedRevision) || body.expectedRevision === Number.MAX_SAFE_INTEGER) return reply(400, {error: 'invalid_request'});
      if (body.expectedRevision !== authorization.revision) return reply(409, {error: 'revision_conflict', revision: authorization.revision});
      const state = await validateState(body.state, cryptoImpl);
      const published = await validatePublished(body.published, cryptoImpl);
      const updatedAt = now().toISOString();
      const [saved] = await database({revision: body.expectedRevision, editor_hash: tokenHash}, 'revision,updated_at', {
        state_payload: state, published_payload: published,
        revision: body.expectedRevision + 1, updated_at: updatedAt,
      });
      // One atomic UPDATE includes both payloads and the version precondition.
      // A competing save or rotated editor token can match zero rows.
      if (!saved) return reply(409, {error: 'revision_conflict'});
      if (saved.revision !== body.expectedRevision + 1 || typeof saved.updated_at !== 'string' || !Number.isFinite(Date.parse(saved.updated_at))) fail(502, 'backend_unavailable');
      return reply(200, {revision: saved.revision, updatedAt: saved.updated_at});
    } catch (error) {
      return reply(error instanceof HTTPError ? error.status : 500, {error: error instanceof HTTPError ? error.code : 'internal_error'});
    }
  };
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') Deno.serve(createHandler());
