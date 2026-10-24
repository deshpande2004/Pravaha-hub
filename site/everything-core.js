/*!
 * everything-core.js — the Pravahahub app engine (window.ehub). EHUB_ONLINE_ENGINE
 *
 * Load it with a plain (non-module, non-deferred) <script> before any app code:
 *   <script src="../../everything-core.js"></script>
 *
 * Your data lives in this browser:
 *   - ehub.kv   -> localStorage, namespaced per app ("everything:kv:<app>:<key>"), spilling to IndexedDB.
 *   - ehub.fs   -> IndexedDB "everything-drive", one drive shared by every app, rooted at /me.
 * Online features use this site's own server (same origin, /api/*):
 *   - ehub.ai      -> /api/ai (Cloudflare Workers AI), or your own OpenAI-compatible key from hub settings.
 *   - ehub.workers -> app team servers at https://<name>.ehub.work, routed to /api/w/<app>/<name>.
 *   - ehub.peer    -> WebRTC; signalling over /api/peer/<code> (falls back to same-browser tabs).
 *   - ehub.email   -> /api/email/send when the server has a mail key; otherwise a local Outbox.
 *   - ehub.net.fetch -> /api/fetch proxy for cross-origin requests.
 * Unknown members never throw: the object is wrapped in Proxies that hand back no-ops.
 */
(function () {
  'use strict';
  if (window.ehub && window.ehub.__everything) return;

  /* ------------------------------------------------------------------ basics */
  var LS = window.__ehubLS || (function () {
    // Storage can be missing or blocked (site data blocked, some in-app browsers / WebViews). Never let that stop the engine:
    // fall back to an in-memory store for this page and tell the user their changes will not be kept.
    try { var s0 = window.localStorage; if (s0) { s0.getItem('everything:user'); return s0; } } catch (e) {}
    var m = Object.create(null), keys = function () { return Object.keys(m); };
    var mem = { getItem: function (k) { k = String(k); return k in m ? m[k] : null; }, setItem: function (k, v) { m[String(k)] = String(v); }, removeItem: function (k) { delete m[String(k)]; },
      clear: function () { keys().forEach(function (k) { delete m[k]; }); }, key: function (i) { return keys()[i] == null ? null : keys()[i]; } };
    Object.defineProperty(mem, 'length', { get: function () { return keys().length; } });
    window.__ehubStorageVolatile = true;
    setTimeout(function () { try { console.warn('[everything-core] this browser blocks site storage; changes will not be kept after closing this page'); window.parent.postMessage({ everything: 1, type: 'toast', app: '', message: 'This browser is blocking site storage, so changes won\u2019t be kept after you close this page. Allow site data (cookies) for this site, or open it in Chrome/Safari.' }, location.origin); } catch (e) {} }, 0);
    return mem;
  })();
  window.__ehubLS = LS;
  (function migrateLegacyKeys() {
    try {
      if (LS.getItem('everything:migrated-v2')) return;
      var low = String.fromCharCode(112,117,116,101,114), cap = low.charAt(0).toUpperCase() + low.slice(1);
      var rl = new RegExp(low, 'g'), rc = new RegExp(cap, 'g'), keys = [];
      for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && (k.indexOf(low) >= 0 || k.indexOf(cap) >= 0)) keys.push(k); }
      keys.forEach(function (k) { var n = k.replace(rl, 'ehub').replace(rc, 'Ehub'); if (LS.getItem(n) == null) LS.setItem(n, LS.getItem(k)); });
      LS.setItem('everything:migrated-v2', String(Date.now()));
    } catch (e) {}
  })();
  var USERNAME = 'me';
  var HOME = '/' + USERNAME;
  var APP = (function () {
    if (window.EVERYTHING_APP_ID) return String(window.EVERYTHING_APP_ID);
    var m = /\/apps\/([^/]+)\//.exec(location.pathname);
    if (m) return decodeURIComponent(m[1]);
    try { var q = new URLSearchParams(location.search).get('everything-app'); if (q) return q; } catch (e) {}
    return 'default';
  })();
  var IN_FRAME = window.parent && window.parent !== window;
  var delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); };
  var nowSec = function () { return Math.floor(Date.now() / 1000); };
  var rid = function (n) {
    var a = new Uint8Array(n || 8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };
  var uuid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    var h = rid(16); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
  };
  var err = function (code, message, extra) {
    var e = new Error(message || code); e.code = code; e.error = { code: code, message: message || code };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  };
  function post(type, data) {
    if (!IN_FRAME) return;
    try { window.parent.postMessage(Object.assign({ everything: 1, type: type, app: APP }, data || {}), location.origin); } catch (e) {}
  }
  function jsonClone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /* ----------------------------------------------------- the local user */
  var USER = (function () {
    var u = null;
    try { u = JSON.parse(LS.getItem('everything:user') || 'null'); } catch (e) {}
    if (!u || !u.uuid) u = { uuid: uuid(), created: Date.now() };
    // The identity secret is created together with the uuid (synchronously), so app frames that start at the same time
    // all claim the uuid with the same secret; otherwise the loser of that race is locked out of its own identity.
    if (!u.secret) { u.secret = rid(24); try { LS.setItem('everything:user', JSON.stringify(u)); } catch (e) {} }
    return {
      username: USERNAME, uuid: u.uuid, email: USERNAME + '@everything.local', email_confirmed: true,
      requires_email_confirmation: false, is_temp: false, desktop_bg_url: null, desktop_bg_color: null,
      referral_code: null, feature_flags: {}, taskbar_items: [], is_verified: true,
      actual_free_storage: 1073741824 * 10, display_name: u.displayName || 'You',
    };
  })();
  var b64url = function (s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var SESSION_SIG = (function () { try { var u = JSON.parse(LS.getItem('everything:user') || 'null'); return u && u.sig && u.uuid === USER.uuid ? String(u.sig) : ''; } catch (e) { return ''; } })();
  function mkToken() { var o = { t: 'au', v: '2', uu: USER.uuid, n: USER.display_name, app_uid: 'app-' + APP, local: true }; if (SESSION_SIG) o.s = SESSION_SIG; return 'local.' + b64url(JSON.stringify(o)) + '.everything'; }
  var AUTH_TOKEN = mkToken(), LEGACY_TOKEN = AUTH_TOKEN;
  var ORIGIN = location.origin, ONLINE = /^https?:$/.test(location.protocol);
  function accessToken(path, ttlSec) { var o = { t: 't', v: '2', uu: USER.uuid, n: USER.display_name, exp: nowSec() + (ttlSec || 86400), path: path || '' }; if (SESSION_SIG) o.s = SESSION_SIG; return 'ev.' + b64url(JSON.stringify(o)) + '.hub'; }
  var IDENTITY_FILE = /(^|\/)[a-z-]*identity\/[^\/]+\.json$/i;

  /* ------------------------------------------- network routing (same-origin only) */
  var WORKER_HOST = /^([a-z0-9][a-z0-9-]*)\.ehub\.work$/i;
  var TRACKER_HOST = /(^|\.)(plausible\.io|google-analytics\.com|googletagmanager\.com|analytics\.google\.com|segment\.io|mixpanel\.com|hotjar\.com|posthog\.com|sentry\.io)$/i;
  function parseURL(u) { try { return new URL(String(u && u.url ? u.url : u), location.href); } catch (e) { return null; } }
  function workerTarget(u) {
    var url = parseURL(u); if (!url) return null;
    var m = WORKER_HOST.exec(url.hostname); if (!m) return null;
    return ORIGIN + '/api/w/' + encodeURIComponent(APP) + '/' + m[1].toLowerCase() + (url.pathname === '/' ? '' : url.pathname) + url.search;
  }
  function isBlockedURL(u) {
    var url = parseURL(u); if (!url) return false;
    return /\.invalid$/i.test(url.hostname) || TRACKER_HOST.test(url.hostname);
  }
  var SITE_HOST = /^([a-z0-9][a-z0-9-]*)\.ehub\.site$/i;
  function siteTarget(u) {
    var url = parseURL(u); if (!url) return null;
    var m = SITE_HOST.exec(url.hostname); if (!m) return null;
    return ORIGIN + '/s/' + m[1].toLowerCase() + (url.pathname || '/') + url.search + url.hash;
  }
  function siteText(t) { return String(t).replace(/https?:\/\/([a-z0-9][a-z0-9-]*)\.ehub\.site(?=[\/\s"'<)]|$)/gi, function (_, n) { return ORIGIN + '/s/' + n.toLowerCase(); }); }
  function mapURL(u) { var w = workerTarget(u) || siteTarget(u); return w || u; }
  var sessionReady = null, sessionRefused = false;
  function authReady() {
    if (!ONLINE || SESSION_SIG || sessionRefused) return Promise.resolve();
    if (sessionReady) return sessionReady;
    sessionReady = (async function () {
      var run = async function () {
        var u = {}; try { u = JSON.parse(LS.getItem('everything:user') || '{}') || {}; } catch (e) {}
        if (u.sig && u.uuid === USER.uuid) { SESSION_SIG = String(u.sig); return; }
        if (!u.secret) u.secret = rid(24);
        if (!u.uuid) u.uuid = USER.uuid;
        try { LS.setItem('everything:user', JSON.stringify(u)); } catch (e) {}
        var r = await nativeFetch(ORIGIN + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ehub-auth': LEGACY_TOKEN }, body: JSON.stringify({ secret: u.secret }) });
        var j = await r.json().catch(function () { return {}; });
        if (r.ok && j.sig) { SESSION_SIG = String(j.sig); u.sig = SESSION_SIG; try { LS.setItem('everything:user', JSON.stringify(u)); } catch (e) {} }
        else if (r.status === 429) { sessionRefused = true; setTimeout(function () { sessionRefused = false; }, 10 * 60 * 1000); }
        else if (r.status === 409 || r.status === 400) { sessionRefused = true; console.warn('[everything-core] could not claim this browser identity:', j.message || r.status); }
      };
      try { if (navigator.locks && navigator.locks.request) await navigator.locks.request('everything-session', run); else await run(); } catch (e) {}
      if (SESSION_SIG) { AUTH_TOKEN = mkToken(); try { ehubObj.authToken = AUTH_TOKEN; } catch (e) {} }
      sessionReady = null;
    })();
    return sessionReady;
  }
  // Same-origin /api calls: wait for the signed identity, then swap any stale token in the headers for the current one.
  async function apiFetch(url, init) {
    await authReady();
    init = Object.assign({}, init || {});
    if (init.headers) {
      var hh = new Headers(init.headers);
      ['x-ehub-auth', 'ehub-auth'].forEach(function (k) { var v = hh.get(k); if (v && v !== AUTH_TOKEN && /^local\./.test(v)) hh.set(k, AUTH_TOKEN); });
      init.headers = hh;
    }
    var r = await nativeFetch(url, init);
    if (r.status === 429) { try { var jj = await r.clone().json(); post('toast', { message: (jj.error && jj.error.message) || jj.message || 'Too many requests — try again shortly.' }); } catch (e) {} }
    return r;
  }
  function refusedResponse(u) {
    return new Response(JSON.stringify({ success: false, error: { code: 'unavailable', message: 'That service is not part of Pravahahub.' } }),
      { status: 503, statusText: 'Unavailable', headers: { 'content-type': 'application/json' } });
  }
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var w = workerTarget(input) || siteTarget(input);
      if (w) {
        if (input && input.url && typeof Request !== 'undefined' && input instanceof Request) return nativeFetch(new Request(w, input), init);
        return nativeFetch(w, init);
      }
      if (isBlockedURL(input)) {
        var href = String(input && input.url ? input.url : input);
        if (/sdk\.everything-hub\.invalid/i.test(href)) return Promise.resolve(new Response('/* everything-core */', { status: 200, headers: { 'content-type': 'text/javascript' } }));
        return Promise.resolve(refusedResponse(input));
      }
      return nativeFetch(input, init);
    };
  }
  try {
    var xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__evBlocked = isBlockedURL(u);
      var args = Array.prototype.slice.call(arguments); args[1] = mapURL(u); if (args.length < 3) args[2] = true;
      return xo.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__evBlocked) { var x = this; setTimeout(function () { try { x.dispatchEvent(new ProgressEvent('error')); } catch (e) {} if (x.onerror) x.onerror(new ProgressEvent('error')); }, 0); return; }
      return xs.apply(this, arguments);
    };
  } catch (e) {}
  try {
    if (window.WebSocket) {
      var NWS = window.WebSocket;
      var GuardWS = function (u, p) {
        var http = String(u).replace(/^ws/, 'http'), w = workerTarget(http);
        if (w) u = w.replace(/^http/, 'ws');
        else if (isBlockedURL(http)) {
          var fake = new EventTarget(); fake.readyState = 3; fake.send = function () {}; fake.close = function () {}; fake.url = String(u);
          setTimeout(function () { var ev = new Event('error'); fake.dispatchEvent(ev); if (fake.onerror) fake.onerror(ev); var c = new CloseEvent('close', { code: 1006 }); fake.dispatchEvent(c); if (fake.onclose) fake.onclose(c); }, 0);
          return fake;
        }
        return p === undefined ? new NWS(u) : new NWS(u, p);
      };
      GuardWS.prototype = NWS.prototype; GuardWS.CONNECTING = 0; GuardWS.OPEN = 1; GuardWS.CLOSING = 2; GuardWS.CLOSED = 3;
      window.WebSocket = GuardWS;
    }
    if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { return isBlockedURL(u) ? true : sb(mapURL(u), d); }; }
    if (window.EventSource) { var NES = window.EventSource; window.EventSource = function (u, o) { if (isBlockedURL(u)) { var f = new EventTarget(); f.readyState = 2; f.close = function () {}; return f; } return new NES(mapURL(u), o); }; window.EventSource.prototype = NES.prototype; }
    ['HTMLImageElement', 'HTMLIFrameElement', 'HTMLLinkElement', 'HTMLAnchorElement', 'HTMLSourceElement', 'HTMLMediaElement'].forEach(function (k) {
      var C = window[k]; if (!C) return; var prop = k === 'HTMLLinkElement' || k === 'HTMLAnchorElement' ? 'href' : 'src';
      var d = Object.getOwnPropertyDescriptor(C.prototype, prop);
      if (d && d.set) Object.defineProperty(C.prototype, prop, { configurable: true, enumerable: d.enumerable, get: d.get,
        set: function (v) { return d.set.call(this, isBlockedURL(v) ? 'about:blank' : mapURL(v)); } });
    });
    var nsa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      var ln = String(n).toLowerCase();
      if (ln === 'src' || ln === 'href' || ln === 'action' || ln === 'srcset') {
        if (isBlockedURL(String(v))) v = this.tagName === 'SCRIPT' ? 'data:text/javascript,' : (ln === 'href' && this.tagName === 'A' ? '#' : 'about:blank');
        else if (ln !== 'srcset') v = mapURL(String(v));
      }
      return nsa.call(this, n, v);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) { var cwt = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = function (t) { return cwt(siteText(t)); }; }
    var nopen = window.open;
    window.open = function (u) { if (u && isBlockedURL(String(u))) return null; var a = Array.prototype.slice.call(arguments); if (u) a[0] = mapURL(String(u)); return nopen.apply(window, a); };
    var srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    if (srcDesc && srcDesc.set) {
      Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        configurable: true, enumerable: srcDesc.enumerable, get: srcDesc.get,
        set: function (v) { return srcDesc.set.call(this, isBlockedURL(v) ? 'data:text/javascript,' : v); },
      });
    }
  } catch (e) {}

  /* --------------------------------------------------------------- IndexedDB */
  var DB_NAME = 'everything-drive';
  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('nodes')) { var s = d.createObjectStore('nodes', { keyPath: 'path' }); s.createIndex('parent', 'parent'); s.createIndex('uid', 'uid', { unique: false }); }
        if (!d.objectStoreNames.contains('kvbig')) d.createObjectStore('kvbig');
      };
      req.onsuccess = function () { var d = req.result; d.onversionchange = function () { d.close(); dbPromise = null; }; resolve(d); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { console.warn('[ehub-local] drive upgrade blocked'); };
    });
    return dbPromise;
  }
  function storageError(e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.message)))) {
      var m = 'Browser storage is full. Delete some files or app data (or export a backup from hub settings and clear space), then try again.';
      post('toast', { message: m });
      return err('storage_full', m, { name: 'QuotaExceededError', cause: e });
    }
    return e && e.code ? e : err('storage_error', 'Could not save: ' + ((e && (e.message || e.name)) || e), { cause: e });
  }
  function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function txDone(t) { return new Promise(function (res, rej) { t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || err('aborted', 'Transaction aborted')); }; }); }
  async function store(name, mode) { var d = await db(); return d.transaction(name, mode || 'readonly').objectStore(name); }
  async function getNode(path) { return reqP((await store('nodes')).get(path)); }
  async function childrenOf(path) { return reqP((await store('nodes')).index('parent').getAll(path)); }
  async function putNodes(nodes) { var d = await db(); var t = d.transaction('nodes', 'readwrite'); var s = t.objectStore('nodes'); nodes.forEach(function (n) { s.put(n); }); return txDone(t); }
  async function putNodesSafe(nodes) { try { return await putNodes(nodes); } catch (e) { throw storageError(e); } }
  async function deleteKeys(paths) { var d = await db(); var t = d.transaction('nodes', 'readwrite'); var s = t.objectStore('nodes'); paths.forEach(function (p) { s.delete(p); }); return txDone(t); }
  async function allUnder(path) {
    var s = await store('nodes');
    var range = IDBKeyRange.bound(path + '/', path + '/\uffff');
    return reqP(s.getAll(range));
  }

  /* ------------------------------------------------------------------- paths */
  function normPath(p) {
    if (p && typeof p === 'object') p = p.path || p.name || '';
    p = String(p == null ? '' : p).replace(/\\/g, '/');
    if (p === '' || p === '.') p = '~/AppData/' + APP;
    else if (p === '~') p = HOME;
    if (p.indexOf('~/') === 0) p = HOME + p.slice(1);
    else if (p[0] !== '/') p = HOME + '/AppData/' + APP + '/' + p;
    var out = [];
    p.split('/').forEach(function (seg) { if (!seg || seg === '.') return; if (seg === '..') out.pop(); else out.push(seg); });
    return '/' + out.join('/');
  }
  var dirname = function (p) { var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
  var basename = function (p) { return p.slice(p.lastIndexOf('/') + 1); };
  var fsBus = (function () { try { return new BroadcastChannel('everything:fs'); } catch (e) { return null; } })();
  var fsListeners = [];
  function fsEmit(kind, path, extra) {
    try { hostSync(kind, path, extra); } catch (e) {}
    var msg = Object.assign({ kind: kind, type: kind, path: path, app: APP, at: Date.now() }, extra || {});
    try { fsBus && fsBus.postMessage(msg); } catch (e) {}
  }
  if (fsBus) fsBus.onmessage = function (e) { fsListeners.slice().forEach(function (l) { try { l(e.data); } catch (x) {} }); };

  function guessType(name) {
    var ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1];
    var map = { ics: 'text/calendar', vcf: 'text/vcard', rss: 'application/rss+xml', woff2: 'font/woff2', txt: 'text/plain', md: 'text/markdown', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', csv: 'text/csv', xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', stl: 'model/stl', glb: 'model/gltf-binary', gltf: 'model/gltf+json', dxf: 'image/vnd.dxf' };
    return (ext && map[ext.toLowerCase()]) || 'application/octet-stream';
  }
  function toItem(n) {
    if (!n) return null;
    var it = {
      id: n.uid, uid: n.uid, uuid: n.uid, name: n.name, path: n.path, is_dir: !!n.is_dir, isDirectory: !!n.is_dir,
      size: n.is_dir ? 0 : n.size || 0, type: n.is_dir ? null : n.type || guessType(n.name),
      created: n.created, modified: n.modified, accessed: n.modified, changed: n.modified,
      parent_id: null, dirname: dirname(n.path), immutable: false, is_shortcut: 0, is_symlink: false, writable: true,
      owner: { username: USERNAME, email: USER.email }, local: true,
    };
    Object.defineProperty(it, 'read', { enumerable: false, value: function (o) { return fs.read(n.path, o); } });
    Object.defineProperty(it, 'readdir', { enumerable: false, value: function () { return fs.readdir(n.path); } });
    Object.defineProperty(it, 'write', { enumerable: false, value: function (d) { return fs.write(n.path, d); } });
    Object.defineProperty(it, 'delete', { enumerable: false, value: function () { return fs.delete(n.path); } });
    Object.defineProperty(it, 'rename', { enumerable: false, value: function (nn) { return fs.rename(n.path, nn); } });
    return it;
  }
  function dirNode(path) { var t = nowSec(); return { path: path, parent: path === '/' ? '' : dirname(path), name: basename(path) || '/', is_dir: true, size: 0, uid: 'ev-' + rid(10), created: t, modified: t }; }

  var bootstrapped = null;
  function bootstrap() {
    if (bootstrapped) return bootstrapped;
    bootstrapped = (async function () {
      var base = ['/', HOME, HOME + '/Desktop', HOME + '/Documents', HOME + '/Pictures', HOME + '/Videos', HOME + '/Public', HOME + '/AppData', HOME + '/AppData/' + APP];
      var missing = [];
      for (var i = 0; i < base.length; i++) if (!(await getNode(base[i]))) missing.push(dirNode(base[i]));
      if (missing.length) await putNodes(missing);
    })().catch(function (e) { bootstrapped = null; throw e; });
    return bootstrapped;
  }
  async function ensureDir(path) {
    var parts = path.split('/').filter(Boolean), cur = '', add = [];
    for (var i = 0; i < parts.length; i++) {
      cur += '/' + parts[i];
      var n = await getNode(cur);
      if (n && !n.is_dir) throw err('dest_is_not_a_directory', cur + ' is a file, not a folder');
      if (!n) add.push(dirNode(cur));
    }
    if (add.length) await putNodes(add);
    return getNode(path);
  }
  async function dedupe(path) {
    if (!(await getNode(path))) return path;
    var dir = dirname(path), name = basename(path), m = /^(.*?)(\.[^.]*)?$/.exec(name), stem = m[1], ext = m[2] || '';
    for (var i = 1; i < 10000; i++) { var c = (dir === '/' ? '' : dir) + '/' + stem + ' (' + i + ')' + ext; if (!(await getNode(c))) return c; }
    return path;
  }
  async function toBlob(data, type) {
    if (data == null) return new Blob([], { type: type || '' });
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type: type || '' });
    if (typeof data === 'string') return new Blob([data], { type: type || 'text/plain' });
    if (typeof data === 'object' && (data.constructor === Object || Array.isArray(data) || Object.getPrototypeOf(data) === null)) return new Blob([JSON.stringify(data)], { type: 'application/json' });
    return new Blob([String(data)], { type: type || 'text/plain' });
  }
  async function resolveTarget(p) {
    if (p && typeof p === 'object' && !p.path && (p.uid || p.uuid || p.id)) {
      var uidv = p.uid || p.uuid || p.id;
      var n = await reqP((await store('nodes')).index('uid').get(uidv));
      if (!n) throw err('subject_does_not_exist', 'No file with id ' + uidv);
      return n.path;
    }
    return normPath(p);
  }

  var fs = {
    async write(path, data, opts) {
      await bootstrap();
      if ((path instanceof Blob) && data === undefined) { data = path; path = path.name || ('Untitled-' + Date.now()); }
      if (data && typeof data === 'object' && !(data instanceof Blob) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data) && opts === undefined && ('overwrite' in data || 'dedupeName' in data || 'createMissingParents' in data)) { opts = data; data = ''; }
      opts = opts || {};
      var p = await resolveTarget(path);
      if (opts.createMissingParents === false && !(await getNode(dirname(p)))) throw err('dest_does_not_exist', dirname(p) + ' does not exist');
      await ensureDir(dirname(p));
      var existing = await getNode(p);
      if (existing && existing.is_dir) throw err('dest_is_a_directory', p + ' is a folder');
      if (existing && (opts.dedupeName || opts.dedupe_name)) { p = await dedupe(p); existing = null; }
      else if (existing && opts.overwrite === false) throw err('item_with_same_name_exists', 'A file with that name already exists', { entry_name: basename(p) });
      var blob = await toBlob(data, guessType(p));
      var t = nowSec();
      var node = { path: p, parent: dirname(p), name: basename(p), is_dir: false, size: blob.size, type: blob.type || guessType(p), uid: existing ? existing.uid : 'ev-' + rid(10), created: existing ? existing.created : t, modified: t, blob: blob };
      try { await putNodes([node]); }
      catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.name === 'AbortError' && /quota/i.test(String(e.message)))) throw storageError(e);
        // Safari historically refused Blobs in IDB: store bytes instead.
        node.blob = await blob.arrayBuffer(); node.raw = true; await putNodesSafe([node]);
      }
      fsEmit('write', p, { uid: node.uid });
      return toItem(node);
    },
    async read(path, opts) {
      await bootstrap();
      var p = await resolveTarget(path);
      var n = await getNode(p);
      if (!n) throw err('subject_does_not_exist', p + ' does not exist', { path: p });
      if (n.is_dir) throw err('is_directory', p + ' is a folder');
      var blob = n.blob instanceof Blob ? n.blob : new Blob([n.blob || ''], { type: n.type || guessType(n.name) });
      if (blob.type !== (n.type || blob.type)) blob = new Blob([blob], { type: n.type });
      opts = opts || {};
      if (opts.offset != null || opts.byte_count != null) {
        var start = opts.offset || 0; blob = blob.slice(start, opts.byte_count != null ? start + opts.byte_count : undefined, blob.type);
      }
      return blob;
    },
    async readdir(path, opts) {
      await bootstrap();
      if (path && typeof path === 'object' && !Array.isArray(path) && path.path === undefined && path.uid === undefined) path = '';
      var p = await resolveTarget(path);
      var n = await getNode(p);
      if (!n) { if (p === normPath('')) { await ensureDir(p); return []; } throw err('subject_does_not_exist', p + ' does not exist', { path: p }); }
      if (!n.is_dir) throw err('is_not_directory', p + ' is not a folder');
      var kids = await childrenOf(p);
      return kids.sort(function (a, b) { return a.name.localeCompare(b.name); }).map(toItem);
    },
    async stat(path, opts) {
      await bootstrap();
      var p = await resolveTarget(path);
      var n = await getNode(p);
      if (!n) throw err('subject_does_not_exist', p + ' does not exist', { path: p });
      var it = toItem(n);
      if (n.is_dir && opts && (opts.returnSubdomains || opts.returnSize)) it.size = (await allUnder(p)).reduce(function (s, x) { return s + (x.size || 0); }, 0);
      return it;
    },
    async mkdir(path, opts) {
      await bootstrap();
      opts = opts || {};
      var p = await resolveTarget(path);
      var existing = await getNode(p);
      if (existing) {
        if (opts.dedupeName || opts.dedupe_name) p = await dedupe(p);
        else if (existing.is_dir) { if (opts.overwrite === false) throw err('item_with_same_name_exists', 'A folder with that name already exists'); return toItem(existing); }
        else throw err('item_with_same_name_exists', 'A file with that name already exists');
      }
      if (opts.createMissingParents === false && opts.recursive !== true && !(await getNode(dirname(p)))) throw err('dest_does_not_exist', dirname(p) + ' does not exist');
      var n = await ensureDir(p);
      fsEmit('mkdir', p);
      return toItem(n);
    },
    async delete(paths, opts) {
      await bootstrap();
      opts = opts || {};
      var list = Array.isArray(paths) ? paths : [paths];
      for (var i = 0; i < list.length; i++) {
        var p = await resolveTarget(list[i]);
        var n = await getNode(p);
        if (!n) { if (opts.ignoreMissing === false) throw err('subject_does_not_exist', p + ' does not exist'); continue; }
        if (p === '/' || p === HOME) throw err('immutable', 'Cannot delete ' + p);
        var under = n.is_dir ? (await allUnder(p)).map(function (x) { return x.path; }) : [];
        if (n.is_dir && under.length && opts.recursive === false) throw err('not_empty', p + ' is not empty');
        await deleteKeys(opts.descendantsOnly ? under : under.concat([p]));
        fsEmit('delete', p);
      }
      return true;
    },
    async rename(path, newName) {
      await bootstrap();
      var p = await resolveTarget(path);
      var target = String(newName).indexOf('/') >= 0 ? normPath(newName) : (dirname(p) === '/' ? '' : dirname(p)) + '/' + newName;
      return move(p, target, { overwrite: false, keepModified: false });
    },
    async move(src, dest, opts) {
      await bootstrap();
      opts = opts || {};
      var p = await resolveTarget(src), d = normPath(dest);
      var dn = await getNode(d);
      var target = dn && dn.is_dir ? d + '/' + (opts.newName || basename(p)) : (opts.newName ? dirname(d) + '/' + opts.newName : d);
      if (opts.dedupeName) target = await dedupe(target);
      if (opts.createMissingParents !== false) await ensureDir(dirname(target));
      return move(p, target, opts);
    },
    async copy(src, dest, opts) {
      await bootstrap();
      opts = opts || {};
      var p = await resolveTarget(src), d = normPath(dest);
      var n = await getNode(p);
      if (!n) throw err('subject_does_not_exist', p + ' does not exist');
      var dn = await getNode(d);
      var target = dn && dn.is_dir ? d + '/' + (opts.newName || basename(p)) : d;
      if (n.is_dir && (target === p || target.indexOf(p + '/') === 0)) throw err('cannot_copy_into_self', 'Cannot copy a folder into itself');
      if (await getNode(target)) { if (opts.dedupeName || opts.dedupe_name) target = await dedupe(target); else if (!opts.overwrite) throw err('item_with_same_name_exists', 'An item with that name already exists'); }
      await ensureDir(dirname(target));
      var t = nowSec();
      var nodes = [n].concat(n.is_dir ? await allUnder(p) : []).map(function (x) {
        var np = target + x.path.slice(p.length);
        return Object.assign({}, x, { path: np, parent: dirname(np), name: basename(np), uid: 'ev-' + rid(10), created: t, modified: t });
      });
      await putNodesSafe(nodes);
      fsEmit('write', target);
      return [{ copied: toItem(nodes[0]), overwritten: null }];
    },
    async upload(items, dirPath, opts) {
      await bootstrap();
      opts = opts || {};
      var files = items instanceof FileList ? Array.prototype.slice.call(items) : Array.isArray(items) ? items : [items];
      var dir = normPath(dirPath || '~/Desktop');
      await ensureDir(dir);
      var out = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var rel = f.webkitRelativePath || f.name || ('upload-' + i);
        out.push(await fs.write(dir + '/' + rel, f, { dedupeName: opts.dedupeName !== false && opts.overwrite !== true, overwrite: !!opts.overwrite }));
      }
      return out.length === 1 ? out[0] : out;
    },
    async getReadURL(path, expiresIn) {
      if (ONLINE && IDENTITY_FILE.test(normPath(path))) return ORIGIN + '/token-read?token=' + encodeURIComponent(accessToken(normPath(path), 86400));
      var blob = await fs.read(path);
      return URL.createObjectURL(blob);
    },
    async revokeReadURL(url) { try { URL.revokeObjectURL(url); } catch (e) {} return true; },
    async space() {
      await bootstrap();
      var used = 0;
      try { var all = await reqP((await store('nodes')).getAll()); all.forEach(function (n) { used += n.size || 0; }); } catch (e) {}
      var quota = 0;
      try { var est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; quota = est && est.quota || 0; } catch (e) {}
      var capacity = quota || 10 * 1073741824;
      return { capacity: capacity, used: used, host_used: used };
    },
    async exists(path) { try { await fs.stat(path); return true; } catch (e) { return false; } },
    // Sharing has no meaning on a single-device drive: answer as an unshared file.
    // Files on this drive live only in this browser; there is no per-person sharing. Fail clearly instead of pretending.
    async share(path) { await fs.stat(path); throw err('not_supported', 'Sharing a file with another person isn\u2019t available on Pravahahub yet. Download or export a copy and send it instead.'); },
    async unshare() { return { revoked: 0 }; },
    async getShares() { return []; },
    async listShared() { return { items: [] }; },
    async getShareLink(path) { var s = await fs.stat(path); return location.origin + location.pathname + '#file=' + encodeURIComponent(s.uid); },
    async sign(app, items) { return { token: AUTH_TOKEN, items: [].concat(items || []).map(function (i) { return Object.assign({}, i, { signature: 'local' }); }) }; },
    async symlink() { throw err('not_supported', 'Shortcuts are not supported on the local drive'); },
  };
  async function move(p, target, opts) {
    var n = await getNode(p);
    if (!n) throw err('subject_does_not_exist', p + ' does not exist', { path: p });
    if (target === p) return toItem(n);
    if (n.is_dir && target.indexOf(p + '/') === 0) throw err('cannot_move_into_self', 'Cannot move a folder into itself');
    if (p === HOME || p === '/') throw err('immutable', 'Cannot move ' + p);
    var clash = await getNode(target);
    if (clash) {
      if (opts && opts.overwrite) await fs.delete(target);
      else throw err('item_with_same_name_exists', 'An item named ' + basename(target) + ' already exists', { entry_name: basename(target) });
    }
    var t = nowSec();
    var kids = n.is_dir ? await allUnder(p) : [];
    var moved = [n].concat(kids).map(function (x) {
      var np = target + x.path.slice(p.length);
      return Object.assign({}, x, { path: np, parent: dirname(np), name: basename(np), modified: x === n ? t : x.modified });
    });
    await putNodesSafe(moved);
    await deleteKeys([p].concat(kids.map(function (k) { return k.path; })));
    fsEmit('rename', target, { from: p });
    return toItem(moved[0]);
  }

  /* ---------------------------------------------------------------------- kv */
  var KV_PREFIX = 'everything:kv:' + APP + ':';
  var BIG = '\u0000idb', KV_INLINE = 96 * 1024;
  var kvBus = (function () { try { return new BroadcastChannel('everything:kv'); } catch (e) { return null; } })();
  var kvListeners = [];
  function kvEmit(op, key, value, size) {
    var msg = { op: op, app: APP, key: key, ts: Date.now() };
    if (op === 'set' && size <= 256 * 1024) msg.value = value; else if (op === 'set') msg.large = true;
    try { kvBus && kvBus.postMessage(msg); } catch (e) {}
  }
  if (kvBus) kvBus.onmessage = function (e) { var m = e.data; if (!m || m.app !== APP) return; kvListeners.slice().forEach(function (l) { try { l(m); } catch (x) {} }); };
  function kvRead(key) {
    var raw = LS.getItem(KV_PREFIX + key);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  async function kvLoad(key) {
    var rec = kvRead(key);
    if (!rec) return null;
    if (rec.e && rec.e * 1000 <= Date.now()) { kvRemove(key, true); return null; }
    if (rec.b === BIG) {
      try { var big = await reqP((await store('kvbig')).get(KV_PREFIX + key)); if (big) return big; } catch (e) {}
      return null;
    }
    return rec;
  }
  async function kvSave(key, value, expireAt) {
    if (typeof key !== 'string' || !key.length) throw err('key_undefined', 'A key is required');
    if (key.length > 1024) throw err('key_too_large', 'Key is too long');
    if (value === undefined) value = null;
    var rec = { v: jsonClone(value) };
    if (expireAt) rec.e = expireAt;
    var json = JSON.stringify(rec);
    var prevRaw = LS.getItem(KV_PREFIX + key);
    // localStorage (~5 MB) is shared by every app on this origin: values over KV_INLINE go to IndexedDB
    // up front, and anything that no longer fits spills there too, with a small marker left behind.
    var inline = json.length <= KV_INLINE;
    if (inline) {
      try {
        LS.setItem(KV_PREFIX + key, json);
        if (prevRaw && prevRaw.indexOf(BIG) >= 0) { try { var s = await store('kvbig', 'readwrite'); s.delete(KV_PREFIX + key); } catch (e) {} }
      } catch (e) { inline = false; }
    }
    if (!inline) {
      try {
        var d = await db(), t = d.transaction('kvbig', 'readwrite');
        t.objectStore('kvbig').put(rec, KV_PREFIX + key);
        await txDone(t);
        LS.setItem(KV_PREFIX + key, JSON.stringify({ b: BIG, e: expireAt || undefined }));
      } catch (e) { throw storageError(e); }
    }
    kvEmit('set', key, rec.v, json.length);
    return true;
  }
  function kvRemove(key, quiet) {
    var had = LS.getItem(KV_PREFIX + key) != null;
    LS.removeItem(KV_PREFIX + key);
    if (had && !quiet) kvEmit('del', key, null, 0);
    store('kvbig', 'readwrite').then(function (s) { s.delete(KV_PREFIX + key); }).catch(function () {});
  }
  function kvKeys() {
    var out = [];
    for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(KV_PREFIX) === 0) out.push(k.slice(KV_PREFIX.length)); }
    return out;
  }
  function globToRe(pattern) {
    var esc = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + esc + '$');
  }
  function pathParts(path) {
    if (Array.isArray(path)) return path.map(String);
    var s = String(path), out = [], i = 0, cur = '';
    while (i < s.length) {
      var c = s[i];
      if (c === '.') { if (cur) out.push(cur); cur = ''; i++; continue; }
      if (c === '[') {
        if (cur) { out.push(cur); cur = ''; }
        var q = s[i + 1];
        if (q === '"' || q === "'") {
          var j = i + 2, buf = '';
          while (j < s.length && s[j] !== q) { if (s[j] === '\\' && j + 1 < s.length) { buf += s[j + 1]; j += 2; continue; } buf += s[j]; j++; }
          out.push(buf); i = s.indexOf(']', j); i = i < 0 ? s.length : i + 1; continue;
        }
        var e = s.indexOf(']', i); if (e < 0) { cur += s.slice(i); break; }
        out.push(s.slice(i + 1, e).trim()); i = e + 1; continue;
      }
      cur += c; i++;
    }
    if (cur) out.push(cur);
    return out.length ? out : [s];
  }
  function setPath(obj, path, value) {
    var parts = pathParts(path), o = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }
  function getPath(obj, path) { return pathParts(path).reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function delPath(obj, path) {
    var parts = pathParts(path), last = parts.pop(), o = parts.length ? getPath(obj, parts) : obj;
    if (o && typeof o === 'object') { if (Array.isArray(o) && /^\d+$/.test(last)) o.splice(Number(last), 1); else delete o[last]; }
  }
  var kvQueue = Promise.resolve();
  function serial(fn) { var r = kvQueue.then(fn, fn); kvQueue = r.catch(function () {}); return r; }

  var kv = {
    MAX_KEY_SIZE: 1024, MAX_VALUE_SIZE: 399 * 1024,
    async get(key) {
      if (Array.isArray(key)) return Promise.all(key.map(function (k) { return kv.get(k); }));
      var r = await kvLoad(String(key));
      return r ? jsonClone(r.v) : null;
    },
    async set(key, value, expireAt) {
      if (Array.isArray(key)) { for (var i = 0; i < key.length; i++) await kvSave(key[i].key, key[i].value, key[i].expireAt); return true; }
      if (key && typeof key === 'object') { if (Array.isArray(key.items)) return kv.set(key.items); return kvSave(key.key, key.value, key.expireAt); }
      return kvSave(String(key), value, typeof expireAt === 'number' ? expireAt : (expireAt && expireAt.expireAt) || null);
    },
    async del() {
      var keys = Array.prototype.slice.call(arguments).reduce(function (a, k) { return a.concat(k); }, []);
      keys.forEach(function (k) { kvRemove(String(k)); });
      return true;
    },
    async incr(key, amount) {
      return serial(async function () {
        var rec = await kvLoad(key);
        if (amount && typeof amount === 'object') {
          var obj = rec && rec.v && typeof rec.v === 'object' ? rec.v : {};
          Object.keys(amount).forEach(function (p) { setPath(obj, p, (Number(getPath(obj, p)) || 0) + Number(amount[p])); });
          await kvSave(key, obj, rec && rec.e); return jsonClone(obj);
        }
        var next = (rec && typeof rec.v === 'number' ? rec.v : Number(rec && rec.v) || 0) + (amount === undefined ? 1 : Number(amount));
        await kvSave(key, next, rec && rec.e);
        return next;
      });
    },
    async decr(key, amount) {
      if (amount && typeof amount === 'object') { var neg = {}; Object.keys(amount).forEach(function (k) { neg[k] = -amount[k]; }); return kv.incr(key, neg); }
      return kv.incr(key, -(amount === undefined ? 1 : Number(amount)));
    },
    async add(key, values) {
      return serial(async function () {
        var rec = await kvLoad(key);
        if (values && typeof values === 'object' && !Array.isArray(values) && rec && rec.v && typeof rec.v === 'object' && !Array.isArray(rec.v)) {
          var o = rec.v; Object.keys(values).forEach(function (p) { var cur = getPath(o, p); setPath(o, p, (Array.isArray(cur) ? cur : cur == null ? [] : [cur]).concat(values[p])); });
          await kvSave(key, o, rec.e); return jsonClone(o);
        }
        var list = rec ? (Array.isArray(rec.v) ? rec.v : rec.v == null ? [] : [rec.v]) : [];
        list = list.concat(Array.isArray(values) ? values : [values]);
        await kvSave(key, list, rec && rec.e);
        return jsonClone(list);
      });
    },
    async remove(key) {
      var paths = Array.prototype.slice.call(arguments, 1);
      return serial(async function () {
        var rec = await kvLoad(key); if (!rec || !rec.v || typeof rec.v !== 'object') return null;
        paths.reduce(function (a, x) { return a.concat(x); }, []).forEach(function (p) { if (p != null) delPath(rec.v, p); });
        await kvSave(key, rec.v, rec.e); return jsonClone(rec.v);
      });
    },
    async update(key, paths, ttl) {
      return serial(async function () {
        var rec = await kvLoad(key);
        var v = rec && rec.v && typeof rec.v === 'object' ? rec.v : {};
        Object.keys(paths || {}).forEach(function (p) { setPath(v, p, jsonClone(paths[p])); });
        await kvSave(key, v, typeof ttl === 'number' ? nowSec() + ttl : rec && rec.e);
        return jsonClone(v);
      });
    },
    async expire(key, seconds) { var r = await kvLoad(key); if (!r) return false; await kvSave(key, r.v, nowSec() + Number(seconds)); return true; },
    async expireAt(key, ts) { var r = await kvLoad(key); if (!r) return false; await kvSave(key, r.v, Number(ts)); return true; },
    async list(a, b) {
      var opts = {};
      if (typeof a === 'string') opts = { pattern: a, returnValues: !!b };
      else if (typeof a === 'boolean') opts = { returnValues: a };
      else if (a && typeof a === 'object') opts = a;
      var re = globToRe(opts.pattern || '*');
      var keys = kvKeys().filter(function (k) { return re.test(k); }).sort();
      var live = [];
      for (var i = 0; i < keys.length; i++) { var r = await kvLoad(keys[i]); if (r) live.push({ key: keys[i], rec: r }); }
      if (opts.reverse) live.reverse();
      var paged = opts.limit !== undefined || opts.cursor !== undefined;
      var start = opts.cursor ? Number(opts.cursor) || 0 : opts.offset || 0;
      var lim = Math.min(opts.limit || 1000, 1000);
      var slice = paged ? live.slice(start, start + lim) : live;
      var items = slice.map(function (x) { return opts.returnValues ? { key: x.key, value: jsonClone(x.rec.v) } : x.key; });
      if (!paged) return items;
      return { items: items, cursor: start + lim < live.length ? String(start + lim) : undefined, total: opts.includeTotal ? live.length : undefined };
    },
    async flush() { kvKeys().forEach(kvRemove); return true; },
    async clear() { return kv.flush(); },
  };

  /* ---------------------------------------------------------------------- ai */
  var AI_OFF = 'AI is unavailable right now — try again shortly, or add your own key in Pravahahub settings';
  function aiConfig() {
    try { var c = JSON.parse(LS.getItem('everything:ai') || 'null'); if (c && c.endpoint && (c.apiKey || /localhost|127\.0\.0\.1/.test(c.endpoint))) return c; } catch (e) {}
    if (!ONLINE) return null;
    return { endpoint: ORIGIN + '/api/ai', apiKey: '', model: 'default', builtin: true, imageModel: 'default', sttModel: 'default', ttsModel: 'default' };
  }
  function aiOff() { post('toast', { message: AI_OFF, action: 'settings' }); return err('ai_off', AI_OFF, { success: false }); }
  function aiURL(c, tail) {
    var base = String(c.endpoint).replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(base)) base = base.replace(/\/chat\/completions$/, '');
    return base + tail;
  }
  function aiHeaders(c) { var h = { 'content-type': 'application/json' }; if (c.apiKey) h.authorization = 'Bearer ' + c.apiKey; if (c.builtin) h['x-ehub-auth'] = AUTH_TOKEN; return h; }
  function normTools(tools) {
    return (tools || []).map(function (t) {
      if (t && t.type === 'function' && t.function) return t;
      return { type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || t.input_schema || { type: 'object', properties: {} } } };
    });
  }
  function normMessages(prompt, images) {
    var msgs;
    if (Array.isArray(prompt)) msgs = prompt.map(function (m) { return typeof m === 'string' ? { role: 'user', content: m } : m; });
    else msgs = [{ role: 'user', content: String(prompt == null ? '' : prompt) }];
    if (images && images.length) {
      var last = msgs[msgs.length - 1];
      var parts = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : (last.content || []).slice();
      images.forEach(function (u) { parts.push({ type: 'image_url', image_url: { url: u } }); });
      last.content = parts;
    }
    // Pravahahub accepts a few extra part shapes; map them to OpenAI's.
    return msgs.map(function (m) {
      if (!Array.isArray(m.content)) return m;
      return Object.assign({}, m, { content: m.content.map(function (p) {
        if (typeof p === 'string') return { type: 'text', text: p };
        if (p && p.type === 'image' && p.source && p.source.data) return { type: 'image_url', image_url: { url: 'data:' + (p.source.media_type || 'image/png') + ';base64,' + p.source.data } };
        if (p && p.type === 'document' && p.source && p.source.data) return { type: 'text', text: '[Attached document omitted: ' + (p.source.media_type || 'file') + ']' };
        return p;
      }) });
    });
  }
  function parseChatArgs(args) {
    args = Array.prototype.slice.call(args);
    var prompt = args.shift(), images = [], opts = {};
    args.forEach(function (a) {
      if (typeof a === 'boolean') opts.testMode = a;
      else if (typeof a === 'string') images.push(a);
      else if (Array.isArray(a)) images = images.concat(a.filter(function (x) { return typeof x === 'string'; }));
      else if (a && typeof a === 'object') opts = Object.assign(opts, a);
    });
    return { prompt: prompt, images: images, opts: opts };
  }
  function chatResult(message, extra) {
    var content = message.content == null ? '' : message.content;
    var res = Object.assign({ index: 0, message: Object.assign({ role: 'assistant' }, message, { content: content }), finish_reason: 'stop', via_ai_chat_service: true }, extra || {});
    res.toString = function () { return typeof content === 'string' ? content : Array.isArray(content) ? content.map(function (c) { return c.text || ''; }).join('') : ''; };
    res.valueOf = res.toString;
    return res;
  }
  async function* streamSSE(resp) {
    var reader = resp.body.getReader(), dec = new TextDecoder(), buf = '', tools = {}, usage = null;
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      var lines = buf.split(/\r?\n/); buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.indexOf('data:') !== 0) continue;
        var data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        var j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.error) throw err('ai_error', String((j.error && (j.error.message || j.error)) || 'The AI stream failed'), { success: false });
        if (j.usage) usage = j.usage;
        var ch = j.choices && j.choices[0]; if (!ch) continue;
        var d = ch.delta || {};
        if (d.reasoning_content || d.reasoning) yield { type: 'reasoning', reasoning: d.reasoning_content || d.reasoning };
        if (typeof d.content === 'string' && d.content) yield { type: 'text', text: d.content };
        (d.tool_calls || []).forEach(function (tc) {
          var k = tc.index != null ? tc.index : 0;
          var t = tools[k] || (tools[k] = { id: tc.id, name: '', args: '' });
          if (tc.id) t.id = tc.id;
          if (tc.function && tc.function.name) t.name += tc.function.name;
          if (tc.function && tc.function.arguments) t.args += tc.function.arguments;
        });
      }
    }
    for (var k2 in tools) {
      var t2 = tools[k2], input = {};
      try { input = t2.args.trim() ? JSON.parse(t2.args) : {}; } catch (e) { input = t2.args; }
      yield { type: 'tool_use', id: t2.id || ('call_' + rid(6)), name: t2.name, input: input };
    }
    if (usage) yield { type: 'usage', usage: usage };
  }
  function speakFallback(text, opts) {
    // A small audio-like object driven by the browser's own speech synthesis.
    var et = new EventTarget(), u = null;
    var o = { paused: true, currentTime: 0, duration: NaN, src: '', dataset: { text: String(text).slice(0, 60) },
      play: function () { try { speechSynthesis.cancel(); u = new SpeechSynthesisUtterance(String(text)); if (opts && opts.language) u.lang = opts.language; u.onend = function () { o.paused = true; var e = new Event('ended'); et.dispatchEvent(e); if (o.onended) o.onended(e); }; speechSynthesis.speak(u); o.paused = false; var pe = new Event('play'); et.dispatchEvent(pe); if (o.onplay) o.onplay(pe); } catch (e) {} return Promise.resolve(); },
      pause: function () { try { speechSynthesis.cancel(); } catch (e) {} o.paused = true; var e = new Event('pause'); et.dispatchEvent(e); if (o.onpause) o.onpause(e); },
      addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et), dispatchEvent: et.dispatchEvent.bind(et), load: function () {} };
    return o;
  }
  var ai = {
    async chat() {
      var a = parseChatArgs(arguments);
      if (a.opts.testMode === true) return chatResult({ content: 'Test mode reply from Pravahahub (local).' });
      var c = aiConfig();
      if (!c) throw aiOff();
      var body = { model: (a.opts.model && (c.allowModelOverride || (c.builtin && /^@cf\//.test(a.opts.model))) ? a.opts.model : c.model) || 'gpt-4o-mini', messages: normMessages(a.prompt, a.images) };
      if (a.opts.tools && a.opts.tools.length) body.tools = normTools(a.opts.tools);
      if (a.opts.max_tokens) body.max_tokens = a.opts.max_tokens;
      if (a.opts.temperature != null) body.temperature = a.opts.temperature;
      if (a.opts.response_format) body.response_format = a.opts.response_format;
      if (a.opts.stream) { body.stream = true; body.stream_options = { include_usage: true }; }
      var resp;
      try { resp = await apiFetch(aiURL(c, '/chat/completions'), { method: 'POST', headers: aiHeaders(c), body: JSON.stringify(body) }); }
      catch (e) { throw err('ai_unreachable', 'Could not reach the AI endpoint: ' + (e.message || e)); }
      if (!resp.ok) {
        var t = ''; try { t = await resp.text(); } catch (e) {}
        var msg = t; try { var j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) {}
        throw err('ai_error_' + resp.status, String(msg || ('AI request failed (' + resp.status + ')')).slice(0, 500), { success: false, status: resp.status });
      }
      if (a.opts.stream) {
        var it = streamSSE(resp);
        it.toString = function () { return '[stream]'; };
        return it;
      }
      var data = await resp.json();
      var ch = (data.choices && data.choices[0]) || {};
      return chatResult(ch.message || { content: '' }, { finish_reason: ch.finish_reason, usage: data.usage, model: data.model });
    },
    async complete(prompt, opts) { return ai.chat(prompt, opts || {}); },
    async txt2img(prompt, opts) {
      if (opts === true) { var ti = new Image(); ti.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="#e9e4da"/></svg>'); return ti; }
      var c = aiConfig(); if (!c) throw aiOff();
      if (typeof prompt === 'object' && prompt) { opts = prompt; prompt = prompt.prompt; }
      var resp = await apiFetch(aiURL(c, '/images/generations'), { method: 'POST', headers: aiHeaders(c), body: JSON.stringify({ model: c.imageModel || (opts && opts.model) || 'gpt-image-1', prompt: String(prompt), n: 1, size: (opts && opts.size) || '1024x1024' }) });
      if (!resp.ok) throw err('ai_error_' + resp.status, 'Image generation failed (' + resp.status + ')');
      var j = await resp.json(), d = (j.data || [])[0] || {};
      var img = new Image(); img.alt = String(prompt);
      img.src = d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url;
      return img;
    },
    async img2txt(image, prompt) {
      var url = image;
      if (image instanceof Blob) url = await new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.readAsDataURL(image); });
      var res = await ai.chat(typeof prompt === 'string' ? prompt : 'Transcribe all text in this image. Reply with the text only.', url);
      return res.toString();
    },
    async txt2speech(text, opts) {
      var c = aiConfig();
      if (c && c.tts !== false) {
        try {
          var resp = await apiFetch(aiURL(c, '/audio/speech'), { method: 'POST', headers: aiHeaders(c), body: JSON.stringify({ model: c.ttsModel || 'tts-1', input: String(text), voice: (opts && opts.voice) || 'alloy' }) });
          if (resp.ok) { var a = new Audio(URL.createObjectURL(await resp.blob())); return a; }
        } catch (e) {}
      }
      return speakFallback(text, typeof opts === 'string' ? { language: opts } : opts);
    },
    async speech2txt(audio) {
      var c = aiConfig(); if (!c) throw aiOff();
      var fd = new FormData(); fd.append('file', audio instanceof Blob ? audio : await (await nativeFetch(audio)).blob(), 'audio.webm'); fd.append('model', c.sttModel || 'whisper-1');
      var h = aiHeaders(c); delete h['content-type'];
      var resp = await apiFetch(aiURL(c, '/audio/transcriptions'), { method: 'POST', headers: h, body: fd });
      if (!resp.ok) throw err('ai_error_' + resp.status, 'Transcription failed (' + resp.status + ')');
      var j = await resp.json(); return { text: j.text || '' , toString: function () { return j.text || ''; } };
    },
    async listModels() { var c = aiConfig(); return c ? [{ id: c.model || 'default', provider: c.builtin ? 'everything-hub' : 'custom' }] : []; },
    async listModelProviders() { return aiConfig() ? ['local'] : []; },
  };
  ai.speech = ai.txt2speech;
  ai.txt2vid = async function () { throw err('not_supported', 'Video generation is not available in Pravahahub.'); };

  /* ------------------------------------------------------------------- email */
  var OUTBOX = 'everything:outbox';
  function blobB64(b) { return new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(String(fr.result).split(',')[1] || ''); }; fr.onerror = function () { r(''); }; fr.readAsDataURL(b); }); }
  function outbox() { try { return JSON.parse(LS.getItem(OUTBOX) || '[]'); } catch (e) { return []; } }
  var email = {
    async send(msg) {
      msg = msg || {};
      var to = [].concat(msg.to || []);
      if (ONLINE && to.length) {
        try {
          var r = await apiFetch(ORIGIN + '/api/email/send', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ehub-auth': AUTH_TOKEN },
            body: JSON.stringify({ app: APP, to: to, cc: [].concat(msg.cc || []), bcc: [].concat(msg.bcc || []), subject: msg.subject || '', text: msg.text || '', html: msg.html || '', reply_to: msg.reply_to || msg.replyTo,
              attachments: await Promise.all((msg.attachments || []).map(async function (a) { return { filename: a.filename, contentType: a.contentType, content: typeof a.content === 'string' ? a.content : a.content instanceof Blob ? await blobB64(a.content) : '' }; })) }) });
          var j = await r.json().catch(function () { return {}; });
          if (r.ok && j.delivered) { post('toast', { message: 'Email sent.' }); return { delivered: j.delivered, failed: j.failed || [], suppressed: [], id: j.id }; }
          if (j && j.configured !== false && !r.ok) throw err('email_failed', j.message || 'The email could not be sent.');
        } catch (e) { if (e && e.code === 'email_failed') throw e; }
      }
      var rec = { id: String(Date.now()).padStart(15, '0') + '-' + rid(3), app: APP, at: Date.now(), to: to, cc: [].concat(msg.cc || []), subject: msg.subject || '', text: msg.text || '', html: msg.html ? String(msg.html).slice(0, 200000) : undefined, attachments: (msg.attachments || []).map(function (a) { return { filename: a.filename, contentType: a.contentType }; }) };
      var box = outbox(); box.push(rec); try { LS.setItem(OUTBOX, JSON.stringify(box.slice(-200))); } catch (e) {}
      post('toast', { message: 'Not sent: email isn’t set up on this hub yet. A copy is in your Outbox.' });
      return { delivered: [], failed: to, suppressed: [], local: true, outbox: true, id: rec.id, code: 'email_not_configured', message: 'Email isn’t set up on this hub yet, so nothing was sent. A copy is in your Outbox.' };
    },
    async sendTransactional(msg) { return email.send(msg); },
    async list(opts) {
      var folder = opts && opts.folder;
      var items = folder && folder !== 'sent' ? [] : outbox().slice().reverse().map(function (m) { return { id: m.id, folder: 'sent', subject: m.subject, to: m.to, date: new Date(m.at).toISOString(), size: (m.text || '').length }; });
      return { items: items.slice(0, (opts && opts.limit) || 50), cursor: undefined };
    },
    async get(opts) { var id = opts && (opts.id || opts); var m = outbox().filter(function (x) { return x.id === id; })[0]; return m ? Object.assign({ from: USER.email }, m) : null; },
  };

  /* ----------------------------------------------- workers / hosting (local) */
  var WK = 'everything:workers', HK = 'everything:hosting';
  function readJ(k, d) { try { return JSON.parse(LS.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function writeJ(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function workerName(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || ('w-' + rid(4)); }
  var workers = {
    async create(name, filePath) {
      var n = workerName(name), all = readJ(WK, {});
      all[n] = { name: n, url: 'https://' + n + '.ehub.work', file_path: normPath(filePath || ''), app: APP, created_at: new Date().toISOString() };
      writeJ(WK, all);
      if (ONLINE) {
        try {
          var r = await apiFetch(ORIGIN + '/api/w/' + encodeURIComponent(APP) + '/' + n + '/__deploy', { method: 'POST', headers: { 'x-ehub-auth': AUTH_TOKEN } });
          if (!r.ok) { var j = await r.json().catch(function () { return {}; }); return { success: false, name: n, errors: [j.message || 'This app has no team server on Pravahahub.'] }; }
        } catch (e) { return { success: false, name: n, errors: ['Could not reach the Pravahahub server.'] }; }
      }
      return { success: true, name: n, url: all[n].url, file_path: all[n].file_path, errors: [] };
    },
    async get(name) { var w = readJ(WK, {})[workerName(name)]; return w ? Object.assign({}, w) : undefined; },
    async list() { var all = readJ(WK, {}); return Object.keys(all).map(function (k) { return all[k]; }); },
    async delete(name) { var all = readJ(WK, {}); delete all[workerName(name)]; writeJ(WK, all); return true; },
    async exec(url, init) {
      init = Object.assign({}, init || {});
      var h = new Headers(init.headers || (url && url.headers) || {});
      if (h.has('x-ehub-no-auth')) h.delete('x-ehub-no-auth');
      else { h.set('x-ehub-auth', AUTH_TOKEN); if (!h.has('ehub-auth')) h.set('ehub-auth', AUTH_TOKEN); }
      var proofs = [];
      h.forEach(function (v, k) { if (/^x-[a-z-]+-proof$/.test(k)) proofs.push(v); });
      for (var pi = 0; pi < proofs.length; pi++) {
        try { var pj = JSON.parse(proofs[pi]); if (pj && pj.path) { var pb = await fs.read(pj.path); if (pb.size <= 4096) { h.set('x-ehub-proof-path', encodeURIComponent(normPath(pj.path))); h.set('x-ehub-proof-file', b64url(await pb.text())); } } } catch (e) {}
      }
      init.headers = h;
      var target = workerTarget(url) || String(url && url.url ? url.url : url);
      if (isBlockedURL(target)) return refusedResponse(target);
      return apiFetch(target, init);
    },
    async getLoggingHandle() { return { close: function () {}, addEventListener: function () {} }; },
  };
  // Hosting: a folder on the drive published at <hub>/s/<name>/ (public, sandboxed). The server keeps a copy;
  // writes, moves and deletes under a published folder are pushed to it automatically while online.
  function siteName(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63); }
  function siteURL(n) { return ORIGIN + '/s/' + n + '/'; }
  async function siteCall(method, sub, rel, body) {
    var u = ORIGIN + '/api/site/' + encodeURIComponent(sub) + (rel != null ? '/f/' + String(rel).split('/').map(encodeURIComponent).join('/') : '');
    var r = await apiFetch(u, { method: method, headers: { 'x-ehub-auth': AUTH_TOKEN }, body: body });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw err(r.status === 409 ? 'subdomain_taken' : r.status === 404 ? 'subject_does_not_exist' : 'hosting_error', j.message || ('Publishing failed (' + r.status + ')'), { status: r.status });
    return j;
  }
  async function siteUpload(sub, dir) {
    var n = await getNode(dir); if (!n) return 0;
    var files = n.is_dir ? (await allUnder(dir)).filter(function (x) { return !x.is_dir; }) : [n];
    for (var i = 0; i < files.length; i++) { var rel = n.is_dir ? files[i].path.slice(dir.length + 1) : 'index.html'; await siteCall('PUT', sub, rel, await fs.read(files[i].path)); }
    return files.length;
  }
  var hostQ = Promise.resolve();
  function hostSync(kind, path, extra) {
    if (!ONLINE) return;
    var all = readJ(HK, {}), subs = Object.keys(all); if (!subs.length) return;
    subs.forEach(function (sub) {
      var d = all[sub].root_dir && all[sub].root_dir.path; if (!d) return;
      var inside = function (p) { return p === d || String(p).indexOf(d + '/') === 0; };
      var rel = function (p) { return p === d ? '' : String(p).slice(d.length + 1); };
      var jobs = [];
      if (extra && extra.from && inside(extra.from)) jobs.push(function () { return siteCall('DELETE', sub, rel(extra.from) || '*'); });
      if ((kind === 'write' || kind === 'rename') && inside(path) && path !== d) jobs.push(async function () {
        var n = await getNode(path); if (!n) return;
        if (n.is_dir) { var kids = (await allUnder(path)).filter(function (x) { return !x.is_dir; }); for (var i = 0; i < kids.length; i++) await siteCall('PUT', sub, rel(kids[i].path), await fs.read(kids[i].path)); }
        else await siteCall('PUT', sub, rel(path), await fs.read(path));
      });
      if (kind === 'delete' && inside(path)) jobs.push(function () { return siteCall('DELETE', sub, rel(path) || '*'); });
      jobs.forEach(function (j) { hostQ = hostQ.then(j).catch(function (e) { console.warn('[everything-core] publish sync failed', e && e.message); }); });
    });
  }
  var hosting = {
    async create(subdomain, dir) {
      if (subdomain && typeof subdomain === 'object') { dir = subdomain.root_dir; subdomain = subdomain.subdomain; }
      var sub = siteName(subdomain) || ('site-' + rid(4));
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(sub)) throw err('invalid_subdomain', 'Site names use letters, digits and dashes (2-63 characters).');
      var all = readJ(HK, {});
      var root = dir ? normPath(dir && dir.path ? dir.path : dir) : null;
      if (ONLINE) { await siteCall('POST', sub); if (root) await siteUpload(sub, root); }
      else if (all[sub]) throw err('subdomain_taken', 'Subdomain already exists');
      all[sub] = { uid: 'site-' + rid(6), subdomain: sub, root_dir: root ? { path: root, name: basename(root) } : null, url: siteURL(sub), created_at: new Date().toISOString(), app: APP };
      writeJ(HK, all); return Object.assign({}, all[sub]);
    },
    async update(subdomain, dir) {
      var sub = siteName(subdomain), all = readJ(HK, {});
      if (!all[sub]) throw err('subject_does_not_exist', 'Subdomain does not exist');
      var root = normPath(dir && dir.path ? dir.path : dir);
      if (ONLINE) { await siteCall('DELETE', sub, '*'); await siteUpload(sub, root); }
      all[sub].root_dir = { path: root, name: basename(root) }; writeJ(HK, all); return Object.assign({}, all[sub]);
    },
    async get(subdomain) { var s = readJ(HK, {})[siteName(subdomain)]; if (!s) throw err('subject_does_not_exist', 'Subdomain does not exist'); return Object.assign({}, s); },
    async list() { var all = readJ(HK, {}); return Object.keys(all).map(function (k) { return Object.assign({}, all[k]); }); },
    async delete(subdomain) {
      var sub = siteName(subdomain), all = readJ(HK, {});
      if (ONLINE) { try { await siteCall('DELETE', sub); } catch (e) { if (e.code !== 'subject_does_not_exist') throw e; } }
      delete all[sub]; writeJ(HK, all); return { success: true };
    },
  };
  var apps = {
    async list() { return []; }, async get(name) { return { name: name || APP, uid: 'app-' + (name || APP), title: name || APP, index_url: location.href }; },
    async create(o) { return Object.assign({ uid: 'app-' + rid(4) }, typeof o === 'object' ? o : { name: o }); }, async update(n, o) { return Object.assign({ name: n }, o); }, async delete() { return true; },
  };

  /* -------------------------------------------------------------------- peer */
  var peer = (function () {
    var CH = 'everything:peer', NO_HOST_MS = ONLINE ? 9000 : 2500;
    var rand = function (n) { return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(n || 6)), function (b) { return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]; }).join(''); };
    var ev = function (type, props) { return Object.assign(new Event(type), props || {}); };
    var me = { uuid: USER.uuid + ':' + rid(3), username: USERNAME };
    function Conn(pc, o) {
      var t = new EventTarget(); var self = this;
      ['addEventListener', 'removeEventListener', 'dispatchEvent'].forEach(function (m) { self[m] = t[m].bind(t); });
      this.peerconnection = pc; this.owner = o && o.owner || null; this.room = o && o.room; this.connected = false; this.closed = false; this._dc = null;
      var fire = function (type, props) { var e = ev(type, props); self.dispatchEvent(e); var h = self['on' + type]; if (typeof h === 'function') h(e); };
      this._fire = fire;
      pc.addEventListener('connectionstatechange', function () {
        if (self._relay || self.closed || self.peerconnection !== pc) return;
        if (pc.connectionState === 'failed' && !self.connected && self._preFail) { var pf = self._preFail; self._preFail = null; pf(); return; }
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') self._closed('connection ' + pc.connectionState);
      });
    }
    Conn.prototype.attach = function (dc) {
      var self = this; this._dc = dc;
      dc.onopen = function () { if (self.closed) return; self.connected = true; self._fire('open'); };
      dc.onmessage = function (e) { self._fire('message', { data: e.data }); };
      dc.onclose = function () { if (!self._relay) self._closed('channel closed'); };
      if (dc.readyState === 'open') dc.onopen();
    };
    Conn.prototype.send = function (d) { if (this._relay && !(this._relay.keepDc && this._dc && this._dc.readyState === 'open')) return relayConnSend(this, d); if (!this.connected || !this._dc || this._dc.readyState !== 'open') throw new Error('Connection is not open'); this._dc.send(d); };
    Conn.prototype.close = function (reason) { if (this.closed) return; if (this._relay) { try { relaySend(this, { t: 'rbye' }); } catch (e) {} } this.closed = true; this.connected = false; if (this._relay) relayEnd(this); try { this._dc && this._dc.close(); } catch (e) {} try { this.peerconnection.close(); } catch (e) {} this._fire('close', { reason: reason }); };
    Conn.prototype._closed = function (reason) { if (this.closed) return; this.closed = true; this.connected = false; if (this._relay) relayEnd(this); try { this.peerconnection.close(); } catch (e) {} this._fire('close', { reason: reason }); };
    Conn.prototype.on = function (t, fn) { this.addEventListener(t, fn); return this; };
    function Server(code) { var t = new EventTarget(), self = this; ['addEventListener', 'removeEventListener', 'dispatchEvent'].forEach(function (m) { self[m] = t[m].bind(t); }); this.inviteCode = code; this.name = code; this.connections = new Map(); this.closed = false; }
    Server.prototype.setGuestGrant = function () {};
    Server.prototype.on = function (t, fn) { this.addEventListener(t, fn); return this; };
    Server.prototype.close = function () { if (this.closed) return; this.closed = true; this.connections.forEach(function (c) { c.close('server closed'); }); this.connections.clear(); this._onClose && this._onClose(); };
    var bus = null; try { bus = new BroadcastChannel(CH); } catch (e) {}
    var servers = new Map(), dials = new Map(), serving = new Map(), RTC = { iceServers: ONLINE ? [{ urls: ['stun:stun.cloudflare.com:3478'] }] : [] };
    // ICE servers come from the hub (/api/turn): Cloudflare TURN relays when the server has a TURN key, else STUN.
    // Without a relay, peers behind carrier-grade or symmetric NATs (most phones on mobile data) cannot connect.
    var iceCache = null, iceAt = 0, iceTTL = 0;
    function iceConfig() {
      if (!ONLINE) return Promise.resolve(RTC);
      if (iceCache && Date.now() - iceAt < iceTTL) return iceCache;
      iceAt = Date.now(); iceTTL = 60 * 1000;
      iceCache = (async function () {
        try {
          var r = await Promise.race([apiFetch(ORIGIN + '/api/turn', { headers: { 'x-ehub-auth': AUTH_TOKEN } }), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 5000); })]);
          var j = r.ok ? await r.json() : null;
          if (j && Array.isArray(j.iceServers) && j.iceServers.length) {
            iceTTL = Math.max(60, Math.min(Number(j.ttl) || 3600, 86400)) * 800; // refresh at 80% of the credential lifetime
            return { iceServers: j.iceServers };
          }
        } catch (e) {}
        iceTTL = 30 * 1000;
        return RTC;
      })();
      return iceCache;
    }
    // One signalling socket per code. It stays up (reconnecting with backoff, kept alive by pings) for as long as
    // something still needs that code: a room we serve, or a connection being set up / alive on it. A host whose
    // socket silently died could not be reached by anyone joining later.
    var sockets = new Map();
    function sigWanted(code) {
      var sv = servers.get(code); if (sv && !sv.closed) return true;
      var want = false;
      connCode.forEach(function (c, id) { if (c === code && ((dials.get(id) && !dials.get(id).conn.closed) || (serving.get(id) && !(serving.get(id).conn && serving.get(id).conn.closed)))) want = true; });
      return want;
    }
    function sigOpen(code, rec) {
      if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
      var ws;
      try { ws = new NWS(ORIGIN.replace(/^http/, 'ws') + '/api/peer/' + encodeURIComponent(code) + '?sid=' + rec.sid); ws.binaryType = 'arraybuffer'; } catch (e) { return; }
      rec.ws = ws;
      ws.onopen = function () { rec.tries = 0; var q = rec.q.splice(0); q.forEach(function (m) { try { ws.send(m); } catch (e) {} }); clearInterval(rec.ping); rec.ping = setInterval(function () { try { ws.readyState === 1 && ws.send('{"t":"ping"}'); } catch (e) {} }, 25000); };
      ws.onmessage = function (e) { if (typeof e.data !== 'string') { relayBinary(e.data); return; } var m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m && (m.t === 'ping' || m.t === 'pong')) return; handle(m); };
      ws.onclose = function () {
        clearInterval(rec.ping); if (rec.ws === ws) rec.ws = null;
        if (sockets.get(code) !== rec) return;
        if (!sigWanted(code)) { sockets.delete(code); return; }
        rec.timer = setTimeout(function () { if (sockets.get(code) === rec && !rec.ws) sigOpen(code, rec); }, Math.min(15000, 400 * Math.pow(2, rec.tries++)));
      };
    }
    function sig(code) {
      code = String(code); if (!ONLINE || typeof WebSocket === 'undefined') return null;
      var rec = sockets.get(code); if (rec) return rec;
      rec = { q: [], ws: null, tries: 0, timer: null, ping: null, sid: rand(12) };
      sockets.set(code, rec); sigOpen(code, rec); return rec;
    }
    function sigSend(code, msg) { var r = sig(code); if (!r) return; var d = JSON.stringify(msg); if (r.ws && r.ws.readyState === 1) r.ws.send(d); else { r.q.push(d); if (r.q.length > 200) r.q.shift(); if (!r.ws && !r.timer) sigOpen(code, r); } }
    function sigClose(code) { var r = sockets.get(String(code)); if (r) { sockets.delete(String(code)); clearInterval(r.ping); clearTimeout(r.timer); try { r.ws && r.ws.close(); } catch (e) {} } }
    function sigRevive() { sockets.forEach(function (r, code) { if ((!r.ws || r.ws.readyState > 1) && sigWanted(code)) { r.tries = 0; r.ws = null; sigOpen(code, r); } }); }
    try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sigRevive(); }); window.addEventListener('online', sigRevive); } catch (e) {}
    var connCode = new Map();
    function postBus(msg) {
      try { bus && bus.postMessage(msg); } catch (e) {}
      var code = msg.code || connCode.get(msg.connId); if (code) sigSend(code, msg);
      handle(msg);
    }
    if (bus) bus.onmessage = function (e) { handle(e.data); };
    async function feed(rec, c) { if (!rec.pc.remoteDescription) { rec.queued.push(c); return; } try { await rec.pc.addIceCandidate(c || undefined); } catch (e) {} }
    async function flush(rec) { var q = rec.queued.splice(0); for (var i = 0; i < q.length; i++) await feed(rec, q[i]); }
    async function handle(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (/^(relay|relay-ok|rd|rhb|rbye|rctl|rmst|rask)$/.test(msg.t)) { if (msg.dst) relayHandle(msg); return; }
      if (msg.t === 'dial') {
        var srv = servers.get(msg.code); if (!srv || srv.closed || serving.has(msg.connId)) return;
        var pend = { pc: { remoteDescription: null }, conn: null, queued: [], peerSid: msg.sid ? String(msg.sid) : null }; serving.set(msg.connId, pend); connCode.set(msg.connId, msg.code);
        var cfg = await iceConfig(); if (srv.closed || serving.get(msg.connId) !== pend) { if (serving.get(msg.connId) === pend) serving.delete(msg.connId); return; }
        var pc = new RTCPeerConnection(cfg), conn = new Conn(pc, { owner: Object.assign({}, me), room: /^[a-z]/.test(msg.code) ? msg.code : undefined });
        var rec = pend; rec.pc = pc; rec.conn = conn; serving.set(msg.connId, rec); connCode.set(msg.connId, msg.code); trackConn(conn, msg.connId, 'server', msg.code);
        pc.ondatachannel = function (e) { conn.attach(e.channel); };
        conn._preFail = function () { setTimeout(function () { if (!conn._relay && !conn.connected && !conn.closed) conn._closed('connection failed'); }, RELAY_OK_MS + 6000); };
        pc.onicecandidate = function (e) { postBus({ t: 'ice', connId: msg.connId, to: 'dialer', candidate: e.candidate ? e.candidate.toJSON() : null }); };
        conn.addEventListener('close', function () { serving.delete(msg.connId); srv.connections.delete(msg.connId); });
        try { await pc.setRemoteDescription(msg.offer); await pc.setLocalDescription(await pc.createAnswer()); } catch (e) { conn.close('bad offer'); return; }
        srv.connections.set(msg.connId, conn);
        postBus({ t: 'answer', connId: msg.connId, answer: pc.localDescription.toJSON(), owner: Object.assign({}, me), sid: (sig(msg.code) || {}).sid });
        await flush(rec);
        var ce = ev('connection', { conn: conn, user: msg.from ? Object.assign({}, msg.from) : undefined });
        srv.dispatchEvent(ce); if (typeof srv.onconnection === 'function') srv.onconnection(ce);
        return;
      }
      if (msg.t === 'answer') {
        var r = dials.get(msg.connId); if (!r || r.answered) return;
        r.answered = true; clearTimeout(r.timer); r.conn.owner = msg.owner || null; r.peerSid = msg.sid ? String(msg.sid) : null;
        if (r.peerSid && ONLINE) { var rid0 = msg.connId; r.relayT = setTimeout(function () { startRelay(rid0); }, RELAY_AFTER_MS); r.conn._preFail = function () { startRelay(rid0); }; }
        try { await r.pc.setRemoteDescription(msg.answer); } catch (e) { r.conn.close('bad answer'); return; }
        await flush(r); return;
      }
      if (msg.t === 'ice') { var rr = msg.to === 'dialer' ? dials.get(msg.connId) : serving.get(msg.connId); if (rr) await feed(rr, msg.candidate); }
    }
    /* ---- server relay fallback + media watchdog + diagnostics ---------------------------------------------
     * Direct WebRTC stays the first choice. Two things move a connection onto the hub's own PeerRoom socket
     * (our Cloudflare Worker; no TURN, nothing third-party):
     *  - no direct path: the data channel is not open RELAY_AFTER_MS after the answer, or ICE fails first. The
     *    whole connection (data + media) is then relayed;
     *  - a direct path that carries data but no media (the media watchdog): the far side reports it is sending,
     *    yet no inbound RTP bytes arrive for WD_FLAT_MS. Media then moves to the relay; data stays on the
     *    working data channel ("relay-media").
     * A relayed connection looks like a normal one to the app: 'open', send()/'message', publish()/unpublish()/
     * configure(), 'media' / 'mediaended' / 'linkstate'. Media formats are negotiated per side from what each
     * browser can really do: WebCodecs VP8 + Opus when both ends support them, else JPEG frames + 16 kHz PCM, which
     * need nothing beyond <canvas> and Web Audio. A format that fails at runtime (encoder errors, no decoded output)
     * is dropped for that link and the next one is used. */
    var PEER_V = 5;
    var RELAY_AFTER_MS = 8000, RELAY_OK_MS = 7000, RELAY_HB_MS = 4000, RELAY_DEAD_MS = 16000;
    var WD_MS = 2000, WD_FLAT_MS = 6000, WD_GRACE_MS = 8000;
    var relayed = new Map(); // '<my side>:<connId>' -> conn
    var allConns = new Set(); // every conn (direct or relayed), for the watchdog and diagnostics
    var relayStats = { txV: 0, txA: 0, rxV: 0, rxA: 0, outV: 0, outA: 0, txJ: 0, rxJ: 0, outJ: 0, txP: 0, rxP: 0, outP: 0, bytesOut: 0, bytesIn: 0, dropped: 0 };
    var diagErrs = [];
    function diagNote(kind, msg) { try { diagErrs.push({ t: Date.now(), k: String(kind).slice(0, 24), m: String(msg == null ? '' : (msg && msg.message) || msg).slice(0, 240) }); if (diagErrs.length > 60) diagErrs.splice(0, diagErrs.length - 60); } catch (e) {} }
    try { window.__ehubRelayStats = relayStats; } catch (e) {}
    var TE = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, TD = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    function abToB64(u8) { var s = '', C = 0x8000; for (var i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); }
    function b64ToAb(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }

    /* -- what this browser can encode/decode for the relay -- */
    var AC_CTOR = window.AudioContext || window.webkitAudioContext;
    var HAS_GEN = typeof MediaStreamTrackGenerator !== 'undefined';
    var HAS_MSTP = typeof MediaStreamTrackProcessor !== 'undefined';
    var HAS_VF = typeof VideoFrame !== 'undefined';
    var HAS_CAPSTREAM = typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    var HAS_WC = typeof VideoEncoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined' && HAS_VF;
    var HAS_WCD = typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
    var HAS_AC = typeof AudioEncoder !== 'undefined' && typeof EncodedAudioChunk !== 'undefined' && typeof AudioData !== 'undefined';
    var HAS_ACD = typeof AudioDecoder !== 'undefined' && typeof EncodedAudioChunk !== 'undefined';
    var HAS_WORKLET = !!(AC_CTOR && AC_CTOR.prototype && 'audioWorklet' in AC_CTOR.prototype);
    var HAS_SP = !!(AC_CTOR && AC_CTOR.prototype && typeof AC_CTOR.prototype.createScriptProcessor === 'function');
    var CAPS = {
      encV: [].concat(HAS_WC ? ['vp8'] : [], ['jpeg']),
      decV: [].concat(HAS_WCD && (HAS_GEN || HAS_CAPSTREAM) ? ['vp8'] : [], HAS_CAPSTREAM ? ['jpeg'] : []),
      encA: [].concat(HAS_AC && (HAS_MSTP || HAS_WORKLET) ? ['opus'] : [], AC_CTOR && (HAS_WORKLET || HAS_SP) ? ['pcm'] : []),
      decA: [].concat(HAS_ACD && (HAS_GEN || HAS_WORKLET) ? ['opus'] : [], AC_CTOR && (HAS_WORKLET || HAS_SP) && AC_CTOR.prototype.createMediaStreamDestination ? ['pcm'] : []),
      checked: false,
    };
    // A test or support hook: window.__ehubRelayForce = { v: 'jpeg', a: 'pcm' } pins the relay formats this page sends.
    function forced(k) { try { var f = window.__ehubRelayForce; return f && f[k] ? String(f[k]) : null; } catch (e) { return null; } }
    (async function checkCaps() {
      // The constructors can exist while the codec does not (some Android builds, privacy modes): ask.
      var drop = function (list, x) { var i = list.indexOf(x); if (i >= 0) list.splice(i, 1); };
      var q = function (p) { return Promise.race([p.then(function (r) { return !!(r && r.supported); }, function () { return false; }), new Promise(function (r) { setTimeout(function () { r(true); }, 3000); })]); };
      try { if (CAPS.encV.indexOf('vp8') >= 0 && !(await q(VideoEncoder.isConfigSupported({ codec: 'vp8', width: 640, height: 360, bitrate: 450000, framerate: 15 })))) drop(CAPS.encV, 'vp8'); } catch (e) { drop(CAPS.encV, 'vp8'); }
      try { if (CAPS.decV.indexOf('vp8') >= 0 && !(await q(VideoDecoder.isConfigSupported({ codec: 'vp8', codedWidth: 640, codedHeight: 360 })))) drop(CAPS.decV, 'vp8'); } catch (e) { drop(CAPS.decV, 'vp8'); }
      try { if (CAPS.encA.indexOf('opus') >= 0 && !(await q(AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 })))) drop(CAPS.encA, 'opus'); } catch (e) { drop(CAPS.encA, 'opus'); }
      try { if (CAPS.decA.indexOf('opus') >= 0 && !(await q(AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 })))) drop(CAPS.decA, 'opus'); } catch (e) { drop(CAPS.decA, 'opus'); }
      CAPS.checked = true;
    })();
    function myCaps(R) {
      var v = CAPS.decV.slice(), a = CAPS.decA.slice();
      if (R && R.badDec.v) v = v.filter(function (x) { return x !== 'vp8'; });
      if (R && R.badDec.a) a = a.filter(function (x) { return x !== 'opus'; });
      return { v: v, a: a, pv: PEER_V };
    }
    // An engine from before format negotiation sends no caps: it only knows VP8 + Opus.
    function normCaps(c) { return c && Array.isArray(c.v) && Array.isArray(c.a) ? { v: c.v.map(String).slice(0, 6), a: c.a.map(String).slice(0, 6), pv: Number(c.pv) || 0 } : { v: ['vp8'], a: ['opus'], pv: 0 }; }
    function pickMode(R, kind) {
      var f = forced(kind); if (f) return f;
      var mine = kind === 'v' ? CAPS.encV : CAPS.encA, theirs = R.far[kind] || [];
      for (var i = 0; i < mine.length; i++) { var m = mine[i]; if ((m === 'vp8' || m === 'opus') && R.bad[kind]) continue; if (theirs.indexOf(m) >= 0) return m; }
      return null;
    }

    /* -- shared audio context (relay capture/playback); unlocked by any user gesture -- */
    var audioCtx = null;
    function relayAudioCtx() {
      if (!audioCtx || audioCtx.state === 'closed') {
        try { audioCtx = new AC_CTOR({ sampleRate: 48000 }); } catch (e) { audioCtx = new AC_CTOR(); }
        try { audioCtx.addEventListener('statechange', function () { if (audioCtx && audioCtx.state === 'suspended') diagNote('audioctx', 'suspended'); }); } catch (e) {}
      }
      try { if (audioCtx.state !== 'running') { var pr = audioCtx.resume(); if (pr && pr.catch) pr.catch(function (e) { diagNote('audioctx', e); }); } } catch (e) {}
      return audioCtx;
    }
    function peerBusy() { return servers.size > 0 || dials.size > 0 || serving.size > 0 || allConns.size > 0; }
    function unlockMedia(force) {
      try {
        if (!AC_CTOR) return;
        if (audioCtx && audioCtx.state === 'running') return;
        if (audioCtx || force || peerBusy()) relayAudioCtx();
      } catch (e) {}
    }
    try { ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (t) { document.addEventListener(t, function () { unlockMedia(false); }, true); }); } catch (e) {}
    function hiddenHost() {
      var h = document.getElementById('ehub-relay-host');
      if (!h) {
        h = document.createElement('div'); h.id = 'ehub-relay-host'; h.setAttribute('aria-hidden', 'true');
        h.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
        (document.body || document.documentElement).appendChild(h);
      }
      return h;
    }

    function relayPC() {
      var t = new EventTarget();
      return { relayed: true, connectionState: 'connected', iceConnectionState: 'connected', signalingState: 'stable', iceGatheringState: 'complete',
        remoteDescription: { type: 'answer', sdp: '' }, localDescription: { type: 'offer', sdp: '' },
        addEventListener: t.addEventListener.bind(t), removeEventListener: t.removeEventListener.bind(t), dispatchEvent: t.dispatchEvent.bind(t),
        close: function () { this.connectionState = 'closed'; this.iceConnectionState = 'closed'; this.signalingState = 'closed'; },
        getStats: function () { return Promise.resolve(new Map()); }, getSenders: function () { return []; }, getReceivers: function () { return []; }, getTransceivers: function () { return []; } };
    }
    function relaySend(conn, obj) { var R = conn._relay; if (!R) return; obj.c = R.id; obj.to = R.to; obj.dst = R.sid; sigSend(R.code, obj); }
    function relayBadge() {
      var n = 0; relayed.forEach(function (c) { if (!c.closed) n++; });
      try {
        var el = document.getElementById('ehub-relay-badge');
        if (!n) { if (el) el.remove(); return; }
        if (!el) {
          el = document.createElement('div'); el.id = 'ehub-relay-badge'; el.setAttribute('role', 'status');
          el.title = 'No direct media path could be made from this network, so audio and video go through the Pravahahub server. Quality is reduced.';
          el.style.cssText = 'position:fixed;left:8px;top:max(8px,env(safe-area-inset-top));z-index:2147483646;padding:2px 9px;border-radius:999px;background:rgba(20,20,24,.72);color:#fff;font:600 11px/1.7 system-ui,-apple-system,sans-serif;pointer-events:none;letter-spacing:.2px;opacity:.9';
          (document.body || document.documentElement).appendChild(el);
        }
        el.textContent = 'Relayed via server';
      } catch (e) {}
    }

    /* -- connection registry (watchdog + diagnostics) -- */
    function trackConn(conn, id, side, code, peerSid) {
      conn._meta = { id: id, side: side, code: String(code), t0: Date.now(), openAt: 0, wd: null };
      allConns.add(conn);
      conn.addEventListener('open', function () { conn._meta.openAt = Date.now(); });
      conn.addEventListener('close', function (e) { conn._meta.closedAt = Date.now(); conn._meta.reason = e && e.reason || ''; setTimeout(function () { allConns.delete(conn); }, 60000); });
    }
    function farSid(conn) {
      var m = conn._meta; if (!m) return null;
      if (m.side === 'dialer') { var d = dials.get(m.id); return d && d.peerSid; }
      var s = serving.get(m.id); return s && s.peerSid;
    }
    function sideConn(to, id) { var r = to === 'dialer' ? dials.get(id) : serving.get(id); return r && r.conn; }

    function goRelay(conn, code, connId, side, peerSid, farCaps, keep) {
      if (conn.closed || conn._relay) return;
      keep = !!(keep && conn.connected && conn._dc && conn._dc.readyState === 'open');
      var R = conn._relay = { code: String(code), id: connId, side: side, to: side === 'dialer' ? 'server' : 'dialer', sid: peerSid, last: Date.now(), out: [], outBytes: 0, flushT: null,
        slots: new Map(), remote: new Map(), unstable: false, far: normCaps(farCaps), keepDc: keep, bad: { v: 0, a: 0 }, badDec: { v: 0, a: 0 }, since: Date.now(),
        cnt: { txV: 0, txA: 0, rxV: 0, rxA: 0, outV: 0, outA: 0, encErr: 0, decErr: 0, dropped: 0 } };
      relayed.set(side + ':' + connId, conn);
      if (keep) {
        // Data keeps flowing on the direct channel; only media moves. Stop the direct senders so the broken path
        // carries nothing.
        try { conn.peerconnection.getSenders().forEach(function (s) { if (s.track) s.replaceTrack(null).catch(function () {}); }); } catch (e) {}
        conn.relayed = 'media';
      } else {
        try { if (conn._dc) { conn._dc.onopen = null; conn._dc.onmessage = null; conn._dc.onclose = null; } } catch (e) {}
        var pc = conn.peerconnection; conn.peerconnection = relayPC(); conn.relayed = true;
        try { pc.close(); } catch (e) {}
      }
      R.hb = setInterval(function () {
        if (conn.closed) { clearInterval(R.hb); return; }
        var idle = Date.now() - R.last, dcUp = R.keepDc && conn._dc && conn._dc.readyState === 'open';
        if (idle > RELAY_DEAD_MS && !dcUp) { conn._closed('channel closed'); return; }
        if (idle > RELAY_HB_MS * 2 + 500 && !R.unstable && !dcUp) { R.unstable = true; conn._fire('linkstate', { state: 'unstable' }); }
        relaySend(conn, { t: 'rhb' });
        R.slots.forEach(function (slot, name) { syncSlot(conn, name); });
      }, RELAY_HB_MS);
      var prevSlots = conn.__mediaSlots;
      installRelayMedia(conn);
      // Streams the app already published on the direct path are carried over to the relay.
      if (prevSlots && prevSlots.forEach) prevSlots.forEach(function (sl, name) { try { if (sl && sl.stream) conn.publish(name, sl.stream, sl.profile ? { video: sl.profile } : undefined); } catch (e) {} });
      relayBadge();
      diagNote('relay', (keep ? 'media relayed (direct data channel kept)' : 'no direct path; relaying') + ' as ' + side + ' v=' + pickMode(R, 'v') + ' a=' + pickMode(R, 'a'));
      try { console.warn('[ehub.peer] relaying ' + (keep ? 'media' : 'the connection') + ' through the server (' + side + ')'); } catch (e) {}
      if (!conn.connected) { conn.connected = true; conn._fire('open'); }
      conn._fire('linkstate', { state: 'connected' });
    }
    function relayEnd(conn) {
      var R = conn._relay; if (!R || R.ended) return; R.ended = true;
      clearInterval(R.hb); clearTimeout(R.flushT);
      R.slots.forEach(function (slot) { slot.tx.forEach(function (p) { try { p.stop(); } catch (e) {} }); });
      R.remote.forEach(function (rm) { endRemote(rm); });
      relayed.delete(R.side + ':' + R.id);
      relayBadge();
    }
    // dialer: ask the server side to relay. force: the direct link is up but carries no media.
    function startRelay(connId, force) {
      var r = dials.get(connId); if (!r || r.conn.closed || r.relayWait || r.conn._relay) return;
      if (r.conn.connected && !force) return;
      var code = connCode.get(connId), me = code ? sig(code) : null;
      if (!ONLINE || !r.peerSid || !me) return;
      r.relayWait = setTimeout(function () {
        r.relayWait = null;
        if (r.conn.closed || r.conn._relay) return;
        // No relay either: close without a reason, i.e. "this network could not reach the other side".
        if (!r.conn.connected) { diagNote('relay', 'no direct path and the server relay did not answer'); try { console.warn('[ehub.peer] no direct path and the server relay did not answer'); } catch (e) {} r.conn._closed(); }
        else diagNote('relay', 'media relay request not answered');
      }, RELAY_OK_MS);
      sigSend(code, { t: 'relay', c: connId, to: 'server', dst: r.peerSid, sid: me.sid, caps: myCaps(null), keep: r.conn.connected ? 1 : 0 });
    }
    function relayHandle(msg) {
      if (msg.t === 'relay') {
        var sv = serving.get(msg.c); if (!sv || !sv.conn || sv.conn.closed || !msg.sid) return;
        var code = connCode.get(msg.c), me = sig(code); if (!me) return;
        sv.peerSid = String(msg.sid);
        if (!sv.conn._relay) goRelay(sv.conn, code, msg.c, 'server', String(msg.sid), msg.caps, msg.keep);
        else { sv.conn._relay.sid = String(msg.sid); if (msg.caps) sv.conn._relay.far = normCaps(msg.caps); }
        relaySend(sv.conn, { t: 'relay-ok', sid: me.sid, caps: myCaps(sv.conn._relay), keep: sv.conn._relay && sv.conn._relay.keepDc ? 1 : 0 });
        return;
      }
      if (msg.t === 'relay-ok') {
        var d = dials.get(msg.c); if (!d || d.conn.closed || msg.to !== 'dialer') return;
        if (d.conn._relay) { d.conn._relay.last = Date.now(); return; }
        if (!d.relayWait) return;
        clearTimeout(d.relayWait); d.relayWait = null; clearTimeout(d.relayT);
        goRelay(d.conn, connCode.get(msg.c), msg.c, 'dialer', String(msg.sid || d.peerSid), msg.caps, msg.keep);
        return;
      }
      if (msg.t === 'rmst' || msg.t === 'rask') {
        var dc0 = sideConn(msg.to, msg.c); if (!dc0 || dc0.closed || !dc0._meta) return;
        if (msg.t === 'rask') { if (dc0._meta.side === 'dialer') startRelay(dc0._meta.id, true); return; }
        var W = dc0._meta.wd || (dc0._meta.wd = newWd()), now = Date.now(), s = Number(msg.s) || 0;
        W.far = { at: now, o: Number(msg.o) || 0, s: s, sv: Number(msg.sv) || 0, i: Number(msg.i) || 0, since: s > 0 ? (W.far && W.far.since) || now : 0 };
        return;
      }
      var conn = relayed.get(msg.to + ':' + msg.c); if (!conn || conn.closed) return;
      var R = conn._relay; R.last = Date.now();
      if (R.unstable) { R.unstable = false; conn._fire('linkstate', { state: 'connected' }); }
      if (msg.t === 'rd') conn._fire('message', { data: msg.b != null ? b64ToAb(msg.b) : msg.d });
      else if (msg.t === 'rbye') conn._closed('channel closed');
      else if (msg.t === 'rctl') {
        if (msg.op === 'key') { var sl = R.slots.get(String(msg.name)); var vp = sl && sl.tx.get('video'); if (vp && vp.key) vp.key(); }
        else if (msg.op === 'unpub') { var rm = R.remote.get(String(msg.name)); if (rm) { endRemote(rm); R.remote.delete(String(msg.name)); conn._fire('mediaended', { name: String(msg.name) }); } }
        else if (msg.op === 'caps' && msg.caps) {
          // The far side cannot use what we send (decoder errors / no output there): switch format.
          R.far = normCaps(msg.caps); diagNote('relay', 'far side asked for v=' + R.far.v.join('/') + ' a=' + R.far.a.join('/'));
          R.slots.forEach(function (slot, name) { syncSlot(conn, name); });
        }
      }
    }
    function relayConnSend(conn, d) {
      if (conn.closed) throw new Error('Connection is not open');
      if (typeof d === 'string') { relaySend(conn, { t: 'rd', d: d }); return; }
      if (d instanceof ArrayBuffer) { relaySend(conn, { t: 'rd', b: abToB64(new Uint8Array(d)) }); return; }
      if (ArrayBuffer.isView(d)) { relaySend(conn, { t: 'rd', b: abToB64(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) }); return; }
      if (typeof Blob !== 'undefined' && d instanceof Blob) { d.arrayBuffer().then(function (ab) { if (!conn.closed) relaySend(conn, { t: 'rd', b: abToB64(new Uint8Array(ab)) }); }); return; }
      relaySend(conn, { t: 'rd', d: String(d) });
    }

    /* -- media watchdog: a direct link whose data channel works but whose media never arrives -- */
    function newWd() { return { hist: [], far: null, asked: 0, tries: 0, inB: 0, outB: 0, sending: 0, flatFor: 0 }; }
    function wdTick() {
      allConns.forEach(function (conn) {
        if (conn.closed || !conn.connected || conn._relay || !conn._meta) return;
        var pc = conn.peerconnection; if (!pc || pc.relayed || typeof pc.getStats !== 'function') return;
        var m = conn._meta, W = m.wd || (m.wd = newWd());
        pc.getStats().then(function (st) {
          if (conn.closed || conn._relay) return;
          var inB = 0, outB = 0, sending = 0, vB = 0, fd = 0, now = Date.now();
          st.forEach(function (r) { if (r.type === 'inbound-rtp') { inB += r.bytesReceived || 0; if ((r.kind || r.mediaType) === 'video') { vB += r.bytesReceived || 0; fd += r.framesDecoded || 0; } } else if (r.type === 'outbound-rtp') outB += r.bytesSent || 0; });
          var sendingV = 0;
          try { pc.getSenders().forEach(function (s) { if (s.track && s.track.readyState === 'live') { sending++; if (s.track.kind === 'video') sendingV++; } }); } catch (e) {}
          W.inB = inB; W.outB = outB; W.sending = sending;
          W.hist.push([now, inB, vB, fd]); while (W.hist.length > 1 && now - W.hist[0][0] > WD_FLAT_MS + 3000) W.hist.shift();
          var dst = farSid(conn);
          if (dst) sigSend(m.code, { t: 'rmst', c: m.id, to: m.side === 'dialer' ? 'server' : 'dialer', dst: dst, o: outB, s: sending, sv: sendingV, i: inB });
          var F = W.far;
          if (!F || now - F.at > 7000 || !F.s || !F.since || now - F.since < WD_GRACE_MS || !m.openAt || now - m.openAt < WD_GRACE_MS) { W.flatFor = 0; return; }
          var old = null; for (var i = 0; i < W.hist.length; i++) if (now - W.hist[i][0] >= WD_FLAT_MS) old = W.hist[i];
          if (!old) return;
          // Media counts as arriving when bytes come in, unless video bytes keep coming and nothing decodes.
          var undecoded = vB - old[2] > 30000 && fd === old[3], noVideo = F.sv > 0 && vB === old[2];
          if (inB > old[1] && !undecoded && !noVideo) { W.flatFor = 0; return; }
          W.flatFor = now - old[0];
          W.why = inB === old[1] ? 'no media arrived' : undecoded ? 'video arrives (' + (vB - old[2]) + ' B) but no frame decodes' : 'no video arrived (audio does)';
          if (W.tries >= 3 || now - W.asked < 20000) return;
          W.asked = now; W.tries++;
          diagNote('watchdog', 'direct link is up but ' + W.why + ' for ' + Math.round(W.flatFor / 1000) + 's while the far side sends ' + F.s + ' track(s) (its bytesSent ' + F.o + ', my bytesReceived ' + inB + '); moving media to the relay');
          if (m.side === 'dialer') startRelay(m.id, true);
          else if (dst) sigSend(m.code, { t: 'rask', c: m.id, to: 'dialer', dst: dst });
        }).catch(function () {});
      });
    }
    setInterval(wdTick, WD_MS);

    /* -- media over the relay -- */
    function installRelayMedia(conn) {
      var R = conn._relay;
      conn.publish = function (name, stream, opts) {
        if (conn.closed || !stream) return;
        var slot = R.slots.get(name);
        if (!slot) { slot = { tx: new Map() }; R.slots.set(name, slot); }
        slot.stream = stream;
        slot.screen = name === 'screen' || !!(opts && opts.video && opts.video.degradationPreference === 'maintain-resolution');
        syncSlot(conn, name);
        relaySend(conn, { t: 'rctl', op: 'pub', name: name });
      };
      conn.unpublish = function (name) {
        var slot = R.slots.get(name); if (!slot) return;
        slot.tx.forEach(function (p) { p.stop(); }); R.slots.delete(name);
        relaySend(conn, { t: 'rctl', op: 'unpub', name: name });
      };
      conn.configure = function () {};
    }
    function syncSlot(conn, name) {
      var R = conn._relay, slot = R && R.slots.get(name); if (!slot || !slot.stream) return;
      var kinds = {};
      slot.stream.getTracks().forEach(function (tr) {
        if (tr.readyState === 'ended') return;
        kinds[tr.kind] = 1;
        var mode = pickMode(R, tr.kind === 'video' ? 'v' : 'a');
        var p = slot.tx.get(tr.kind);
        if (p && p.track === tr && !p.stopped && p.mode === mode) return;
        if (p) p.stop();
        var np = null;
        try {
          if (tr.kind === 'video') np = mode === 'vp8' ? txVideoVP8(conn, name, tr, slot.screen) : mode === 'jpeg' ? txVideoJPEG(conn, name, tr, slot.screen) : null;
          else np = mode === 'opus' ? txAudioOpus(conn, name, tr) : mode === 'pcm' ? txAudioPCM(conn, name, tr) : null;
        } catch (e) { diagNote('relay-tx', tr.kind + ' ' + mode + ': ' + (e && e.message || e)); np = null; }
        if (!np && mode == null && !slot['w' + tr.kind]) diagNote('relay-tx', 'no ' + tr.kind + ' format both sides support (mine ' + (tr.kind === 'video' ? CAPS.encV : CAPS.encA).join('/') + ', theirs ' + (R.far[tr.kind === 'video' ? 'v' : 'a'] || []).join('/') + ')');
        if (np) slot.tx.set(tr.kind, np); else { slot.tx.delete(tr.kind); if (mode == null) slot['w' + tr.kind] = 1; }
      });
      slot.tx.forEach(function (p, k) { if (!kinds[k]) { p.stop(); slot.tx.delete(k); } });
    }
    function relaySocket(conn) { var r = conn._relay && sockets.get(conn._relay.code); return r && r.ws && r.ws.readyState === 1 ? r.ws : null; }
    function relayBusy(conn) { var ws = relaySocket(conn); return !ws || ws.bufferedAmount > 384 * 1024; }
    function queueFrame(conn, h, bytes) {
      var R = conn._relay; if (!R || conn.closed) return;
      R.out.push([h, bytes]); R.outBytes += bytes.length;
      if (R.outBytes > 192 * 1024) flushFrames(conn);
      else if (!R.flushT) R.flushT = setTimeout(function () { flushFrames(conn); }, 45);
    }
    function flushFrames(conn) {
      var R = conn._relay; if (!R) return;
      clearTimeout(R.flushT); R.flushT = null;
      var items = R.out.splice(0); R.outBytes = 0;
      if (!items.length || conn.closed || !TE) return;
      var ws = relaySocket(conn);
      if (!ws) { relayStats.dropped += items.length; R.cnt.dropped += items.length; return; }
      var sidB = TE.encode(R.sid), meta = TE.encode(JSON.stringify({ c: R.id, to: R.to }));
      var parts = [], total = 2 + sidB.length + 2 + meta.length;
      items.forEach(function (it) { var hb = TE.encode(JSON.stringify(it[0])); parts.push(hb, it[1]); total += 2 + hb.length + 4 + it[1].length; });
      if (total > 900 * 1024) { relayStats.dropped += items.length; R.cnt.dropped += items.length; return; }
      var out = new Uint8Array(total), dv = new DataView(out.buffer), o = 0;
      out[o++] = 0xE1; out[o++] = sidB.length; out.set(sidB, o); o += sidB.length;
      dv.setUint16(o, meta.length); o += 2; out.set(meta, o); o += meta.length;
      for (var i = 0; i < parts.length; i += 2) {
        dv.setUint16(o, parts[i].length); o += 2; out.set(parts[i], o); o += parts[i].length;
        dv.setUint32(o, parts[i + 1].length); o += 4; out.set(parts[i + 1], o); o += parts[i + 1].length;
      }
      try { ws.send(out.buffer); relayStats.bytesOut += total; } catch (e) { relayStats.dropped += items.length; R.cnt.dropped += items.length; }
    }
    function relayBinary(buf) {
      if (!TD) return;
      try {
        var u = new Uint8Array(buf), dv = new DataView(buf), o = 0;
        if (u[o++] !== 0xE1) return;
        o += 1 + u[1];
        var ml = dv.getUint16(o); o += 2; var meta = JSON.parse(TD.decode(u.subarray(o, o + ml))); o += ml;
        var conn = relayed.get(meta.to + ':' + meta.c); if (!conn || conn.closed) return;
        var R = conn._relay; R.last = Date.now(); relayStats.bytesIn += u.length;
        if (R.unstable) { R.unstable = false; conn._fire('linkstate', { state: 'connected' }); }
        while (o < u.length) {
          var hl = dv.getUint16(o); o += 2; var h = JSON.parse(TD.decode(u.subarray(o, o + hl))); o += hl;
          var dl = dv.getUint32(o); o += 4; var data = u.slice(o, o + dl); o += dl;
          try { rxFrame(conn, h, data); } catch (e) { R.cnt.decErr++; diagNote('relay-rx', e); }
        }
      } catch (e) {}
    }
    // Frames from a camera track: a MediaStreamTrackProcessor when there is one, else a hidden <video> sampled on a
    // timer. cb(src, width, height, timestampUs) gets a VideoFrame or the <video>; it must not keep src.
    function tapVideo(track, fps, P, cb) {
      if (HAS_MSTP && HAS_VF) {
        var reader = null;
        try { reader = new MediaStreamTrackProcessor({ track: track }).readable.getReader(); } catch (e) { reader = null; }
        if (reader) {
          (async function () {
            while (!P.stopped) {
              var r; try { r = await reader.read(); } catch (e) { break; }
              if (r.done) break;
              var f = r.value;
              try { cb(f, f.displayWidth, f.displayHeight, f.timestamp); } catch (e) {} finally { try { f.close(); } catch (e) {} }
            }
            P.stopped = true;
          })();
          return function () { try { reader.cancel(); } catch (e) {} };
        }
      }
      var vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.autoplay = true; vid.setAttribute('playsinline', '');
      vid.srcObject = new MediaStream([track]); hiddenHost().appendChild(vid);
      try { vid.play().catch(function () {}); } catch (e) {}
      var iv = setInterval(function () {
        if (P.stopped || track.readyState === 'ended') { P.stop(); return; }
        if (vid.paused) { try { vid.play().catch(function () {}); } catch (e) {} }
        if (vid.readyState >= 2 && vid.videoWidth) { try { cb(vid, vid.videoWidth, vid.videoHeight, Math.round(performance.now() * 1000)); } catch (e) {} }
      }, Math.round(1000 / fps));
      return function () { clearInterval(iv); try { vid.srcObject = null; vid.remove(); } catch (e) {} };
    }
    function txHealth(conn, name, P, kind) {
      // A codec that takes input but produces nothing (or keeps erroring) is dropped for this link.
      P.hc = setInterval(function () {
        if (P.stopped) { clearInterval(P.hc); return; }
        var stuck = (P.inN >= (kind === 'v' ? 15 : 60) && P.outN === 0 && Date.now() - P.t0 > 3500) || P.err >= 3;
        if (!stuck) return;
        clearInterval(P.hc);
        var R = conn._relay; if (!R) return;
        R.bad[kind] = 1; R.cnt.encErr++;
        diagNote('relay-tx', P.mode + ' encoder failed (in ' + P.inN + ', out ' + P.outN + ', errors ' + P.err + (P.lastErr ? ': ' + P.lastErr : '') + '); falling back');
        P.stop(); setTimeout(function () { syncSlot(conn, name); }, 0);
      }, 1000);
    }
    function txVideoVP8(conn, name, track, screen) {
      var R = conn._relay, P = { track: track, stopped: false, mode: 'vp8', inN: 0, outN: 0, err: 0, t0: Date.now() };
      var maxW = screen ? 1280 : 640, maxH = screen ? 720 : 360, fps = screen ? 5 : 15, br = screen ? 600000 : 450000;
      var enc = null, cfgKey = '', lastTs = -1e15, seq = 0, forceKey = true, lastKeyAt = -1e15, canvas = null, c2d = null;
      function configure(w, h) {
        try { if (enc && enc.state !== 'closed') enc.close(); } catch (e) {}
        enc = new VideoEncoder({
          output: function (chunk) { var b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); P.outN++; relayStats.txV++; R.cnt.txV++; queueFrame(conn, { n: name, k: 'v', key: chunk.type === 'key' ? 1 : 0, ts: chunk.timestamp, s: seq++, w: w, h: h }, b); },
          error: function (e) { P.err++; P.lastErr = e && e.message; cfgKey = ''; },
        });
        enc.configure({ codec: 'vp8', width: w, height: h, bitrate: br, framerate: fps, latencyMode: 'realtime' });
        cfgKey = w + 'x' + h; forceKey = true;
      }
      var stopTap = tapVideo(track, fps, P, function (src, sw, sh, ts) {
        if (P.stopped || conn.closed || !track.enabled || !sw || !sh) return;
        if (ts - lastTs < 1e6 / fps - 4000 && ts >= lastTs) return;
        if (relayBusy(conn)) { forceKey = true; relayStats.dropped++; R.cnt.dropped++; return; }
        var sc = Math.min(1, maxW / sw, maxH / sh);
        var w = Math.max(16, Math.round(sw * sc / 2) * 2), h = Math.max(16, Math.round(sh * sc / 2) * 2);
        var frame = null;
        try {
          if (cfgKey !== w + 'x' + h || !enc || enc.state === 'closed') configure(w, h);
          if (enc.encodeQueueSize > 2) { forceKey = true; return; }
          lastTs = ts;
          var direct = typeof VideoFrame !== 'undefined' && src instanceof VideoFrame && src.codedWidth === w && src.codedHeight === h && src.displayWidth === w && src.displayHeight === h;
          if (direct) frame = src;
          else {
            if (!canvas) { canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas'); c2d = canvas.getContext('2d'); }
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            c2d.drawImage(src, 0, 0, w, h);
            frame = new VideoFrame(canvas, { timestamp: ts });
          }
          var key = forceKey || ts - lastKeyAt > 3e6 || ts < lastKeyAt;
          if (key) { lastKeyAt = ts; forceKey = false; }
          P.inN++;
          enc.encode(frame, { keyFrame: key });
        } catch (e) { P.err++; P.lastErr = e && e.message; cfgKey = ''; }
        finally { if (frame && frame !== src) { try { frame.close(); } catch (e) {} } }
      });
      P.stop = function () { P.stopped = true; clearInterval(P.hc); try { stopTap(); } catch (e) {} try { enc && enc.state !== 'closed' && enc.close(); } catch (e) {} };
      P.key = function () { forceKey = true; };
      txHealth(conn, name, P, 'v');
      return P;
    }
    // Universal video: JPEG stills (~10 fps, 426 px wide) drawn through a canvas. No WebCodecs needed on either side.
    function txVideoJPEG(conn, name, track, screen) {
      var R = conn._relay, P = { track: track, stopped: false, mode: 'jpeg', inN: 0, outN: 0, err: 0, t0: Date.now() };
      var maxW = screen ? 960 : 426, fps = screen ? 4 : 10, q = screen ? 0.7 : 0.6, seq = 0, busy = 0, last = 0;
      var cv = document.createElement('canvas'), cx = cv.getContext('2d');
      var stopTap = tapVideo(track, fps, P, function (src, sw, sh) {
        if (P.stopped || conn.closed || !track.enabled || !sw || !sh || busy > 1) return;
        var now = performance.now(); if (now - last < 1000 / fps - 8) return;
        if (relayBusy(conn)) { relayStats.dropped++; R.cnt.dropped++; return; }
        var sc = Math.min(1, maxW / sw), w = Math.max(16, Math.round(sw * sc)), h = Math.max(16, Math.round(sh * sc));
        if (cv.width !== w) cv.width = w;
        if (cv.height !== h) cv.height = h;
        try { cx.drawImage(src, 0, 0, w, h); } catch (e) { P.err++; P.lastErr = e && e.message; return; }
        last = now; busy++; P.inN++;
        var done = function (b) {
          busy--;
          if (!b || P.stopped || conn.closed) { if (!b) { P.err++; P.lastErr = 'toBlob returned nothing'; } return; }
          b.arrayBuffer().then(function (ab) { if (P.stopped || conn.closed) return; P.outN++; relayStats.txJ++; relayStats.txV++; R.cnt.txV++; queueFrame(conn, { n: name, k: 'j', s: seq++, w: w, h: h }, new Uint8Array(ab)); });
        };
        try { cv.toBlob(done, 'image/jpeg', q); } catch (e) { busy--; P.err++; P.lastErr = e && e.message; }
      });
      P.stop = function () { P.stopped = true; clearInterval(P.hc); try { stopTap(); } catch (e) {} };
      P.key = function () {};
      return P;
    }
    var CAPTURE_WORKLET = "registerProcessor('ehub-relay-cap',class extends AudioWorkletProcessor{constructor(){super();this.N=Math.round(sampleRate/50);this.b=new Float32Array(this.N);this.n=0}process(i){var c=i[0]&&i[0][0];if(c){for(var k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===this.N){this.port.postMessage(this.b.slice(0));this.n=0}}}return true}})";
    var PLAY_WORKLET = "registerProcessor('ehub-relay-play2',class extends AudioWorkletProcessor{constructor(){super();this.q=[];this.o=0;this.len=0;this.run=false;this.pre=Math.round(sampleRate*0.08);this.max=Math.round(sampleRate*0.4);this.port.onmessage=e=>{var d=e.data;this.q.push(d);this.len+=d.length;while(this.len>this.max&&this.q.length>1){var x=this.q.shift();this.len-=x.length;this.o=0}}}process(i,outs){var o=outs[0],out=o[0];if(!this.run){if(this.len>=this.pre)this.run=true;else{for(var c=0;c<o.length;c++)o[c].fill(0);return true}}for(var k=0;k<out.length;k++){var h=this.q[0];if(!h){out[k]=0;this.run=false;continue}out[k]=h[this.o++];if(this.o>=h.length){this.q.shift();this.len-=h.length;this.o=0}}for(var c2=1;c2<o.length;c2++)o[c2].set(out);return true}})";
    function workletModule(ac, key, src) {
      if (!ac[key]) ac[key] = ac.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      return ac[key];
    }
    // Raw mono PCM from a mic track at the context rate: an AudioWorklet, or a ScriptProcessor where there is none.
    function tapAudio(track, P, cb) {
      var ac = relayAudioCtx(), srcN = null, node = null, mute = null;
      var stop = function () { try { srcN && srcN.disconnect(); } catch (e) {} try { node && node.disconnect(); } catch (e) {} try { mute && mute.disconnect(); } catch (e) {} };
      (async function () {
        try {
          srcN = ac.createMediaStreamSource(new MediaStream([track]));
          mute = ac.createGain(); mute.gain.value = 0;
          if (HAS_WORKLET && ac.audioWorklet) {
            try { await workletModule(ac, '__ehubCap2', CAPTURE_WORKLET); } catch (e) { diagNote('relay-tx', 'capture worklet: ' + (e && e.message)); }
            if (P.stopped) return;
            try { node = new AudioWorkletNode(ac, 'ehub-relay-cap'); node.port.onmessage = function (e) { if (!P.stopped) cb(e.data, ac.sampleRate); }; } catch (e) { node = null; }
          }
          if (!node && HAS_SP) {
            node = ac.createScriptProcessor(2048, 1, 1);
            node.onaudioprocess = function (e) { if (!P.stopped) cb(new Float32Array(e.inputBuffer.getChannelData(0)), ac.sampleRate); };
          }
          if (!node) { diagNote('relay-tx', 'no way to capture audio'); return; }
          srcN.connect(node); node.connect(mute); mute.connect(ac.destination);
        } catch (e) { diagNote('relay-tx', 'audio capture: ' + (e && e.message)); }
      })();
      return stop;
    }
    function txAudioOpus(conn, name, track) {
      var R = conn._relay, P = { track: track, stopped: false, mode: 'opus', inN: 0, outN: 0, err: 0, t0: Date.now() }, enc = null, cfg = '', seq = 0, ts = 0;
      function ensure(sr, ch) {
        if (enc && enc.state === 'configured' && cfg === sr + '/' + ch) return;
        try { if (enc && enc.state !== 'closed') enc.close(); } catch (e) {}
        cfg = sr + '/' + ch;
        enc = new AudioEncoder({
          output: function (chunk) { var b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); P.outN++; relayStats.txA++; R.cnt.txA++; queueFrame(conn, { n: name, k: 'a', ts: chunk.timestamp, s: seq++, sr: sr, ch: ch }, b); },
          error: function (e) { P.err++; P.lastErr = e && e.message; cfg = ''; },
        });
        enc.configure({ codec: 'opus', sampleRate: sr, numberOfChannels: ch, bitrate: 32000 });
      }
      function onData(ad) {
        try {
          if (P.stopped || conn.closed || !track.enabled) return;
          var ch = Math.min(2, ad.numberOfChannels || 1);
          ensure(ad.sampleRate, ch);
          if (enc.encodeQueueSize > 20) return;
          P.inN++; enc.encode(ad);
        } catch (e) { P.err++; P.lastErr = e && e.message; cfg = ''; } finally { try { ad.close(); } catch (e) {} }
      }
      var reader = null;
      if (HAS_MSTP) { try { reader = new MediaStreamTrackProcessor({ track: track }).readable.getReader(); } catch (e) { reader = null; } }
      if (reader) {
        (async function () { while (!P.stopped) { var r; try { r = await reader.read(); } catch (e) { break; } if (r.done) break; onData(r.value); } P.stopped = true; })();
        P.stop = function () { P.stopped = true; clearInterval(P.hc); try { reader.cancel(); } catch (e) {} try { enc && enc.state !== 'closed' && enc.close(); } catch (e) {} };
      } else {
        var stopTap = tapAudio(track, P, function (f, sr) { try { var ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: f.length, numberOfChannels: 1, timestamp: ts, data: f }); ts += Math.round(f.length / sr * 1e6); onData(ad); } catch (x) { P.err++; P.lastErr = x && x.message; } });
        P.stop = function () { P.stopped = true; clearInterval(P.hc); stopTap(); try { enc && enc.state !== 'closed' && enc.close(); } catch (e) {} };
      }
      txHealth(conn, name, P, 'a');
      return P;
    }
    // Box-filter decimator (any rate -> 16 kHz) and a linear upsampler (16 kHz -> the context rate), both stateful.
    function downsampler(srIn, srOut) {
      var r = srIn / srOut, acc = 0, n = 0, pos = 0;
      return function (inp) { var out = new Float32Array(Math.ceil(inp.length / r) + 1), m = 0; for (var i = 0; i < inp.length; i++) { acc += inp[i]; n++; pos += 1; if (pos >= r) { out[m++] = acc / n; acc = 0; n = 0; pos -= r; } } return out.subarray(0, m); };
    }
    function upsampler(srIn, srOut) {
      var step = srIn / srOut, t = 0, prev = 0;
      return function (inp) {
        var n = inp.length; if (!n) return new Float32Array(0);
        var out = new Float32Array(Math.ceil(n / step) + 2), m = 0;
        while (t < n) { var i = Math.floor(t), f = t - i, a = i === 0 ? prev : inp[i - 1], b = inp[i]; out[m++] = a + (b - a) * f; t += step; }
        t -= n; prev = inp[n - 1]; return out.subarray(0, m);
      };
    }
    // Universal audio: 16 kHz mono Int16 PCM in 20 ms chunks (~32 KB/s).
    function txAudioPCM(conn, name, track) {
      var R = conn._relay, P = { track: track, stopped: false, mode: 'pcm', inN: 0, outN: 0, err: 0, t0: Date.now() }, seq = 0, down = null, downSr = 0, acc = new Float32Array(0);
      var stopTap = tapAudio(track, P, function (f, sr) {
        if (P.stopped || conn.closed) return;
        P.inN++;
        if (!track.enabled) { acc = new Float32Array(0); return; }
        if (!down || downSr !== sr) { down = sr === 16000 ? function (x) { return x; } : downsampler(sr, 16000); downSr = sr; }
        var d = down(f), all = new Float32Array(acc.length + d.length); all.set(acc); all.set(d, acc.length);
        var o = 0;
        while (all.length - o >= 320) {
          var pcm = new Int16Array(320);
          for (var k = 0; k < 320; k++) { var x = all[o + k]; pcm[k] = x >= 1 ? 32767 : x <= -1 ? -32768 : Math.round(x * 32767); }
          o += 320; P.outN++; relayStats.txP++; relayStats.txA++; R.cnt.txA++;
          queueFrame(conn, { n: name, k: 'p', s: seq++, sr: 16000 }, new Uint8Array(pcm.buffer));
        }
        acc = all.slice(o);
      });
      P.stop = function () { P.stopped = true; clearInterval(P.hc); stopTap(); };
      return P;
    }

    /* -- receiving -- */
    function remoteSlot(conn, name) {
      var R = conn._relay, rm = R.remote.get(name);
      if (!rm) { rm = { name: name, stream: null, tracks: {}, v: null, a: null }; R.remote.set(name, rm); }
      return rm;
    }
    function endSink(S) { if (!S || S.ended) return; S.ended = true; try { S.dec && S.dec.state !== 'closed' && S.dec.close(); } catch (e) {} try { S.stop && S.stop(); } catch (e) {} }
    function endRemote(rm) { endSink(rm.v); endSink(rm.a); }
    // Every change to a name's tracks hands the app a fresh MediaStream, so <video> elements always re-bind.
    function setRemoteTrack(conn, rm, kind, track) {
      rm.tracks[kind] = track;
      var list = []; if (rm.tracks.video) list.push(rm.tracks.video); if (rm.tracks.audio) list.push(rm.tracks.audio);
      rm.stream = new MediaStream(list);
      conn._fire('media', { name: rm.name, stream: rm.stream });
    }
    function canvasSink(w, h) {
      var cv = document.createElement('canvas'); cv.width = w || 640; cv.height = h || 360; hiddenHost().appendChild(cv);
      var cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
      var cs = cv.captureStream(), tr = cs.getVideoTracks()[0];
      return { cv: cv, cx: cx, track: tr, stop: function () { try { tr.stop(); } catch (e) {} try { cv.remove(); } catch (e) {} } };
    }
    function videoSink(conn, rm, mode) {
      if (rm.v && !rm.v.ended && rm.v.mode === mode) return rm.v;
      endSink(rm.v);
      var S = { mode: mode, needKey: true, askedAt: 0, lastSeq: null, dec: null, dims: '', inN: 0, outN: 0, err: 0, busy: 0 };
      if (mode === 'vp8' && HAS_GEN) {
        var gen = new MediaStreamTrackGenerator({ kind: 'video' }), w = gen.writable.getWriter();
        S.write = function (f) { if (S.ended) { f.close(); return; } if (w.desiredSize !== null && w.desiredSize <= -2) { f.close(); return; } w.write(f).catch(function () {}); };
        S.stop = function () { try { gen.stop(); } catch (e) {} try { w.close(); } catch (e) {} };
        rm.v = S; setRemoteTrack(conn, rm, 'video', gen);
      } else {
        var C = canvasSink(640, 360);
        S.draw = function (img, iw, ih) { try { if (C.cv.width !== iw) C.cv.width = iw; if (C.cv.height !== ih) C.cv.height = ih; C.cx.drawImage(img, 0, 0, iw, ih); } catch (e) { S.err++; } };
        S.write = function (f) { S.draw(f, f.displayWidth, f.displayHeight); f.close(); };
        S.stop = C.stop;
        rm.v = S; setRemoteTrack(conn, rm, 'video', C.track);
      }
      return S;
    }
    // Audio playback into a MediaStream: an AudioWorklet jitter buffer (or ScriptProcessor) -> MediaStreamDestination.
    function pcmPlayer() {
      var ac = relayAudioCtx(), dest = ac.createMediaStreamDestination(), node = null, pending = [], Pl = { ac: ac, track: dest.stream.getAudioTracks()[0] };
      var q = [], qo = 0, qlen = 0, run = false, pre = Math.round(ac.sampleRate * 0.08), max = Math.round(ac.sampleRate * 0.4);
      Pl.push = function (f) {
        if (node && node.port) { node.port.postMessage(f, [f.buffer]); return; }
        if (node) { q.push(f); qlen += f.length; while (qlen > max && q.length > 1) { qlen -= q.shift().length; qo = 0; } return; }
        if (pending.length < 50) pending.push(f);
      };
      Pl.stop = function () { try { node && node.disconnect(); } catch (e) {} try { dest.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} };
      var useSP = function () {
        if (!HAS_SP) { diagNote('relay-rx', 'no way to play relayed audio'); return; }
        node = ac.createScriptProcessor(2048, 1, 1);
        node.onaudioprocess = function (e) {
          var out = e.outputBuffer.getChannelData(0);
          if (!run) { if (qlen >= pre) run = true; else { out.fill(0); return; } }
          for (var k = 0; k < out.length; k++) { var h = q[0]; if (!h) { out[k] = 0; run = false; continue; } out[k] = h[qo++]; if (qo >= h.length) { q.shift(); qlen -= h.length; qo = 0; } }
        };
        node.connect(dest); pending.splice(0).forEach(Pl.push);
      };
      if (HAS_WORKLET && ac.audioWorklet) {
        workletModule(ac, '__ehubPlay2', PLAY_WORKLET).then(function () {
          if (Pl.stopped) return;
          node = new AudioWorkletNode(ac, 'ehub-relay-play2', { outputChannelCount: [1] }); node.connect(dest); pending.splice(0).forEach(Pl.push);
        }).catch(function (e) { diagNote('relay-rx', 'play worklet: ' + (e && e.message)); useSP(); });
      } else useSP();
      return Pl;
    }
    function audioSink(conn, rm, mode) {
      if (rm.a && !rm.a.ended && rm.a.mode === mode) return rm.a;
      endSink(rm.a);
      var S = { mode: mode, dec: null, cfg: '', inN: 0, outN: 0, err: 0 };
      if (mode === 'opus' && HAS_GEN) {
        var gen = new MediaStreamTrackGenerator({ kind: 'audio' }), w = gen.writable.getWriter();
        S.write = function (ad) { if (S.ended) { ad.close(); return; } if (w.desiredSize !== null && w.desiredSize <= -10) { ad.close(); return; } w.write(ad).catch(function () {}); };
        S.stop = function () { try { gen.stop(); } catch (e) {} try { w.close(); } catch (e) {} };
        rm.a = S; setRemoteTrack(conn, rm, 'audio', gen);
        return S;
      }
      var Pl = pcmPlayer(), up = null, upSr = 0;
      S.pushF32 = function (f, sr) { if (S.ended) return; if (!up || upSr !== sr) { up = sr === Pl.ac.sampleRate ? function (x) { return x; } : upsampler(sr, Pl.ac.sampleRate); upSr = sr; } var o = up(f); Pl.push(o === f ? f.slice(0) : o.slice(0)); };
      S.write = function (ad) { try { var f = new Float32Array(ad.numberOfFrames); ad.copyTo(f, { planeIndex: 0, format: 'f32-planar' }); S.pushF32(f, ad.sampleRate); } catch (e) { S.err++; } ad.close(); };
      S.stop = function () { Pl.stopped = true; Pl.stop(); };
      rm.a = S; setRemoteTrack(conn, rm, 'audio', Pl.track);
      return S;
    }
    // The far side keeps sending something we cannot use: tell it which formats we can take.
    function refuse(conn, kind, why) {
      var R = conn._relay; if (R.badDec[kind]) return;
      R.badDec[kind] = 1; R.cnt.decErr++;
      diagNote('relay-rx', (kind === 'v' ? 'vp8' : 'opus') + ' decode failed (' + why + '); asking for the fallback format');
      relaySend(conn, { t: 'rctl', op: 'caps', caps: myCaps(R) });
    }
    function rxFrame(conn, h, data) {
      var R = conn._relay, rm = remoteSlot(conn, String(h.n)), now = Date.now();
      if (h.k === 'v') {
        relayStats.rxV++; R.cnt.rxV++;
        if (R.badDec.v) return;
        if (typeof VideoDecoder === 'undefined') { refuse(conn, 'v', 'no VideoDecoder'); return; }
        var V = videoSink(conn, rm, 'vp8'); V.inN++;
        if (V.inN > 90 && V.outN === 0) { refuse(conn, 'v', 'no frames out of ' + V.inN); return; }
        var askKey = function () { V.needKey = true; if (now - V.askedAt > 800) { V.askedAt = now; relaySend(conn, { t: 'rctl', op: 'key', name: rm.name }); } };
        if (!h.key && (V.needKey || (V.lastSeq != null && h.s !== V.lastSeq + 1))) { V.lastSeq = h.s; askKey(); return; }
        V.lastSeq = h.s;
        if (h.key) {
          if (!V.dec || V.dec.state === 'closed') {
            V.dims = '';
            V.dec = new VideoDecoder({ output: function (f) { V.outN++; relayStats.outV++; R.cnt.outV++; V.write(f); }, error: function (e) { V.err++; V.needKey = true; diagNote('vp8-dec', e); if (V.err >= 4) refuse(conn, 'v', 'decoder errors'); } });
          }
          if (V.dims !== h.w + 'x' + h.h || V.dec.state !== 'configured') { V.dec.configure({ codec: 'vp8', codedWidth: h.w, codedHeight: h.h, optimizeForLatency: true }); V.dims = h.w + 'x' + h.h; }
          V.needKey = false;
        }
        if (!V.dec || V.dec.state !== 'configured') { askKey(); return; }
        if (V.dec.decodeQueueSize > 6) { askKey(); return; }
        try { V.dec.decode(new EncodedVideoChunk({ type: h.key ? 'key' : 'delta', timestamp: h.ts, data: data })); } catch (e) { V.err++; askKey(); }
        return;
      }
      if (h.k === 'j') {
        relayStats.rxJ++; relayStats.rxV++; R.cnt.rxV++;
        var J = videoSink(conn, rm, 'jpeg'); J.inN++;
        if (J.busy > 2) return; // keep up rather than queue: drop stills while two are decoding
        J.busy++;
        var blob = new Blob([data], { type: 'image/jpeg' });
        var fin = function () { J.busy--; };
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(blob).then(function (bm) { fin(); if (J.ended) { bm.close && bm.close(); return; } J.draw(bm, bm.width, bm.height); bm.close && bm.close(); J.outN++; relayStats.outJ++; relayStats.outV++; R.cnt.outV++; }, function (e) { fin(); J.err++; diagNote('jpeg-dec', e); });
        } else {
          var url = URL.createObjectURL(blob), img = new Image();
          img.onload = function () { fin(); URL.revokeObjectURL(url); if (J.ended) return; J.draw(img, img.naturalWidth, img.naturalHeight); J.outN++; relayStats.outJ++; relayStats.outV++; R.cnt.outV++; };
          img.onerror = function () { fin(); URL.revokeObjectURL(url); J.err++; };
          img.src = url;
        }
        return;
      }
      if (h.k === 'a') {
        relayStats.rxA++; R.cnt.rxA++;
        if (R.badDec.a) return;
        if (typeof AudioDecoder === 'undefined') { refuse(conn, 'a', 'no AudioDecoder'); return; }
        var A = audioSink(conn, rm, 'opus'); A.inN++;
        if (A.inN > 250 && A.outN === 0) { refuse(conn, 'a', 'no audio out of ' + A.inN); return; }
        var ch = h.ch || 1;
        if (!A.dec || A.dec.state === 'closed' || A.cfg !== String(ch)) {
          try { if (A.dec && A.dec.state !== 'closed') A.dec.close(); } catch (e) {}
          A.dec = new AudioDecoder({ output: function (ad) { A.outN++; relayStats.outA++; R.cnt.outA++; A.write(ad); }, error: function (e) { A.err++; A.cfg = ''; diagNote('opus-dec', e); if (A.err >= 4) refuse(conn, 'a', 'decoder errors'); } });
          A.dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: ch }); A.cfg = String(ch);
        }
        if (A.dec.decodeQueueSize > 30) return;
        try { A.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: h.ts, data: data })); } catch (e) { A.err++; A.cfg = ''; }
        return;
      }
      if (h.k === 'p') {
        relayStats.rxP++; relayStats.rxA++; R.cnt.rxA++;
        var Q = audioSink(conn, rm, 'pcm'); Q.inN++;
        var n = data.length >> 1, i16 = new Int16Array(data.buffer, data.byteOffset, n), f32 = new Float32Array(n);
        for (var k = 0; k < n; k++) f32[k] = i16[k] / 32768;
        Q.pushF32(f32, Number(h.sr) || 16000); Q.outN++; relayStats.outP++; relayStats.outA++; R.cnt.outA++;
      }
    }

    /* -- diagnostics: a compact snapshot of every link, for the app's "Connection info" and /api/diag -- */
    function sum(o, k, v) { o[k] = (o[k] || 0) + (v || 0); }
    async function connDiag(conn) {
      var m = conn._meta || {}, R = conn._relay, now = Date.now();
      var d = { id: m.id, side: m.side, age: Math.round((now - (m.t0 || now)) / 1000), state: conn.closed ? 'closed' : conn.connected ? 'open' : 'connecting',
        path: R ? (R.keepDc ? 'relay-media' : 'relay') : conn.connected ? 'direct' : 'none' };
      if (conn.closed) { d.reason = m.reason || ''; return d; }
      var pc = conn.peerconnection;
      if (pc && !pc.relayed && typeof pc.getStats === 'function') {
        d.ice = pc.iceConnectionState; d.pc = pc.connectionState; d.sig = pc.signalingState; d.dc = conn._dc ? conn._dc.readyState : null;
        try {
          var st = await pc.getStats(), inn = {}, out = {}, pairs = {}, cands = {}, sel = null;
          st.forEach(function (r) {
            if (r.type === 'inbound-rtp') { var k = r.kind || r.mediaType; var o = inn[k] || (inn[k] = {}); sum(o, 'b', r.bytesReceived); sum(o, 'p', r.packetsReceived); sum(o, 'lost', r.packetsLost); if (k === 'video') { sum(o, 'fd', r.framesDecoded); if (r.frameWidth) o.w = r.frameWidth + 'x' + r.frameHeight; if (r.decoderImplementation) o.dec = r.decoderImplementation; } if (r.codecId && st.get(r.codecId)) o.codec = st.get(r.codecId).mimeType; }
            else if (r.type === 'outbound-rtp') { var k2 = r.kind || r.mediaType; var o2 = out[k2] || (out[k2] = {}); sum(o2, 'b', r.bytesSent); sum(o2, 'p', r.packetsSent); if (k2 === 'video') { sum(o2, 'fe', r.framesEncoded); if (r.frameWidth) o2.w = r.frameWidth + 'x' + r.frameHeight; if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') o2.ql = r.qualityLimitationReason; if (r.encoderImplementation) o2.enc = r.encoderImplementation; } if (r.codecId && st.get(r.codecId)) o2.codec = st.get(r.codecId).mimeType; }
            else if (r.type === 'candidate-pair') pairs[r.id] = r;
            else if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r;
            else if (r.type === 'transport' && r.selectedCandidatePairId) sel = r.selectedCandidatePairId;
          });
          var cp = sel ? pairs[sel] : null;
          if (!cp) Object.keys(pairs).forEach(function (k) { var p = pairs[k]; if ((p.nominated && p.state === 'succeeded') && !cp) cp = p; });
          if (cp) { var lc = cands[cp.localCandidateId] || {}, rc = cands[cp.remoteCandidateId] || {}; d.pair = (lc.candidateType || '?') + '>' + (rc.candidateType || '?') + ' ' + (lc.protocol || '') + (cp.currentRoundTripTime != null ? ' rtt' + Math.round(cp.currentRoundTripTime * 1000) : ''); }
          d.cands = { l: Object.keys(cands).filter(function (k) { return cands[k].type === 'local-candidate'; }).map(function (k) { return cands[k].candidateType; }).join(','), r: Object.keys(cands).filter(function (k) { return cands[k].type === 'remote-candidate'; }).map(function (k) { return cands[k].candidateType + (cands[k].address && /\.local$/.test(cands[k].address) ? '(mdns)' : ''); }).join(',') };
          d.in = inn; d.out = out;
          try { d.senders = pc.getSenders().filter(function (s) { return s.track; }).map(function (s) { return s.track.kind + (s.track.enabled ? '' : '(off)') + (s.track.readyState === 'live' ? '' : '(' + s.track.readyState + ')'); }).join(','); } catch (e) {}
          try { d.receivers = pc.getReceivers().filter(function (r) { return r.track; }).map(function (r) { return r.track.kind + (r.track.muted ? '(muted)' : ''); }).join(','); } catch (e) {}
        } catch (e) { d.statsErr = String(e && e.message || e).slice(0, 80); }
      }
      if (m.wd) d.wd = { farSending: m.wd.far ? m.wd.far.s : null, farOut: m.wd.far ? m.wd.far.o : null, flatMs: m.wd.flatFor || 0, tries: m.wd.tries };
      if (R) {
        var tx = {}, rx = {};
        R.slots.forEach(function (slot, name) { slot.tx.forEach(function (p, kind) { tx[name + '.' + kind] = p.mode + (p.stopped ? '(stopped)' : '') + ' in' + (p.inN || 0) + ' out' + (p.outN || 0) + (p.err ? ' err' + p.err : ''); }); });
        R.remote.forEach(function (rm, name) { if (rm.v) rx[name + '.video'] = rm.v.mode + ' in' + rm.v.inN + ' out' + rm.v.outN + (rm.v.err ? ' err' + rm.v.err : ''); if (rm.a) rx[name + '.audio'] = rm.a.mode + ' in' + rm.a.inN + ' out' + rm.a.outN + (rm.a.err ? ' err' + rm.a.err : ''); });
        d.relay = { v: pickMode(R, 'v'), a: pickMode(R, 'a'), far: R.far, bad: R.bad, badDec: R.badDec, tx: tx, rx: rx, cnt: R.cnt, idle: now - R.last, unstable: R.unstable, ws: !!relaySocket(conn) };
      }
      return d;
    }
    async function diagnostics() {
      var list = []; allConns.forEach(function (c) { list.push(c); });
      var conns = await Promise.all(list.map(function (c) { return connDiag(c).catch(function (e) { return { err: String(e && e.message || e) }; }); }));
      var socks = []; sockets.forEach(function (r, code) { socks.push({ code: String(code).slice(0, 40), ws: r.ws ? r.ws.readyState : -1, tries: r.tries }); });
      return { v: PEER_V, ua: navigator.userAgent, online: ONLINE, caps: { encV: CAPS.encV, decV: CAPS.decV, encA: CAPS.encA, decA: CAPS.decA, checked: CAPS.checked, gen: HAS_GEN, mstp: HAS_MSTP, worklet: HAS_WORKLET },
        audioCtx: audioCtx ? audioCtx.state + '@' + audioCtx.sampleRate : 'none', activation: navigator.userActivation ? (navigator.userActivation.hasBeenActive ? 'sticky' : 'none') : 'n/a',
        conns: conns, sockets: socks, relay: Object.assign({}, relayStats), errs: diagErrs.slice(-25) };
    }
    try { window.__ehubPeerDiag = diagnostics; } catch (e) {}
    return {
      async serve(opts) {
        opts = opts || {};
        if (opts.name !== undefined && !/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/.test(String(opts.name))) throw new TypeError('Not a valid room name');
        var code = opts.name || ('EV-' + rand());
        var old = servers.get(code); if (old) old.close();
        var s = new Server(code); s._onClose = function () { if (servers.get(code) === s) servers.delete(code); sigClose(code); }; sig(code); iceConfig();
        servers.set(code, s); return s;
      },
      async connect(code, opts) {
        if (typeof RTCPeerConnection === 'undefined') throw err('not_supported', 'Peer connections are not available in this browser');
        var pc = new RTCPeerConnection(await iceConfig()), connId = rand(8);
        var conn = new Conn(pc, { owner: null, room: /^[a-z]/.test(String(code)) ? code : undefined });
        conn.attach(pc.createDataChannel('everything'));
        var rec = { pc: pc, conn: conn, queued: [], answered: false, timer: null }; dials.set(connId, rec); connCode.set(connId, String(code)); trackConn(conn, connId, 'dialer', code);
        conn.addEventListener('close', function () { clearTimeout(rec.timer); clearTimeout(rec.relayT); clearTimeout(rec.relayWait); dials.delete(connId); });
        pc.onicecandidate = function (e) { postBus({ t: 'ice', connId: connId, to: 'server', candidate: e.candidate ? e.candidate.toJSON() : null }); };
        await pc.setLocalDescription(await pc.createOffer());
        rec.timer = setTimeout(function () { if (rec.answered || conn.closed) return; var e = err('invalid_invite', 'No one is hosting that code right now. Check the code and that the host still has the app open.'); conn._fire('error', { error: e }); conn.close('invalid_invite'); }, NO_HOST_MS);
        postBus({ t: 'dial', code: String(code), connId: connId, sid: (sig(String(code)) || {}).sid, from: { uuid: (opts && typeof opts.anonToken === 'string' && opts.anonToken) || me.uuid, username: me.username }, offer: pc.localDescription.toJSON() });
        return conn;
      },
      async ensureTurnRelays() {}, diagnostics: diagnostics, unlockMedia: function () { unlockMedia(true); }, diagNote: function (k, m) { diagNote(k, m); }, version: PEER_V, async createGuestGrant() { return { grant: 'local-grant', expiresAt: nowSec() + 3600 }; },
    };
  })();

  /* ------------------------------------------------------------- events/perms */
  var subs = new Map();
  var events = {
    async onLocal(subject, cb, opts) {
      var id = 'sub-' + rid(6), s = String(subject || '');
      opts = opts || {};
      if (s.indexOf('kv:') === 0) {
        // kv:<app>:<key or glob>. Changes made by this app in other tabs/windows of this browser are delivered;
        // shared (team) data lives on the app's team server, which has no push channel, so those subjects are refused
        // and the app falls back to polling.
        var rest = s.slice(3), ci = rest.indexOf(':'), ns = ci < 0 ? rest : rest.slice(0, ci), kpat = ci < 0 ? '*' : rest.slice(ci + 1);
        if ([APP, 'app-' + APP].indexOf(ns) < 0) throw err('not_supported', 'Live updates for shared data are not available here; the app refreshes on its own.');
        var kre = globToRe(kpat || '*');
        var kl = function (m) {
          if (!kre.test(m.key)) return;
          var ev = { key: m.key, op: m.op, ts: m.ts, subject: s };
          if (opts.includeValue !== false && 'value' in m) ev.value = m.value;
          try { cb({ subject: s, event: ev, data: ev }); } catch (e) { console.error(e); }
        };
        kvListeners.push(kl);
        var ksub = { id: id, subject: s, off: function () { var i = kvListeners.indexOf(kl); if (i >= 0) kvListeners.splice(i, 1); subs.delete(id); }, unsubscribe: function () { ksub.off(); }, close: function () { ksub.off(); } };
        subs.set(id, ksub); return ksub;
      }
      var root = s.indexOf('fs:') === 0 ? normPath(s.slice(3)) : null;
      var l = function (m) { if (root && (m.path === root || String(m.path).indexOf(root + '/') === 0 || String(m.from || '').indexOf(root) === 0)) cb({ subject: s, event: m, data: m }); };
      fsListeners.push(l);
      var sub = { id: id, subject: s, off: function () { var i = fsListeners.indexOf(l); if (i >= 0) fsListeners.splice(i, 1); subs.delete(id); }, unsubscribe: function () { sub.off(); }, close: function () { sub.off(); } };
      subs.set(id, sub); return sub;
    },
    async onPersistent(o) { var id = 'sub-' + rid(6); var sub = Object.assign({ id: id, subId: id, local: true }, o || {}); subs.set(id, sub); return sub; },
    async list() { return []; },
    async unsubscribe(id) { var s = subs.get(id && id.id || id); if (s && s.off) s.off(); subs.delete(id); return true; },
    async emit() { return true; }, on: function () {}, off: function () {},
  };
  var perms = {
    async request(what) {
      if (what === 'email' || (what && what.resource === 'email')) return USER.email;
      if (Array.isArray(what)) return what.map(function () { return true; }).every(Boolean);
      return true;
    },
    async check() { return true; }, async grant() { return true; }, async revoke() { return true; },
    async requestEmail() { return USER.email; }, async requestReadDesktop() { return HOME + '/Desktop'; }, async requestWriteDesktop() { return HOME + '/Desktop'; },
    async requestReadDocuments() { return HOME + '/Documents'; }, async requestWriteDocuments() { return HOME + '/Documents'; },
    async requestReadPictures() { return HOME + '/Pictures'; }, async requestWritePictures() { return HOME + '/Pictures'; },
    async requestReadVideos() { return HOME + '/Videos'; }, async requestWriteVideos() { return HOME + '/Videos'; },
    async requestReadApps() { return true; }, async requestManageApps() { return true; }, async requestManageSubdomains() { return true; },
  };

  /* -------------------------------------------------------------------- auth */
  var auth = {
    isSignedIn: function () { return true; },
    async signIn() { return Object.assign({}, USER); },
    signOut: function () { post('toast', { message: 'Pravahahub keeps you signed in on this device.' }); return Promise.resolve(); },
    async getUser() { return Object.assign({}, USER); },
    async whoami() { return Object.assign({}, USER); },
    async getProfilePicture() { return null; },
    async getMonthlyUsage() { return { allowanceInfo: { monthUsageAllowance: 0, remaining: 0 }, appTotals: {}, usage: {}, local: true }; },
    async getDetailedAppUsage() { return { total: 0, local: true }; },
  };

  /* ---------------------------------------------------------------------- ui */
  var lastPointer = { x: 120, y: 120 };
  document.addEventListener('pointerdown', function (e) { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('contextmenu', function (e) { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
  var STYLE_ID = 'everything-ui-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style'); st.id = STYLE_ID;
    st.textContent = '.ev-ui{font:14px/1.4 Inter,Manrope,system-ui,-apple-system,sans-serif;color:#2a2622;z-index:2147483646}' +
      '.ev-menu{position:fixed;min-width:180px;background:rgba(252,250,246,.97);backdrop-filter:blur(16px);border:1px solid rgba(60,50,40,.12);border-radius:12px;box-shadow:0 12px 40px rgba(40,30,20,.18);padding:6px;animation:evpop .14s ease-out}' +
      '.ev-menu button{display:flex;gap:8px;align-items:center;width:100%;text-align:left;background:none;border:0;padding:8px 10px;border-radius:8px;font:inherit;color:inherit;cursor:pointer}' +
      '.ev-menu button:hover,.ev-menu button:focus{background:rgba(60,50,40,.07);outline:none}.ev-menu button[disabled]{opacity:.45;cursor:default}.ev-menu hr{border:0;border-top:1px solid rgba(60,50,40,.1);margin:4px 6px}' +
      '.ev-scrim{position:fixed;inset:0;background:rgba(30,24,18,.28);display:grid;place-items:center;animation:evfade .15s}' +
      '.ev-dialog{background:#fcfaf6;border-radius:16px;box-shadow:0 24px 70px rgba(30,20,10,.3);padding:22px;max-width:min(420px,92vw);width:100%;animation:evpop .18s cubic-bezier(.2,.9,.3,1.2)}' +
      '.ev-dialog p{margin:0 0 14px;white-space:pre-wrap}.ev-dialog input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(60,50,40,.2);border-radius:10px;font:inherit;margin-bottom:14px;background:#fff}' +
      '.ev-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.ev-row button{border:0;border-radius:999px;padding:8px 16px;font:inherit;cursor:pointer;background:rgba(60,50,40,.08);color:inherit}.ev-row button.primary{background:#2a2622;color:#fcfaf6}' +
      '.ev-dialog .ev-h{margin:0 0 14px;font-size:17px;font-weight:650}.ev-lab{display:block;font-size:12.5px;font-weight:600;opacity:.8}.ev-name{display:flex;align-items:center;gap:6px;margin-top:6px}.ev-name input{flex:1;margin:0}.ev-ext{opacity:.65;font-weight:600}' +
      '.ev-dialog .ev-where{margin:12px 0 4px;font-weight:600;font-size:13px;white-space:normal}.ev-dialog .ev-note{margin:0 0 14px;font-size:12.5px;opacity:.72;white-space:normal}.ev-dialog .ev-err{color:#b3261e;margin:6px 0 0;font-size:12.5px}' +
      '.ev-open{max-width:min(520px,94vw)}.ev-open input[type=search]{margin-bottom:10px}.ev-list{max-height:min(46vh,380px);overflow:auto;margin:0 -6px 14px;display:grid;gap:2px}' +
      '.ev-file{display:grid;text-align:left;gap:2px;background:none;border:0;border-radius:10px;padding:9px 10px;font:inherit;color:inherit;cursor:pointer}.ev-file:hover,.ev-file:focus{background:rgba(60,50,40,.07);outline:none}.ev-file b{font-weight:600;word-break:break-word}.ev-file small{opacity:.65;font-size:12px}.ev-empty{opacity:.7;padding:10px;margin:0;white-space:normal}' +
      '.ev-toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:grid;gap:8px;max-width:min(560px,92vw)}.ev-toast{background:#2a2622;color:#fcfaf6;border-radius:12px;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .3s}' +
      '@media (prefers-color-scheme: dark){.ev-ui{color:#f1ece4}.ev-dialog,.ev-menu{background:#26221e;color:#f1ece4}.ev-dialog input{background:#1b1815;color:inherit;border-color:rgba(255,255,255,.18)}.ev-row button{background:rgba(255,255,255,.1)}.ev-row button.primary{background:#f1ece4;color:#1b1815}.ev-file:hover,.ev-file:focus,.ev-menu button:hover{background:rgba(255,255,255,.08)}}' +
      '@keyframes evpop{from{opacity:0;transform:scale(.96)}}@keyframes evfade{from{opacity:0}}';
    (document.head || document.documentElement).appendChild(st);
  }
  function closeMenus() { Array.prototype.forEach.call(document.querySelectorAll('.ev-menu'), function (m) { m.remove(); }); }
  function showMenu(items, x, y, parentMenu) {
    ensureStyle();
    if (!parentMenu) closeMenus();
    var m = document.createElement('div'); m.className = 'ev-ui ev-menu'; m.setAttribute('role', 'menu');
    (items || []).forEach(function (it) {
      if (it === '-' || it === null || (it && it.type === 'separator')) { m.appendChild(document.createElement('hr')); return; }
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.textContent = (it.checked ? '✓ ' : '') + (it.label || it.text || it.title || '') + (it.items ? '  ›' : '');
      if (it.disabled) b.disabled = true;
      b.onclick = function (e) {
        e.stopPropagation();
        if (it.items) { var r = b.getBoundingClientRect(); showMenu(it.items, r.right - 4, r.top, m); return; }
        closeMenus(); try { (it.action || it.onClick || function () {})(); } catch (x) { console.error(x); }
      };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
    if (!parentMenu) setTimeout(function () {
      var off = function (e) { if (!e.target.closest || !e.target.closest('.ev-menu')) { closeMenus(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); } };
      var esc = function (e) { if (e.key === 'Escape') { closeMenus(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); } };
      document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc, true);
    }, 0);
    var first = m.querySelector('button:not([disabled])'); if (first) first.focus({ preventScroll: true });
    return m;
  }
  function dialog(message, buttons, withInput, placeholder) {
    ensureStyle();
    return new Promise(function (resolve) {
      var s = document.createElement('div'); s.className = 'ev-ui ev-scrim';
      var d = document.createElement('div'); d.className = 'ev-dialog'; d.setAttribute('role', 'dialog');
      var p = document.createElement('p'); p.textContent = String(message == null ? '' : message); d.appendChild(p);
      var input = null;
      if (withInput) { input = document.createElement('input'); input.placeholder = placeholder || ''; input.value = withInput === true ? '' : String(withInput); d.appendChild(input); }
      var row = document.createElement('div'); row.className = 'ev-row';
      var done = function (v) { s.remove(); resolve(v); };
      (buttons && buttons.length ? buttons : [{ label: 'OK', value: true, type: 'primary' }]).forEach(function (bt, i, arr) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = bt.label || String(bt);
        if (bt.type === 'primary' || (i === arr.length - 1 && !arr.some(function (x) { return x.type === 'primary'; }))) b.className = 'primary';
        b.onclick = function () { done(input ? (bt.value === false ? null : input.value) : (bt.value !== undefined ? bt.value : bt.label || bt)); };
        row.appendChild(b);
      });
      if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(input.value); if (e.key === 'Escape') done(null); }); }
      d.appendChild(row); s.appendChild(d); document.body.appendChild(s);
      (input || row.lastChild).focus();
    });
  }
  function pickFiles(opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input'); inp.type = 'file';
      if (opts.multiple) inp.multiple = true;
      if (opts.directory) { inp.webkitdirectory = true; }
      var acc = opts.accept;
      if (Array.isArray(acc)) acc = acc.join(',');
      if (acc && typeof acc === 'object') acc = Object.keys(acc).join(',');
      if (acc) inp.accept = String(acc);
      inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      var settled = false;
      inp.addEventListener('change', function () { settled = true; var f = Array.prototype.slice.call(inp.files || []); inp.remove(); f.length ? resolve(f) : reject(err('cancelled', 'cancelled')); });
      inp.addEventListener('cancel', function () { if (settled) return; settled = true; inp.remove(); reject(err('cancelled', 'cancelled')); });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  // A file picked from the device lands on ~/Desktop. Re-picking the same file reuses its copy; a different file
  // with the same name gets a fresh name instead of overwriting what is already there.
  async function sameBytes(a, b) {
    if (a.size !== b.size) return false;
    if (a.size > 64 * 1024 * 1024) return false;
    var x = new Uint8Array(await a.arrayBuffer()), y = new Uint8Array(await b.arrayBuffer());
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  async function importPicked(path, file) {
    var p = normPath(path), n = await getNode(p);
    if (n && !n.is_dir) { try { if (await sameBytes(await fs.read(p), file)) return toItem(n); } catch (e) {} }
    return fs.write(p, file, { dedupeName: !!n });
  }
  /* ---- Pravahahub storage: names, locations, the Save / Open dialogs and device downloads ---- */
  var EXT_BY_TYPE = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/pdf': 'pdf',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods', 'application/vnd.oasis.opendocument.text': 'odt',
    'text/markdown': 'md', 'text/plain': 'txt', 'text/csv': 'csv', 'text/html': 'html', 'application/json': 'json',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/zip': 'zip',
  };
  // The document's title as the app shows it ("Budget — Spreadsheet" -> "Budget").
  function docTitle() {
    var t = String(document.title || '').split(/\s+[\u2014\u2013|\u00b7-]\s+/)[0].trim();
    return t && t.toLowerCase() !== String(APP).toLowerCase() ? t : '';
  }
  function safeName(n) { return String(n == null ? '' : n).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150); }
  function splitExt(n) { var m = /^(.*?)(\.[a-z0-9]{1,6})?$/i.exec(String(n || '')); return { stem: m[1], ext: m[2] || '' }; }
  // A device download always gets a real name: the file's own name, or else the document title, plus the right extension.
  function fileNameFor(blob, name) {
    var n = safeName(name);
    var ext = blob && EXT_BY_TYPE[String(blob.type || '').split(';')[0].trim().toLowerCase()];
    if (!n || /^(download|untitled-\d{9,})(\.[a-z0-9]{1,6})?$/i.test(n)) {
      var keep = splitExt(n).ext;
      n = (safeName(docTitle()) || 'Untitled') + (keep && !/^\.\d+$/.test(keep) ? keep : '');
    }
    if (ext && !splitExt(n).ext) n += '.' + ext;
    return n;
  }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileNameFor(blob, name);
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return a.download;
  }
  // "/me/AppData/spreadsheet/Spreadsheets/Budget.xlsx" -> "Pravahahub › Spreadsheets › Budget.xlsx"
  function hubLocation(path) {
    var segs = normPath(path).split('/').filter(Boolean);
    if (segs[0] === USERNAME) segs.shift();
    if (segs[0] === 'AppData' && segs.length > 2) segs = segs.slice(2);
    return ['Pravahahub'].concat(segs).join(' \u203a ');
  }
  function hubSavedText(path) { return 'Saved to ' + hubLocation(path) + ' (stored in this browser)'; }
  // Ask the browser to keep this site's storage (not evict it under pressure). Best effort; never throws.
  var persistAsked = false;
  function askPersist() {
    if (persistAsked) return Promise.resolve(null); persistAsked = true;
    try {
      var st = navigator.storage; if (!st || !st.persist) return Promise.resolve(null);
      return (st.persisted ? st.persisted() : Promise.resolve(false)).then(function (p) { return p || st.persist(); })
        .then(function (ok) { try { LS.setItem('everything:persisted', ok ? '1' : '0'); } catch (e) {} return !!ok; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function toastLocal(message, path) {
    if (!message) return;
    if (IN_FRAME) { post('toast', { message: message, action: path ? 'files' : undefined, path: path || undefined }); return; }
    ensureStyle();
    var box = document.getElementById('ev-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'ev-toasts'; box.className = 'ev-ui ev-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'ev-toast'; t.setAttribute('role', 'status'); t.textContent = message; box.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }, 5000);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // The Pravahahub Save dialog: name field (suggesting the document title), where it goes, and that it stays in this browser.
  function saveDialog(o) {
    ensureStyle();
    o = o || {};
    return new Promise(function (resolve) {
      var s = el('div', 'ev-ui ev-scrim'); var d = el('form', 'ev-dialog ev-save'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', o.title || 'Save to Pravahahub');
      d.appendChild(el('h3', 'ev-h', o.title || 'Save to Pravahahub'));
      var lab = el('label', 'ev-lab', 'File name'); var row = el('div', 'ev-name');
      var input = el('input'); input.type = 'text'; input.value = o.name || ''; input.setAttribute('aria-label', 'File name'); input.autocomplete = 'off'; input.spellcheck = false;
      row.appendChild(input); if (o.ext) row.appendChild(el('span', 'ev-ext', o.ext)); lab.appendChild(row); d.appendChild(lab);
      var errp = el('p', 'ev-err'); errp.hidden = true; d.appendChild(errp);
      d.appendChild(el('p', 'ev-where', 'Saves to ' + (o.location || 'Pravahahub \u203a Documents')));
      d.appendChild(el('p', 'ev-note', 'Stored in this browser on this device, not uploaded. Find it any time in Files on the Pravahahub home screen. Use Download to keep a copy on your device.'));
      var bar = el('div', 'ev-row');
      var cancel = el('button', '', 'Cancel'); cancel.type = 'button'; var ok = el('button', 'primary', o.confirm || 'Save'); ok.type = 'submit';
      bar.appendChild(cancel); bar.appendChild(ok); d.appendChild(bar); s.appendChild(d); document.body.appendChild(s);
      var finish = function (v) { s.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
      document.addEventListener('keydown', onKey, true);
      cancel.onclick = function () { finish(null); };
      s.addEventListener('pointerdown', function (e) { if (e.target === s) finish(null); });
      d.onsubmit = function (e) {
        e.preventDefault();
        var v = safeName(input.value);
        if (o.ext && v.toLowerCase().slice(-o.ext.length) === o.ext.toLowerCase()) v = v.slice(0, -o.ext.length).trim();
        if (!v) { errp.textContent = 'Enter a name'; errp.hidden = false; input.focus(); return; }
        finish(v);
      };
      setTimeout(function () { input.focus(); input.select(); }, 0);
    });
  }
  // The Pravahahub Open dialog: files saved in this browser (newest first), filtered to what the app opens, plus "From this device…".
  function acceptList(acc) {
    if (!acc) return [];
    if (typeof acc === 'string') acc = acc.split(',');
    else if (!Array.isArray(acc) && typeof acc === 'object') acc = Object.keys(acc).concat([].concat.apply([], Object.values(acc)));
    return acc.map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
  }
  function matchesAccept(node, acc) {
    if (!acc.length) return true;
    var name = node.name.toLowerCase(), type = String(node.type || guessType(node.name)).toLowerCase();
    return acc.some(function (a) { return a[0] === '.' ? name.slice(-a.length) === a : /\/\*$/.test(a) ? type.indexOf(a.slice(0, -1)) === 0 : type === a; });
  }
  async function hubFiles(acc) {
    var all = await reqP((await store('nodes')).getAll());
    return all.filter(function (n) { return !n.is_dir && n.path.indexOf(HOME + '/') === 0 && !/\/\.[^/]*/.test(n.path) && !/\/(Trash|node_modules|cache)(\/|$)/i.test(n.path) && matchesAccept(n, acc); })
      .sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
  }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function openDialog(o) {
    ensureStyle();
    return new Promise(async function (resolve) {
      var acc = acceptList(o.accept), files = [];
      try { files = (await hubFiles(acc)).filter(function (n) { return acc.length || !/\.json$/i.test(n.name) || n.path.indexOf(HOME + '/AppData/') !== 0; }); } catch (e) {}
      var s = el('div', 'ev-ui ev-scrim'); var d = el('div', 'ev-dialog ev-open'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Open from Pravahahub');
      d.appendChild(el('h3', 'ev-h', 'Open from Pravahahub'));
      d.appendChild(el('p', 'ev-note', 'Files you saved in this browser, newest first.'));
      var q = el('input'); q.type = 'search'; q.placeholder = 'Search saved files'; q.setAttribute('aria-label', 'Search saved files'); d.appendChild(q);
      var list = el('div', 'ev-list'); list.setAttribute('role', 'listbox'); d.appendChild(list);
      var bar = el('div', 'ev-row');
      var dev = el('button', '', 'From this device\u2026'); dev.type = 'button';
      var cancel = el('button', '', 'Cancel'); cancel.type = 'button';
      bar.appendChild(dev); bar.appendChild(cancel); d.appendChild(bar); s.appendChild(d); document.body.appendChild(s);
      var finish = function (v) { s.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
      document.addEventListener('keydown', onKey, true);
      cancel.onclick = function () { finish(null); };
      dev.onclick = function () { finish('device'); };
      s.addEventListener('pointerdown', function (e) { if (e.target === s) finish(null); });
      var render = function () {
        list.replaceChildren();
        var term = q.value.trim().toLowerCase();
        var shown = files.filter(function (n) { return !term || n.name.toLowerCase().indexOf(term) >= 0; }).slice(0, 200);
        if (!shown.length) { list.appendChild(el('p', 'ev-empty', files.length ? 'Nothing matches.' : 'No saved files here yet. Save a document first, or open one from this device.')); return; }
        shown.forEach(function (n) {
          var b = el('button', 'ev-file'); b.type = 'button'; b.setAttribute('role', 'option');
          b.appendChild(el('b', '', n.name));
          var where = hubLocation(dirname(n.path)).replace(/^Pravahahub( \u203a )?/, '') || 'Pravahahub';
          b.appendChild(el('small', '', where + ' \u00b7 ' + fmtSize(n.size || 0) + ' \u00b7 ' + new Date((n.modified || 0) * 1000).toLocaleString()));
          b.onclick = function () { finish(n); };
          list.appendChild(b);
        });
      };
      q.oninput = render; render();
      setTimeout(function () { (files.length ? q : dev).focus(); }, 0);
    });
  }
  async function pickFromDevice(opts) {
    var files = await pickFiles({ multiple: !!opts.multiple, accept: opts.accept });
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var it = await importPicked('~/Desktop/' + files[i].name, files[i]);
      Object.defineProperty(it, 'file', { enumerable: false, value: files[i] });
      Object.defineProperty(it, 'fromDevice', { enumerable: false, value: true });
      out.push(it);
    }
    return opts.multiple ? out : out[0];
  }
  var launchHandlers = [], closeHandler = null, msgHandlers = [], hubAsked = Object.create(null), hubAskedObj = new WeakSet();
  var ui = {
    env: 'web',
    // Opens files saved in Pravahahub (this browser); "From this device…" imports a file from the device instead.
    async showOpenFilePicker(opts) {
      opts = opts || {};
      if (opts.device || opts.fromDevice) return pickFromDevice(opts);
      await bootstrap();
      var pick = await openDialog(opts);
      if (pick === 'device') return pickFromDevice(opts);
      if (!pick) throw err('cancelled', 'cancelled');
      var it = toItem(pick);
      try { var b = await fs.read(pick.path); Object.defineProperty(it, 'file', { enumerable: false, value: new File([b], pick.name, { type: b.type || guessType(pick.name), lastModified: (pick.modified || 0) * 1000 }) }); } catch (e) {}
      return opts.multiple ? [it] : it;
    },
    async showDirectoryPicker(opts) {
      opts = opts || {};
      try {
        var files = await pickFiles({ directory: true });
        var root = files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'Imported';
        var dir = await fs.mkdir('~/Desktop/' + root, { dedupeName: true });
        for (var i = 0; i < files.length; i++) {
          var rel = files[i].webkitRelativePath.split('/').slice(1).join('/') || files[i].name;
          await fs.write(dir.path + '/' + rel, files[i], { overwrite: true });
        }
        return opts.multiple ? [dir] : dir;
      } catch (e) { throw e; }
    },
    // Save goes into Pravahahub storage (this browser) through the Hub Save dialog. It never opens the
    // operating system's save dialog and never downloads a copy behind the user's back: Download does that.
    async showSaveFilePicker(content, suggestedName, opts) {
      if (typeof content === 'string' && suggestedName === undefined && /\.[a-z0-9]{1,6}$/i.test(content) && content.length < 200) { suggestedName = content; content = undefined; }
      if (suggestedName && typeof suggestedName === 'object') { opts = suggestedName; suggestedName = opts.suggestedName; }
      opts = opts || {};
      var blob = content === undefined ? null : await toBlob(content, guessType(suggestedName || ''));
      var name = blob ? fileNameFor(blob, suggestedName) : (safeName(suggestedName) || safeName(docTitle()) || 'Untitled');
      var parts = splitExt(name), folder = '~/Documents';
      await bootstrap();
      var stem = opts.noDialog ? parts.stem : await saveDialog({ name: parts.stem, ext: parts.ext, location: hubLocation(folder) });
      if (stem == null) throw err('cancelled', 'Save cancelled.');
      var target = normPath(folder + '/' + stem + parts.ext), wopts = { overwrite: true };
      var clash = await getNode(target);
      if (clash && !opts.noDialog) {
        var choice = await dialog('A file named \u201c' + stem + parts.ext + '\u201d is already in ' + hubLocation(folder) + '. Replace it?', [{ label: 'Cancel', value: 'cancel' }, { label: 'Keep both', value: 'both' }, { label: 'Replace', value: 'replace', type: 'primary' }]);
        if (choice === 'cancel' || choice == null) throw err('cancelled', 'Save cancelled.');
        if (choice === 'both') wopts = { dedupeName: true };
      }
      var item = blob ? await fs.write(target, blob, wopts) : toItem(Object.assign(dirNode(target), { is_dir: false }));
      if (blob) { askPersist(); if (!opts.quiet) toastLocal(hubSavedText(item.path), item.path); }
      return item;
    },
    // Pravahahub helpers for apps: where a file lives, the "Saved to …" message, the name prompt for a first save, device downloads.
    hubLocation: function (path) { return hubLocation(path); },
    hubSavedText: function (path) { return hubSavedText(path); },
    hubSaved: function (path) { askPersist(); toastLocal(hubSavedText(path), normPath(path)); return hubSavedText(path); },
    // Returns undefined when no prompt is needed (the document already has a real name, or was asked about this session),
    // null when the user cancels, or the chosen name without extension.
    hubSaveName: async function (o) {
      o = o || {};
      var name = String(o.name || '').trim(), key = o.id != null && typeof o.id === 'object' ? o.id : o.id != null ? String(o.id) : null;
      var asked = function () { return key == null ? false : typeof key === 'object' ? hubAskedObj.has(key) : !!hubAsked[key]; };
      if (!o.force && !/^untitled\b/i.test(name)) return undefined;
      if (!o.force && asked()) return undefined;
      var ext = o.ext ? (o.ext[0] === '.' ? o.ext : '.' + o.ext) : '';
      var v = await saveDialog({ name: name || 'Untitled', ext: ext, location: o.location || hubLocation(o.folder ? (o.folder[0] === '/' || o.folder[0] === '~' ? o.folder : o.folder) : '~/Documents') });
      if (v != null) { if (key != null) { if (typeof key === 'object') hubAskedObj.add(key); else hubAsked[key] = 1; } askPersist(); }
      return v;
    },
    downloadFile: async function (content, name) { var blob = await toBlob(content, guessType(name || '')); return download(blob, name); },
    persistStorage: function () { persistAsked = false; return askPersist(); },
    contextMenu(o) { var items = Array.isArray(o) ? o : (o && o.items) || []; var x = o && o.position ? o.position.left || o.position.x : lastPointer.x, y = o && o.position ? o.position.top || o.position.y : lastPointer.y; showMenu(items, x, y); },
    async alert(message, buttons) { return dialog(message, buttons); },
    async prompt(message, placeholder, defaultValue) { return dialog(message, [{ label: 'Cancel', value: false }, { label: 'OK', type: 'primary' }], defaultValue != null ? String(defaultValue) || true : true, placeholder); },
    async confirm(message) { return dialog(message, [{ label: 'Cancel', value: false }, { label: 'OK', value: true, type: 'primary' }]); },
    async showColorPicker(def) { return new Promise(function (r) { var i = document.createElement('input'); i.type = 'color'; i.value = typeof def === 'string' ? def : (def && def.defaultColor) || '#000000'; i.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(i); i.onchange = function () { r(i.value); i.remove(); }; i.click(); }); },
    async showFontPicker() { return { fontFamily: 'Inter' }; },
    async launchApp(name, args) {
      var o = name && typeof name === 'object' ? name : { name: name, args: args };
      var appName = String(o.name || o.app || '');
      var a = Object.assign({}, o.args || (o !== name ? null : args) || {});
      var paths = [].concat(o.file_paths || o.items || a.items || a.file_paths || []).map(function (x) { return normPath(x && x.path ? x.path : x); });
      delete a.items; delete a.file_paths;
      if (o.background || (a.service && !paths.length)) return childApp(appName, a);
      post('launchApp', { target: appName, args: Object.assign({}, a, paths.length ? { items: paths } : {}) });
      return makeConn(null);
    },
    parentApp: function () { return PARENT_APP; },
    setWindowTitle: function (t) { try { document.title = String(t); } catch (e) {} post('setWindowTitle', { title: String(t) }); return Promise.resolve(); },
    setWindowSize: function () { return Promise.resolve(); }, setWindowWidth: function () { return Promise.resolve(); }, setWindowHeight: function () { return Promise.resolve(); },
    setWindowPosition: function () { return Promise.resolve(); }, setWindowX: function () { return Promise.resolve(); }, setWindowY: function () { return Promise.resolve(); },
    hideWindow: function () { post('hideWindow'); return Promise.resolve(); }, showWindow: function () { post('showWindow'); return Promise.resolve(); },
    toggleFullscreen: function () { post('fullscreen'); return Promise.resolve(); },
    onLaunchedWithItems: function (cb) { if (typeof cb === 'function') { launchHandlers.push(cb); if (pendingItems) deliverItems(pendingItems); } },
    onItemsOpened: function (cb) { ui.onLaunchedWithItems(cb); },
    onWindowClose: function (cb) { closeHandler = cb; post('closeHandler', { on: typeof cb === 'function' }); },
    on: function (ev, cb) { msgHandlers.push({ ev: ev, cb: cb }); }, off: function () {},
    getLanguage: function () { return Promise.resolve((navigator.language || 'en').split('-')[0]); },
    requestPermission: function () { return Promise.resolve(true); },
    authenticateWithEhub: function () { return Promise.resolve(Object.assign({}, USER)); },
    // No feedback channel exists: left undefined so apps that feature-detect it hide their Feedback entry.
    showFeedbackDialog: undefined,
    socialShare: function (url) { try { if (navigator.share) return navigator.share({ url: url }); } catch (e) {} return Promise.resolve(); },
    notify: function (o) { post('toast', { message: typeof o === 'string' ? o : (o && (o.text || o.title)) || '' }); return Promise.resolve(); },
    exit: function () { return ehubObj.exit(); },
    isWindowFocused: function () { return document.hasFocus(); },
  };
  /* ------------------------------------- app-to-app connections (launchApp / parentApp) */
  // An app launched in the background (e.g. Calendar asking Contacts for people) runs in a hidden same-origin
  // frame inside the caller; both sides talk through connection objects with postMessage / on('message').
  function makeConn(win) {
    var t = new EventTarget(), handlers = [];
    var c = {
      usesSDK: !!win, response: {}, _win: win, closed: false,
      postMessage: function (m) { if (c._win && !c.closed) try { c._win.postMessage({ everything: 1, type: 'appmsg', data: jsonClone(m) }, location.origin); } catch (e) {} },
      on: function (ev, fn) { handlers.push({ ev: ev, fn: fn }); return c; },
      off: function (ev, fn) { handlers = handlers.filter(function (h) { return !(h.ev === ev && (!fn || h.fn === fn)); }); return c; },
      addEventListener: function (ev, fn) { t.addEventListener(ev, fn); }, removeEventListener: function (ev, fn) { t.removeEventListener(ev, fn); },
      _emit: function (ev, data) {
        handlers.slice().forEach(function (h) { if (h.ev === ev) try { h.fn(data); } catch (e) { console.error(e); } });
        try { t.dispatchEvent(Object.assign(new Event(ev), { data: data })); } catch (e) {}
      },
      close: function () { if (c.closed) return; c.closed = true; if (c._frame) { try { c._frame.remove(); } catch (e) {} children.delete(c._win); } c._emit('close', {}); },
    };
    return c;
  }
  var children = new Map();
  function childApp(appName, args) {
    var id = String(appName).toLowerCase().replace(/^ehub[-_]/, '').replace(/[^a-z0-9-]/g, '-');
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none';
    var base = location.pathname.replace(/\/apps\/[^/]+\/.*$/, '/');
    f.src = base + 'apps/' + encodeURIComponent(id) + '/index.html?ehub.source_app.name=' + encodeURIComponent(APP) + '&everything-args=' + encodeURIComponent(JSON.stringify(args || {}));
    (document.body || document.documentElement).appendChild(f);
    var conn = makeConn(f.contentWindow); conn._frame = f;
    children.set(f.contentWindow, conn);
    f.addEventListener('load', function () { if (children.get(conn._win) !== conn) { children.delete(conn._win); conn._win = f.contentWindow; children.set(conn._win, conn); } });
    f.addEventListener('error', function () { conn.close(); });
    return conn;
  }
  var LAUNCH_ARGS = (function () { try { var q = new URLSearchParams(location.search).get('everything-args'); return q ? JSON.parse(q) : null; } catch (e) { return null; } })();
  var SOURCE_APP = (function () { try { return new URLSearchParams(location.search).get('ehub.source_app.name') || ''; } catch (e) { return ''; } })();
  var PARENT_APP = (function () {
    if (!IN_FRAME || !SOURCE_APP) return null;
    var c = makeConn(window.parent); c.name = SOURCE_APP; c.appName = SOURCE_APP;
    c.close = function () { ehubObj.exit(); };
    return c;
  })();

  var pendingItems = null;
  async function deliverItems(paths) {
    pendingItems = paths;
    if (!launchHandlers.length) return;
    pendingItems = null;
    var items = [];
    for (var i = 0; i < paths.length; i++) { try { items.push(await fs.stat(paths[i])); } catch (e) {} }
    if (!items.length) return;
    launchHandlers.forEach(function (h) { try { h(items); } catch (e) { console.error(e); } });
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.everything !== 1 || e.source !== window.parent) return;
    var d = e.data;
    if (d.type === 'items' && Array.isArray(d.items)) deliverItems(d.items);
    if (d.type === 'requestClose') { if (closeHandler) { try { closeHandler(); } catch (x) { ehubObj.exit(); } } else ehubObj.exit(); }
    if (d.type === 'message') msgHandlers.forEach(function (h) { if (h.ev === 'message') try { h.cb(d.data); } catch (x) {} });
    if (d.type === 'appmsg' && PARENT_APP) PARENT_APP._emit('message', d.data);
  });
  // messages from apps this one launched in the background
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.everything !== 1) return;
    var c = children.get(e.source); if (!c) return;
    var d = e.data;
    if (d.type === 'appmsg') c._emit('message', d.data);
    else if (d.type === 'exit') c.close();
    else if (d.type === 'toast' || d.type === 'launchApp') post(d.type, d);
  });
  try {
    var q = new URLSearchParams(location.search).get('everything-items') || (/[#&]everything-items=([^&]+)/.exec(location.hash) || [])[1];
    if (q) pendingItems = JSON.parse(decodeURIComponent(q));
  } catch (e) {}

  /* ------------------------------------------------------------------- net */
  var net = {
    fetch: function (u, init) {
      var url = parseURL(u);
      if (!ONLINE || !url || url.origin === ORIGIN || workerTarget(u) || isBlockedURL(u)) return window.fetch(u, init);
      init = Object.assign({}, init || {});
      var h = new Headers(init.headers || {}); h.set('x-ehub-target', url.href); h.set('x-ehub-auth', AUTH_TOKEN);
      init.headers = h;
      return apiFetch(ORIGIN + '/api/fetch', init);
    },
    Socket: function () { var t = new EventTarget(); t.write = function () {}; t.close = function () {}; t.on = function (n, f) { t.addEventListener(n, function (e) { f(e.detail); }); }; setTimeout(function () { t.dispatchEvent(new CustomEvent('error', { detail: 'Raw sockets are not available in Everything' })); }, 0); return t; },
  };
  net.tls = { TLSSocket: net.Socket };

  /* ------------------------------------------------------------ ehub global */
  var ADJ = ['amber', 'brisk', 'calm', 'dapper', 'eager', 'fancy', 'gentle', 'happy', 'ivory', 'jolly', 'kind', 'lucky', 'mellow', 'nimble', 'olive', 'plucky', 'quiet', 'rosy', 'sunny', 'tidy', 'umber', 'vivid', 'warm', 'young', 'zesty'];
  var NOUN = ['acorn', 'brook', 'cedar', 'dune', 'ember', 'fern', 'grove', 'harbor', 'iris', 'juniper', 'kite', 'lark', 'meadow', 'nest', 'orchid', 'pebble', 'quill', 'river', 'sparrow', 'thistle', 'umbra', 'valley', 'willow', 'yarrow', 'zephyr'];
  var ehubObj = {
    __everything: true,
    version: '3.0.0-everything-hub',
    env: SOURCE_APP && IN_FRAME ? 'app' : 'web',
    args: LAUNCH_ARGS || {},
    appID: APP,
    appName: APP,
    appDataPath: HOME + '/AppData/' + APP,
    APIOrigin: ONLINE ? ORIGIN : 'https://api.everything-hub.invalid',
    defaultAPIOrigin: 'https://api.everything-hub.invalid',
    defaultGUIOrigin: location.origin,
    authToken: AUTH_TOKEN,
    username: USERNAME,
    auth: auth, fs: fs, kv: kv, ai: ai, email: email, workers: workers, hosting: hosting, apps: apps,
    peer: peer, events: events, perms: perms, ui: ui, net: net,
    teams: { async list() { return []; }, async get() { return null; } },
    os: { async user() { return Object.assign({}, USER); }, async version() { return { version: 'local' }; } },
    threads: { async create() { return { uid: 'th-' + rid(4) }; }, async list() { return []; }, async subscribe() { return { off: function () {} }; } },
    setAuthToken: function () {}, setAPIOrigin: function () {}, setAppID: function () {}, resetAuthToken: function () {},
    initSubmodules: function () {}, configure: function () {},
    randName: function (sep) { sep = sep == null ? '-' : sep; return ADJ[Math.random() * ADJ.length | 0] + sep + NOUN[Math.random() * NOUN.length | 0] + sep + (Math.random() * 10000 | 0); },
    print: function () { var s = Array.prototype.slice.call(arguments).join(' '); console.log('[print]', s); try { var d = document.createElement('div'); d.innerHTML = s; (document.body || document.documentElement).appendChild(d); } catch (e) {} },
    exit: function (code) { post('exit', { code: code || 0 }); return Promise.resolve(); },
    on: function () {}, off: function () {},
    isLocal: !ONLINE,
  };

  /* Never throw on missing members: unknown properties become harmless no-ops. */
  function noop(name) {
    var target = function () {
      if (/^(is|has|can)[A-Z_]/.test(name)) return false;
      if (/^list/.test(name)) return Promise.resolve([]);
      return Promise.resolve(undefined);
    };
    return new Proxy(target, {
      get: function (t, p) {
        if (p === 'then' || p === 'catch' || p === 'finally' || p === 'toJSON' || typeof p === 'symbol') return p === Symbol.toPrimitive ? function () { return ''; } : undefined;
        if (p === 'name') return name; if (p === 'length') return 0;
        return noop(String(p));
      },
    });
  }
  var NS_FALLBACK = { perms: function () { return function () { return Promise.resolve(true); }; } };
  function wrap(obj, nsName, depth) {
    return new Proxy(obj, {
      get: function (t, p, r) {
        if (typeof p === 'symbol' || p in t) {
          var v = Reflect.get(t, p, r);
          if (depth < 1 && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof EventTarget) && Object.getPrototypeOf(v) === Object.prototype) return wrapped[p] || (wrapped[p] = wrap(v, p, depth + 1));
          return v;
        }
        if (p === 'then' || p === 'toJSON' || p === 'catch' || p === 'finally') return undefined;
        if (NS_FALLBACK[nsName]) return NS_FALLBACK[nsName](p);
        if (/^[A-Z_]+$/.test(String(p))) return undefined;
        return noop(String(p));
      },
    });
  }
  var wrapped = {};
  var ehub = wrap(ehubObj, 'ehub', 0);
  try { Object.defineProperty(window, 'ehub', { value: ehub, writable: true, configurable: true, enumerable: true }); } catch (e) { window.ehub = ehub; }
  window.__ehubCore = { app: APP, user: USER, normPath: normPath, db: db, aiConfig: aiConfig };

  /* Hub shortcuts from inside an app: Cmd/Ctrl+K and Cmd/Ctrl+1..9, unless the app handled them. */
  /* Service workers: the hub's own worker (at the site root) caches every app. App-level workers (apps/<id>/sw.js)
     would sit in front of it with their own, older caches and serve stale pages, so registering one goes to the hub
     worker instead (push, notifications and offline keep working through it) and leftovers from earlier builds go away. */
  (function () {
    var sw = navigator.serviceWorker; if (!sw || !sw.register || !/^https?:$/.test(location.protocol)) return;
    var m = /^(.*?\/)apps\/[^/]+\//.exec(location.pathname); if (!m) return;
    var root = m[1], nreg = sw.register.bind(sw);
    var isAppScope = function (scope) { try { return new URL(scope).pathname.indexOf(root + 'apps/') === 0; } catch (e) { return false; } };
    try {
      sw.register = function (url, opts) {
        var u = parseU(url);
        if (u && u.origin === location.origin && u.pathname !== root + 'sw.js') return nreg(root + 'sw.js', { scope: root });
        return nreg(url, opts);
      };
    } catch (e) {}
    function parseU(u) { try { return new URL(String(u), location.href); } catch (e) { return null; } }
    if (sw.getRegistrations) sw.getRegistrations().then(function (regs) {
      var mine = false;
      regs.forEach(function (r) { if (isAppScope(r.scope)) { if (sw.controller && r.active && sw.controller.scriptURL === r.active.scriptURL) mine = true; r.unregister().catch(function () {}); } });
      // This page itself came from an app-level worker: load it once more from the hub worker / network.
      if (mine) { var k = 'everything:sw-cleanup:' + location.pathname; try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); location.reload(); } } catch (e) {} }
    }).catch(function () {});
  })();

  if (IN_FRAME) window.addEventListener('keydown', function (e) {
    var mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey || e.defaultPrevented) return;
    var k = String(e.key || '').toLowerCase();
    if (k === 'k' || /^[1-9]$/.test(k)) { e.preventDefault(); post('key', { combo: 'mod+' + k }); }
  });

  bootstrap().catch(function (e) { console.warn('[ehub-local] drive unavailable', e); });
  if (ONLINE) setTimeout(function () { authReady(); }, 0);
  post('ready', { title: document.title });
  try { document.dispatchEvent(new Event('ehub.ready')); window.dispatchEvent(new Event('ehub-ready')); } catch (e) {}
})();
