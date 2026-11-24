/* Shared activity view only. Raw files, personnel records and HR work never leave the browser. */
'use strict';
(() => {
  const H = HP, config = globalThis.HP_SHARED_CONFIG || {};
  const originalInit = H.init, originalSave = H.save, originalRender = H.render, originalGo = H.go;
  const MiB = 1024 * 1024, TOKEN = /^[A-Za-z0-9_-]{43}$/, HASH = /^[a-f0-9]{64}$/;
  const COLS = ['house', 'owner', 'hmall', 'channel', 'entered', 'rate', 'view'];
  const E = H.esc, copy = value => JSON.parse(JSON.stringify(value));
  let endpoint = '', workspace = String(config.workspace || '');
  try { const url = new URL(config.endpoint); if (url.protocol === 'https:' && !url.username && !url.password) endpoint = url.href; } catch (_) {}
  const configured = !!endpoint && /^[A-Za-z0-9_-]{1,100}$/.test(workspace);
  const prefix = 'huangpu.shared.v1:' + encodeURIComponent(endpoint + '|' + workspace);
  const storageRead = (storage, key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; } };
  const storageWrite = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const storageRemove = (storage, key) => { try { storage.removeItem(key); } catch (_) {} };
  const local = globalThis.localStorage, session = globalThis.sessionStorage;
  const S = {role: 'local', phase: 'local', revision: 0, viewRevision: 0, updatedAt: '', ready: false, dirty: false, conflict: false,
    initializing: true, publishing: false, reading: false, version: 0, hasView: false, stale: false, readOnlyOwner: false,
    error: '', message: '', timer: null, poll: null, pendingHash: '', metadata: null, hasColumnPrefs: false,
    localSavePending: 0, localSaveFailed: false, localSaveSequence: 0, localSaveSettled: 0};
  let editorToken = '', readerToken = '';
  const readAccessParameters = url => {
    const query = new URLSearchParams(url.search || '');
    const hash = String(url.hash || '');
    const fragment = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
    const parameters = new URLSearchParams();
    // An explicit legacy fragment is a newly opened entry, and takes precedence
    // over a previous read-only query on the same document.
    for (const key of ['edit', 'share']) {
      const source = fragment.has(key) ? fragment : query;
      if (source.has(key)) parameters.set(key, source.getAll(key).length === 1 ? source.get(key) : '');
    }
    return parameters;
  };
  const parameters = readAccessParameters(globalThis.location || {});
  const explicitEditor = parameters.has('edit'), explicitViewer = parameters.has('share');
  const savedOwner = storageRead(local, prefix + ':owner');
  const savedViewer = storageRead(session, prefix + ':viewer');
  if (explicitEditor) {
    S.role = 'editor'; editorToken = parameters.get('edit') || ''; readerToken = parameters.get('share') || '';
    if (!TOKEN.test(editorToken) || readerToken && !TOKEN.test(readerToken)) S.error = '管理链接不完整，请重新打开正确链接。';
    else {
      if (!readerToken && TOKEN.test(savedOwner?.reader || '')) readerToken = savedOwner.reader;
      storageWrite(local, prefix + ':owner', {editor: editorToken, reader: readerToken});
      storageRemove(session, prefix + ':viewer');
    }
  } else if (explicitViewer) {
    S.role = 'viewer'; readerToken = parameters.get('share') || '';
    if (!TOKEN.test(readerToken)) S.error = '分享链接不完整，请重新打开正确链接。';
    else storageWrite(session, prefix + ':viewer', {reader: readerToken});
  } else if (globalThis.history?.state?.hpShared?.scope === prefix && globalThis.history.state.hpShared.role === 'viewer') {
    S.role = 'viewer'; readerToken = savedViewer?.reader || '';
    if (!TOKEN.test(readerToken)) S.error = '分享会话已结束，请重新打开分享链接。';
  } else if (TOKEN.test(savedOwner?.editor || '')) {
    S.role = 'editor'; editorToken = savedOwner.editor; readerToken = TOKEN.test(savedOwner.reader || '') ? savedOwner.reader : '';
  }
  const sharedURL = token => {
    const url = new URL(location.href);
    // Share only the reader capability. Never copy unknown query parameters or
    // an editor entry; the fragment can be removed by chat apps without harm.
    url.search = ''; url.searchParams.set('share', token); url.hash = 'activity';
    return url;
  };
  const markContext = () => {
    if (S.role === 'local') return;
    try {
      const url = S.role === 'viewer' ? sharedURL(readerToken) : new URL(location.href);
      if (S.role === 'editor') { url.searchParams.delete('edit'); url.searchParams.delete('share'); url.hash = 'activity'; }
      history.replaceState({...history.state, hpShared: {role: S.role, scope: prefix}}, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  };
  if (explicitEditor || explicitViewer) markContext();
  let entryReloading = false;
  globalThis.addEventListener?.('hashchange', () => {
    const hash = String(location.hash || ''), fragment = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
    if (fragment.has('edit') || fragment.has('share')) {
      // A same-document link does not rerun scripts. Reload once so a local
      // workspace or an existing viewer actually consumes the new entry.
      if (!entryReloading) { entryReloading = true; location.reload?.(); }
    } else if (S.role === 'viewer') markContext();
  });
  const hasLocalData = () => Array.isArray(H.data?.facts) && H.data.facts.length > 0;
  const message = (text, phase = S.phase) => { S.message = text; S.phase = phase; mountStatus(); };
  const fail = (text, status = 0) => Object.assign(new Error(text), {status});
  const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value));
  async function limited(stream, limit) {
    const reader = stream.getReader(), chunks = []; let length = 0;
    try {
      while (true) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength;
        if (length > limit) { await reader.cancel(); throw Error('共享数据超过允许大小'); } chunks.push(next.value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  async function encode(value, decodedLimit = 2 * MiB, wireLimit = 2 * MiB) {
    const input = jsonBytes(value); if (input.length > decodedLimit) throw Error('共享看板超过允许大小');
    if (typeof CompressionStream !== 'function') throw Error('当前浏览器不支持共享压缩，请使用新版浏览器');
    const compressed = await limited(new Blob([input]).stream().pipeThrough(new CompressionStream('gzip')), wireLimit);
    let data = ''; for (let i = 0; i < compressed.length; i += 24576) data += btoa(String.fromCharCode(...compressed.subarray(i, i + 24576)));
    const result = {encoding: 'gzip-base64', data, sha256: await sha256(compressed)};
    if (jsonBytes(result).length > wireLimit) throw Error('共享看板超过传输大小限制');
    return result;
  }
  async function decode(payload, decodedLimit = 2 * MiB, wireLimit = 2 * MiB) {
    if (!payload || payload.encoding !== 'gzip-base64' || typeof payload.data !== 'string' || !HASH.test(payload.sha256 || '') ||
        jsonBytes(payload).length > wireLimit || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.data) || payload.data.length % 4 === 1) throw Error('共享数据格式不正确');
    let compressed;
    try { const raw = atob(payload.data); compressed = Uint8Array.from(raw, character => character.charCodeAt(0)); } catch (_) { throw Error('共享数据编码不正确'); }
    if (await sha256(compressed) !== payload.sha256) throw Error('共享数据校验失败，请刷新重试');
    if (typeof DecompressionStream !== 'function') throw Error('当前浏览器不支持读取共享数据，请使用新版浏览器');
    let bytes;
    try { bytes = await limited(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')), decodedLimit); }
    catch (error) { throw Error(error.message.includes('大小') ? error.message : '共享数据无法解压，请刷新重试'); }
    try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); } catch (_) { throw Error('共享数据内容不正确'); }
  }
  H.sharedCodec = {encode, decode, sha256};
  H.sharedSyncStatus = () => ({role: S.role, phase: S.phase, revision: S.revision, ready: S.ready, dirty: S.dirty,
    conflict: S.conflict, hasView: S.hasView, stale: S.stale, publishing: S.publishing, message: S.message});
  const preferences = () => ({explicitColumnPrefs: S.hasColumnPrefs, columnOrder: (H.data.monthlyBoard?.columnOrder || []).filter(key => COLS.includes(key)),
    board: Object.fromEntries(['store', 'month', 'display', 'endMonth', 'rankMonth'].filter(key => typeof H.ui.monthlyBoard?.[key] === 'string').map(key => [key, H.ui.monthlyBoard[key].slice(0, 160)]))});
  const saveViewerPreferences = () => storageWrite(session, prefix + ':preferences', preferences());
  function restoreViewerPreferences() {
    const prefs = storageRead(session, prefix + ':preferences');
    if (!prefs || typeof prefs !== 'object') return;
    if (prefs.explicitColumnPrefs === true && Array.isArray(prefs.columnOrder) && prefs.columnOrder.length === COLS.length && new Set(prefs.columnOrder).size === COLS.length && prefs.columnOrder.every(key => COLS.includes(key))) {
      H.data.monthlyBoard = {...H.data.monthlyBoard, columnOrder: prefs.columnOrder.slice()}; S.hasColumnPrefs = true;
    }
    if (prefs.board && typeof prefs.board === 'object') H.ui.monthlyBoard = Object.fromEntries(['store', 'month', 'display', 'endMonth', 'rankMonth'].filter(key => typeof prefs.board[key] === 'string').map(key => [key, prefs.board[key].slice(0, 160)]));
  }
  async function request(method, body, token, knownRevision) {
    if (!configured) throw Error('此工作台尚未配置共享连接');
    if (!TOKEN.test(token || '')) throw Error('共享链接凭据不完整');
    const url = new URL(endpoint); url.searchParams.set('workspace', workspace);
    if (Number.isSafeInteger(knownRevision) && knownRevision > 0) url.searchParams.set('known_revision', String(knownRevision));
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url.href, {method, headers: {'x-hp-token': token, ...(body ? {'Content-Type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}), signal: controller.signal, cache: 'no-store', credentials: 'omit'});
      if (response.status === 304) return {unchanged: true};
      if (!response.ok) throw fail(response.status === 401 || response.status === 403 ? '链接已失效或权限不匹配，请向维护人获取新链接。' : response.status === 409 ? '共享看板已有其他更新，本机修改已保留。' : '共享服务暂时不可用，请稍后刷新。', response.status);
      let raw;
      try { const bytes = response.body?.getReader ? await limited(response.body, 12 * MiB) : new TextEncoder().encode(await response.text());
        if (bytes.length > 12 * MiB) throw Error(); raw = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw Error('共享服务返回的数据不正确'); }
      if (!Number.isSafeInteger(raw.revision) || raw.revision < 1) throw Error('共享版本信息不正确');
      return raw;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('共享连接超时，请检查网络后刷新。');
      if (error instanceof TypeError) throw Error('暂时无法连接共享服务，请检查网络后刷新。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function metadataFrom(response) {
    if (response.role !== 'editor') throw Error('管理链接权限不匹配');
    const meta = await decode(response.payload, 8 * 1024, 16 * 1024);
    if (meta?.format !== 'huangpu-publish-state-v1' || !HASH.test(meta.contentHash || '') || typeof meta.sourceUpdatedAt !== 'string' || meta.sourceUpdatedAt.length > 64 || !Number.isFinite(Date.parse(meta.sourceUpdatedAt)) || Object.keys(meta).some(key => !['format', 'contentHash', 'sourceUpdatedAt'].includes(key))) throw Error('共享发布信息不正确，请联系维护人');
    return {format: meta.format, contentHash: meta.contentHash, sourceUpdatedAt: meta.sourceUpdatedAt};
  }
  async function localPublication() {
    const snapshot = copy(H.data);
    const dto = H.buildSharedActivity(snapshot);
    const contentHash = await sha256(jsonBytes(dto.view));
    const sourceUpdatedAt = typeof snapshot.updatedAt === 'string' && snapshot.updatedAt.length <= 64 && Number.isFinite(Date.parse(snapshot.updatedAt)) ? snapshot.updatedAt : new Date().toISOString();
    return {dto, state: {format: 'huangpu-publish-state-v1', contentHash, sourceUpdatedAt}};
  }
  function applyViewer(dto, response) {
    const safe = H.useSharedActivity(dto);
    if (!S.hasColumnPrefs && Array.isArray(safe.columnOrder)) H.data.monthlyBoard = {...H.data.monthlyBoard, columnOrder: safe.columnOrder.slice()};
    S.hasView = true; S.stale = false; S.viewRevision = response.revision;
    if (S.role === 'viewer') S.revision = response.revision;
    S.updatedAt = response.updatedAt || '';
    H.monthlyActiveView = null; H.currentModel = null;
  }
  async function refreshViewer(useCache = true, asOwner = false) {
    if (S.reading) return false; S.reading = true;
    try {
      const response = await request('GET', null, readerToken, S.hasView ? S.viewRevision : undefined);
      if (!response.unchanged) {
        if (response.role !== 'viewer') throw Error('分享链接权限不匹配');
        const dto = await decode(response.payload); applyViewer(dto, response);
        storageWrite(session, prefix + ':cache', {reader: readerToken, revision: response.revision, updatedAt: response.updatedAt || '', payload: response.payload});
      }
      S.stale = false; message(asOwner ? '本机尚无底表，显示共享看板；导入底表后可更新。' : '已读取最新共享看板', 'synced');
      H.render(); return true;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        S.hasView = false; H.clearSharedActivity?.(); storageRemove(session, prefix + ':cache');
      } else if (!S.hasView && useCache) {
        const cache = storageRead(session, prefix + ':cache');
        if (cache?.reader === readerToken && Number.isSafeInteger(cache.revision) && cache.revision > 0) {
          try { applyViewer(await decode(cache.payload), cache); } catch (_) { storageRemove(session, prefix + ':cache'); }
        }
      }
      S.stale = S.hasView; S.error = error.message;
      message(S.hasView ? '当前显示上次缓存；' + error.message : error.message, 'error'); H.render(); return false;
    } finally { S.reading = false; }
  }
  function schedulePublish() {
    clearTimeout(S.timer);
    if (S.role !== 'editor' || !S.ready || S.conflict || !S.dirty || S.initializing || S.localSavePending || S.localSaveFailed) return;
    S.timer = setTimeout(() => { S.timer = null; H.flushSharedChanges(); }, 700);
  }
  async function reconcileOwner(initial = false) {
    if (S.reading || S.publishing) return false; S.reading = true;
    const version = S.version;
    try {
      const response = await request('GET', null, editorToken, !initial && !S.dirty && !S.conflict ? S.revision : undefined);
      if (response.unchanged) { message(S.dirty ? '本机已保存，等待同步…' : '活动量看板已同步', S.dirty ? 'pending' : 'synced'); return true; }
      const metadata = await metadataFrom(response);
      S.revision = response.revision; S.updatedAt = response.updatedAt || ''; S.metadata = metadata;
      if (!hasLocalData()) {
        S.ready = true; S.readOnlyOwner = true; S.conflict = false;
        message('本机尚无底表，可读取共享看板；导入底表后可更新。', 'synced');
      } else {
        const local = await localPublication();
        if (S.version !== version) { S.conflict = true; S.ready = false; message('本机已有新修改，已暂停自动同步；请核对后发布。', 'conflict'); return false; }
        if (local.state.contentHash === metadata.contentHash) {
          S.ready = true; S.dirty = false; S.conflict = false; message('活动量看板已同步', 'synced');
        } else { S.ready = false; S.conflict = true; message('本机与共享看板不同，已保留本机数据；核对后可发布。', 'conflict'); }
      }
      H.render(); return true;
    } catch (error) { S.error = error.message; message(error.message + ' 本机数据保持不变。', 'error'); H.render(); return false; }
    finally {
      S.reading = false;
      if (S.readOnlyOwner && TOKEN.test(readerToken)) await refreshViewer(true, true);
      else if (S.dirty && S.ready && !S.conflict) schedulePublish();
    }
  }
  H.flushSharedChanges = async () => {
    clearTimeout(S.timer); S.timer = null;
    if (S.role !== 'editor' || !S.ready || S.conflict || !S.dirty || S.publishing || S.reading || S.initializing || S.localSavePending || S.localSaveFailed || !hasLocalData()) return false;
    S.publishing = true; const version = S.version, expectedRevision = S.revision;
    let publication;
    try {
      message('正在同步活动量看板…', 'saving');
      publication = await localPublication();
      const [state, published] = await Promise.all([encode(publication.state, 8 * 1024, 16 * 1024), encode(publication.dto)]);
      S.pendingHash = publication.state.contentHash;
      const response = await request('PUT', {expectedRevision, state, published}, editorToken);
      S.revision = response.revision; S.updatedAt = response.updatedAt || ''; S.metadata = publication.state;
      S.dirty = S.version !== version; S.pendingHash = '';
      message(S.dirty ? '新修改等待同步…' : '活动量看板已同步', S.dirty ? 'pending' : 'synced'); return true;
    } catch (error) {
      // A response can be lost after a successful CAS write. Read only the small
      // publication metadata to recognize that exact content; never resend over a newer version.
      if (publication) {
        try {
          const response = await request('GET', null, editorToken), meta = await metadataFrom(response);
          if (meta.contentHash === publication.state.contentHash) {
            S.revision = response.revision; S.updatedAt = response.updatedAt || ''; S.metadata = meta;
            S.dirty = S.version !== version; S.pendingHash = ''; message(S.dirty ? '新修改等待同步…' : '活动量看板已同步', S.dirty ? 'pending' : 'synced'); return true;
          }
          if (response.revision !== expectedRevision || error.status === 409) {
            S.conflict = true; S.ready = false; S.revision = response.revision; S.metadata = meta;
          }
        } catch (_) { if (error.status === 409) { S.conflict = true; S.ready = false; } }
      }
      S.error = error.message; message(S.conflict ? '共享看板已有更新，本机修改已保留；请核对后再发布。' : '本机已保存，尚未同步：' + error.message, S.conflict ? 'conflict' : 'error'); return false;
    } finally { S.publishing = false; mountStatus(); if (S.dirty && S.ready && !S.conflict && S.phase !== 'error') schedulePublish(); }
  };
  H.sharedReviewPublish = () => {
    if (S.role !== 'editor' || !hasLocalData() || !S.revision) return;
    H.modal('更新共享看板', '<p>将用本机当前活动量看板更新共享页面。</p><p>仅同步看板上的活动量、人员展示和排名；底表、完整名册和HR工作记录仍保存在本机。</p>',
      '<button class="btn" onclick="HP.close()">取消</button><button class="btn primary" onclick="HP.confirmSharedPublish()">更新共享看板</button>');
  };
  H.confirmSharedPublish = async () => { if (S.role !== 'editor' || !S.revision || !hasLocalData()) return false; H.close(); S.ready = true; S.conflict = false; S.dirty = true; return H.flushSharedChanges(); };
  H.refreshSharedData = async () => {
    if (S.role === 'viewer') return refreshViewer();
    if (S.role === 'editor') {
      if (S.dirty && S.ready && !S.conflict) return H.flushSharedChanges();
      return reconcileOwner(true);
    }
    message('当前显示本机数据；使用管理链接连接共享后，可生成分享链接。', 'local'); return false;
  };
  H.copySharedLink = async () => {
    if (!['editor', 'viewer'].includes(S.role) || !TOKEN.test(readerToken)) { H.toast('请先打开完整分享链接或管理入口'); return false; }
    if (S.role === 'editor' && (S.dirty && !await H.flushSharedChanges() || S.conflict || !S.ready)) { H.toast('看板尚未同步，请先核对共享状态'); return false; }
    if (S.role === 'viewer' && !S.hasView) { H.toast('请先成功读取共享看板，再复制分享链接'); return false; }
    const url = sharedURL(readerToken); let copied = false;
    try { await navigator.clipboard.writeText(url.href); copied = true; } catch (_) {}
    H.modal('分享活动量看板', '<p>' + (copied ? '分享链接已复制，也可以复制下方完整链接。' : '请复制下方完整链接。') + '别人打开即可查看同一份看板。</p><textarea readonly rows="3" aria-label="分享链接">' + E(url.href) + '</textarea><p><a href="' + E(url.href) + '" target="_blank" rel="noopener noreferrer">打开只读分享页面</a></p>');
    return true;
  };
  H.openSharedLink = () => H.modal('连接共享看板', '<p>粘贴维护人发来的完整分享链接，或只读访问码。无需重新导入底表。</p><textarea id="shared-link-input" rows="3" aria-label="分享链接或访问码" placeholder="粘贴完整分享链接或访问码"></textarea><p id="shared-link-error" role="alert"></p>', '<button class="btn" onclick="HP.close()">取消</button><button class="btn primary" onclick="HP.connectSharedLink()">打开共享看板</button>');
  H.connectSharedLink = value => {
    const input = String(value === undefined ? document.getElementById('shared-link-input')?.value || '' : value).trim();
    let token = input;
    try {
      if (!TOKEN.test(input)) {
        const url = new URL(input), current = new URL(location.href);
        const path = pathname => pathname.replace(/\/index\.html$/, '/');
        if (url.origin !== current.origin || path(url.pathname) !== path(current.pathname)) throw Error();
        token = readAccessParameters(url).get('share') || '';
      }
      if (!TOKEN.test(token)) throw Error();
      const url = sharedURL(token);
      // Explicit viewer entry must override any saved owner, including when
      // reopening the same URL; reload avoids a same-document hash no-op.
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      location.reload?.(); return true;
    } catch (_) {
      const error = document.getElementById('shared-link-error');
      if (error) error.textContent = '未识别到有效的黄浦看板分享链接。请复制完整链接，或粘贴只读访问码。';
      H.toast('分享链接不完整，请重新复制维护人提供的链接'); return false;
    }
  };
  H.save = async () => {
    if (S.role === 'viewer') { S.hasColumnPrefs = true; return saveViewerPreferences(); }
    if (S.readOnlyOwner && !hasLocalData()) S.hasColumnPrefs = true;
    const tracked = S.role === 'editor' && !S.initializing;
    const sequence = tracked ? ++S.localSaveSequence : 0;
    if (tracked) S.localSavePending++;
    const mark = tracked && hasLocalData();
    if (mark) { S.version++; S.dirty = true; }
    let ok = false, thrown;
    try { ok = await originalSave.call(H); }
    catch (error) { thrown = error; }
    finally {
      if (tracked) {
        S.localSavePending--;
        if (sequence >= S.localSaveSettled) { S.localSaveSettled = sequence; S.localSaveFailed = !ok; }
      }
    }
    if (tracked && S.localSaveFailed) {
      clearTimeout(S.timer); S.timer = null;
      message('本机保存失败，共享已暂停；请先导出备份，再重试保存。', 'local-error');
    }
    if (mark && ok && !S.localSaveFailed) {
      if (S.readOnlyOwner && hasLocalData()) {
        S.readOnlyOwner = false; S.ready = false; S.conflict = true;
        H.clearSharedActivity?.(); H.monthlyActiveView = null;
      }
      message(S.conflict ? '本机已保存；请核对后更新共享看板。' : '本机已保存，等待同步…', S.conflict ? 'conflict' : 'pending');
    }
    if (tracked && !S.localSavePending && !S.localSaveFailed) schedulePublish();
    if (thrown) throw thrown;
    return ok;
  };
  H.go = page => {
    if (S.role === 'viewer') { H.ui.page = 'activity'; markContext(); H.render(); globalThis.scrollTo?.(0, 0); return; }
    return originalGo.call(H, page);
  };
  function mountStatus() {
    document.body?.setAttribute?.('data-shared-role', S.role);
    let panel = document.getElementById('shared-sync-panel');
    if (!panel) {
      const sidebar = document.getElementById('sidebar'); if (!sidebar) return;
      panel = document.createElement('section'); panel.id = 'shared-sync-panel'; panel.className = 'shared-sync-panel';
      const old = sidebar.querySelector?.('.side-bottom'); if (old) sidebar.insertBefore(panel, old); else sidebar.appendChild(panel);
    }
    const title = S.role === 'viewer' ? '共享看板' : S.role === 'editor' ? '活动量看板共享' : '本机工作台';
    const text = S.error && !S.message ? S.error : S.message || (S.role === 'local' ? '当前数据保存在本机；打开分享链接可查看共享看板。' : '正在连接共享看板…');
    const updated = S.updatedAt && Number.isFinite(Date.parse(S.updatedAt)) ? new Date(S.updatedAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false}) : '';
    panel.innerHTML = '<b>' + title + '</b><p role="status" aria-live="polite" class="shared-sync-status ' + (S.phase === 'error' || S.conflict ? 'is-warning' : '') + '">' + E(text) + '</p>' +
      (updated ? '<small>共享更新：' + E(updated) + '（上海时间）</small>' : '') +
      (S.role === 'editor' ? '<small>仅同步活动量看板，底表和HR记录保存在本机。</small>' : '') +
      '<div class="shared-sync-actions">' + (S.role !== 'local' && TOKEN.test(readerToken) ? '<button type="button" onclick="HP.copySharedLink()">复制分享链接</button>' : '') +
      (S.role === 'local' ? '<button type="button" onclick="HP.openSharedLink()">粘贴分享链接</button>' : '') +
      (S.role !== 'local' ? '<button type="button" onclick="HP.refreshSharedData()">刷新数据</button>' : '') +
      (S.role === 'editor' && S.conflict && S.revision && hasLocalData() ? '<button type="button" onclick="HP.sharedReviewPublish()">核对并发布</button>' : '') + '</div>';
  }
  H.render = () => {
    if (S.role === 'viewer') { H.ui.page = 'activity'; H.nav = [['activity', '活动量看板']]; }
    if ((S.role === 'viewer' || S.role === 'editor' && !hasLocalData() && H.ui.page === 'activity') && !S.hasView) {
      const main = document.getElementById('main'); if (main) main.innerHTML = '<section class="panel shared-sync-empty"><h1>共享活动量看板</h1><p>' + E(S.message || S.error || '正在读取共享数据…') + '</p>' + (S.phase === 'error' ? '<button class="btn" onclick="HP.refreshSharedData()">重新读取</button> <button class="btn" onclick="HP.openSharedLink()">粘贴分享链接</button>' : '') + '</section>';
      const nav = document.getElementById('nav'); if (nav) nav.innerHTML = S.role === 'viewer' ? '<button class="active" onclick="HP.go(\'activity\')">活动量看板</button>' : H.nav.map(([page, label]) => '<button onclick="HP.go(\'' + E(page) + '\')">' + E(label) + '</button>').join('');
      const crumb = document.getElementById('breadcrumb'); if (crumb) crumb.textContent = '黄浦大区 / 共享活动量看板';
    } else {
      originalRender.call(H);
      if (S.role === 'local' && H.ui.page === 'activity' && !hasLocalData()) {
        const main = document.getElementById('main'); if (main) main.innerHTML = '<section class="panel shared-sync-empty"><h1>连接共享看板后查看数据</h1><p>当前地址缺少分享信息。粘贴维护人提供的完整分享链接即可查看，无需重新导入底表。</p><button class="btn primary" onclick="HP.openSharedLink()">粘贴分享链接</button></section>';
      }
    }
    mountStatus();
    if (S.role === 'viewer') { markContext(); if (S.hasView) saveViewerPreferences(); }
  };
  function startPolling() {
    if (S.role === 'local') return;
    const tick = () => { if (document.hidden || S.initializing || S.reading || S.publishing) return;
      if (S.role === 'viewer') refreshViewer();
      else if (S.dirty && S.ready && !S.conflict) H.flushSharedChanges();
      else if (!S.dirty && !S.conflict) reconcileOwner(); };
    S.poll = setInterval(tick, 45000); S.poll?.unref?.();
    globalThis.addEventListener?.('focus', tick);
  }
  H.init = async () => {
    if (S.role === 'viewer') {
      H.data = H.empty(); H.ui.page = 'activity'; H.nav = [['activity', '活动量看板']]; restoreViewerPreferences();
      S.initializing = false;
      if (S.error || !configured) { message(S.error || '此工作台尚未配置共享连接', 'error'); H.render(); return; }
      message('正在读取共享数据…', 'loading'); H.render(); await refreshViewer(); startPolling(); return;
    }
    await originalInit.call(H); S.initializing = false;
    if (S.role === 'local') { message('当前显示本机数据；使用管理链接连接后，可生成分享链接。', 'local'); H.render(); return; }
    if (S.error || !configured) { message(S.error || '此工作台尚未配置共享连接', 'error'); H.render(); return; }
    message('正在核对共享版本，本机数据保持不变…', 'loading'); await reconcileOwner(true); startPolling();
  };
})();
