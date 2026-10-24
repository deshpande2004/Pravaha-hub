// Pravahaxhub server: static site (./site) + /api/* on the same Cloudflare Worker.
//   /api/health                      status and which optional features are configured
//   /api/session                     claim this browser's identity and get its signature (see runtime.js)
//   /api/ai/...                      OpenAI-compatible chat, images, transcription, speech on Workers AI (binding AI)
//   /api/fetch                       CORS-free proxy for ehub.net.fetch (target in x-ehub-target)
//   /api/email/send                  outbound mail through Resend when RESEND_API_KEY is set
//   /api/peer/<code>                 WebSocket signalling room for ehub.peer (Durable Object PeerRoom); also the
//                                    server relay (data + WebCodecs media) when no direct WebRTC path exists
//   /api/diag[/<code>]               POST: a client's connection-diagnostics snapshot for a meeting code (no secrets; rate-limited,
//                                    last 200 kept, wiped 72 h after the last write). GET /api/diag/<code>?k=<key>: read them
//                                    back; <key> is a random key a client posted with (shown in its Connection info).
//   /api/turn                        ICE servers for ehub.peer: Cloudflare Realtime TURN when CF_TURN_KEY_ID + CF_TURN_KEY_API_TOKEN are set, else STUN
//   /api/w/<app>/<instance>/<path>   an app's team server (Durable Object AppServer runs the app's own script)
//   /api/site/<name>[/f/<path>]      publish a drive folder (ehub.hosting); served publicly at /s/<name>/<path>
import { DurableObject } from 'cloudflare:workers';
import { SCRIPTS, BY_APP, FIXED } from './apps/index.js';
import { aiChatCompletions, aiImages, aiTranscribe, aiSpeech, aiChatSimple } from './ai.js';
import { sendEmail, emailConfigured } from './email.js';
import { makeKV, makeFS, identityFromHeaders, verifiedIdentity, signUuid, sysCall, markClaimed, json, Router } from './runtime.js';

const BUILD = '2026-10-18-core';

/* ------------------------------------------------------------------ limits
 * Soft rate limits that protect the free Workers AI / request quota and the mail key from abuse.
 * Counted per user, per client IP and (for AI and email) across the whole hub. Override any number with an
 * env var of the same name, e.g. LIMIT_AI_USER_DAY = "500". */
const LIMITS = {
  LIMIT_AI_USER_MIN: 20, LIMIT_AI_USER_DAY: 300, LIMIT_AI_IP_DAY: 1500, LIMIT_AI_GLOBAL_DAY: 4000,
  LIMIT_IMAGE_USER_DAY: 25, LIMIT_IMAGE_GLOBAL_DAY: 300,
  LIMIT_FETCH_USER_MIN: 120, LIMIT_FETCH_IP_MIN: 240, LIMIT_FETCH_USER_DAY: 5000,
  LIMIT_EMAIL_USER_DAY: 30, LIMIT_EMAIL_IP_DAY: 60, LIMIT_EMAIL_GLOBAL_DAY: 300,
  LIMIT_SESSION_IP_HOUR: 300, LIMIT_TURN_IP_HOUR: 240,
};
const lim = (env, k) => { const v = Number(env && env[k]); return Number.isFinite(v) && v > 0 ? v : LIMITS[k]; };
const clientIP = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'local';
function bucketsFor(env, kind, who, ip) {
  const u = who ? who.uuid : 'anon', B = [];
  const add = (k, name, win) => B.push({ k: kind + ':' + k, limit: lim(env, name), win });
  if (kind === 'ai') { add('u:' + u, 'LIMIT_AI_USER_MIN', 60); add('u:' + u, 'LIMIT_AI_USER_DAY', 86400); add('ip:' + ip, 'LIMIT_AI_IP_DAY', 86400); add('all', 'LIMIT_AI_GLOBAL_DAY', 86400); }
  if (kind === 'image') { add('u:' + u, 'LIMIT_IMAGE_USER_DAY', 86400); add('all', 'LIMIT_IMAGE_GLOBAL_DAY', 86400); }
  if (kind === 'fetch') { add('u:' + u, 'LIMIT_FETCH_USER_MIN', 60); add('ip:' + ip, 'LIMIT_FETCH_IP_MIN', 60); add('u:' + u, 'LIMIT_FETCH_USER_DAY', 86400); }
  if (kind === 'email') { add('u:' + u, 'LIMIT_EMAIL_USER_DAY', 86400); add('ip:' + ip, 'LIMIT_EMAIL_IP_DAY', 86400); add('all', 'LIMIT_EMAIL_GLOBAL_DAY', 86400); }
  if (kind === 'session') add('ip:' + ip, 'LIMIT_SESSION_IP_HOUR', 3600);
  if (kind === 'turn') add('ip:' + ip, 'LIMIT_TURN_IP_HOUR', 3600);
  return B;
}
// Returns null when allowed, or a 429 Response.
export async function rateLimit(env, kind, who, ip) {
  if (env && env.LIMITS_OFF === '1') return null;
  let r;
  try { r = await sysCall(env, 'limits', 'hit', { buckets: bucketsFor(env, kind, who, ip || 'local') }); }
  catch (e) { return null; } // never fail closed because the counter is unreachable
  if (r && r.ok === false) {
    const what = { ai: 'AI', image: 'image generation', fetch: 'web requests', email: 'email', session: 'sign-ins' }[kind] || kind;
    const msg = /:all$/.test(r.bucket || '') ? `Pravahaxhub has reached today's ${what} limit. Try again tomorrow.`
      : `You've reached the ${what} limit for now. Try again in ${fmtWait(r.retryAfter)}.`;
    return json({ success: false, error: { code: 'rate_limited', message: msg }, message: msg }, 429, { 'retry-after': String(r.retryAfter || 60) });
  }
  return null;
}
function fmtWait(s) { s = Number(s) || 60; return s < 90 ? s + ' seconds' : s < 5400 ? Math.ceil(s / 60) + ' minutes' : Math.ceil(s / 3600) + ' hours'; }
async function readJSON(request, maxBytes) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw Object.assign(new Error('That request is too large.'), { status: 413 });
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('That request is too large.'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('The request body is not valid JSON.'), { status: 400 }); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (/^\/s\/[a-z0-9][a-z0-9-]{1,62}(\/|$)/.test(url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
      try { return await serveSite(env, url); } catch (e) { return json({ message: 'Not found' }, 404); }
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      const status = e && e.status >= 400 && e.status < 600 ? e.status : 500;
      return json({ success: false, error: { code: status === 500 ? 'server_error' : 'bad_request', message: String((e && e.message) || e) }, message: String((e && e.message) || e) }, status);
    }
  },
};

async function api(request, env, url) {
  const p = url.pathname;
  if (p === '/api/health' || p === '/api/') {
    return json({ ok: true, name: 'everything-hub', build: BUILD, ai: !!env.AI, email: emailConfigured(env), turn: turnConfigured(env), teamServers: Object.keys(BY_APP).length, sharedServers: Object.keys(FIXED).length, time: new Date().toISOString() });
  }
  // The /api is for this site's own pages: refuse calls made from other origins (browsers send Origin on those).
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin && origin !== 'null') return json({ success: false, error: { code: 'forbidden', message: 'Cross-site requests are not allowed.' } }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
  const ip = clientIP(request);
  if (p === '/api/session' && request.method === 'POST') return session(request, env, ip);
  if (p.startsWith('/api/ai/')) {
    if (!env.AI) return json({ error: { message: 'AI is not enabled on this server.' } }, 503);
    const who = await verifiedIdentity(env, request.headers);
    if (!who) return json({ error: { message: 'Open this from an Pravahaxhub app.' } }, 401);
    const tail = p.slice('/api/ai'.length);
    if (tail === '/models') return json({ data: [{ id: 'default', object: 'model', owned_by: 'everything-hub' }] });
    if (request.method !== 'POST') return json({ error: { message: 'Not found' } }, 404);
    const known = ['/chat/completions', '/images/generations', '/audio/transcriptions', '/audio/speech'];
    if (!known.includes(tail)) return json({ error: { message: 'Not found' } }, 404);
    const limited = await rateLimit(env, tail === '/images/generations' ? 'image' : 'ai', who, ip);
    if (limited) return limited;
    if (tail === '/chat/completions') return aiChatCompletions(env, await readJSON(request, 12 * 1024 * 1024));
    if (tail === '/images/generations') return aiImages(env, await readJSON(request, 64 * 1024));
    if (tail === '/audio/transcriptions') {
      if (Number(request.headers.get('content-length') || 0) > 26 * 1024 * 1024) return json({ error: { message: 'Audio is too long.' } }, 413);
      return aiTranscribe(env, await request.formData());
    }
    return aiSpeech(env, await readJSON(request, 64 * 1024));
  }
  if (p === '/api/fetch') return proxyFetch(request, env, url, ip);
  if (p === '/api/turn') return turnServers(request, env, ip);
  if (p === '/api/email/send' && request.method === 'POST') {
    const who = await verifiedIdentity(env, request.headers);
    if (!who) return json({ message: 'Sign-in token missing.' }, 401);
    if (!emailConfigured(env)) return json({ configured: false, message: 'Email sending is not set up on this server.' }, 503);
    const limited = await rateLimit(env, 'email', who, ip);
    if (limited) return limited;
    const r = await sendEmail(env, await readJSON(request, 30 * 1024 * 1024), who);
    return json(r, r.delivered && r.delivered.length ? 200 : 502);
  }
  let m = /^\/api\/diag(?:\/([A-Za-z0-9_.-]{1,80}))?$/.exec(p);
  if (m) {
    let code = m[1] || url.searchParams.get('code') || '';
    if (!code && request.method === 'POST') {
      const peek = await request.clone().text().catch(() => '');
      try { code = String(JSON.parse(peek).code || ''); } catch {}
    }
    code = String(code).toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80);
    if (!code) return json({ message: 'Meeting code missing.' }, 400);
    const stub = env.PEER_ROOM.get(env.PEER_ROOM.idFromName('diag:' + code));
    const init = { method: request.method, headers: { 'content-type': 'application/json' } };
    if (request.method === 'POST') init.body = await request.text();
    return stub.fetch('https://diag.internal/diag/' + code + url.search, init);
  }
  m = /^\/api\/peer\/([^/]{1,80})$/.exec(p);
  if (m) {
    if (request.headers.get('upgrade') !== 'websocket') return json({ message: 'WebSocket expected' }, 426);
    const id = env.PEER_ROOM.idFromName(decodeURIComponent(m[1]));
    return env.PEER_ROOM.get(id).fetch(request);
  }
  m = /^\/api\/site\/([a-z0-9][a-z0-9-]{1,62})(?:\/f\/(.+))?$/.exec(p);
  if (m) return siteAPI(request, env, m[1], m[2] == null ? null : m[2]);
  m = /^\/api\/w\/([a-z0-9-]{1,60})\/([a-z0-9-]{1,63})(\/.*)?$/.exec(p);
  if (m) return routeWorker(env, m[1], m[2], m[3] || '/', url.search, request);
  return json({ message: 'Not found' }, 404);
}

export function scriptFor(app, inst) {
  if (FIXED[inst]) return FIXED[inst];
  if (BY_APP[app]) return BY_APP[app];
  return null;
}

export async function routeWorker(env, app, inst, path, search, request) {
  const key = scriptFor(app, inst);
  if (!key) return json({ message: 'This app has no team server on Pravahaxhub.' }, 404);
  const stub = env.APP_SERVER.get(env.APP_SERVER.idFromName(key + '|' + inst));
  const h = new Headers(request.headers);
  h.delete('x-ehub-sys');
  h.set('x-ehub-key', key); h.set('x-ehub-inst', inst); h.set('x-ehub-app', app); h.set('x-ehub-path', path + (search || ''));
  h.set('x-ehub-origin', new URL(request.url).origin);
  const init = { method: request.method, headers: h, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  return stub.fetch('https://app-server.internal/', init);
}

/* ------------------------------------------------------------------- session */
// POST /api/session with the browser's current token and {secret}: claims its uuid (first come) and returns the
// signature the engine adds to its tokens. Re-claiming with the same secret returns the same signature.
async function session(request, env, ip) {
  const who = identityFromHeaders(request.headers);
  if (!who) return json({ message: 'Token missing.' }, 401);
  const body = await readJSON(request, 4096);
  const secret = typeof body.secret === 'string' && body.secret.length >= 16 && body.secret.length <= 200 ? body.secret : null;
  if (!secret) return json({ message: 'A browser secret is required.' }, 400);
  const limited = await rateLimit(env, 'session', who, ip);
  if (limited) return limited;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ehub-secret:' + secret));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const r = await sysCall(env, 'auth', 'claim', { uuid: who.uuid, hash });
  if (!r.ok) return json({ success: false, claimed: true, message: 'This identity belongs to another browser.' }, 409);
  markClaimed(who.uuid);
  return json({ success: true, uuid: who.uuid, sig: await signUuid(env, who.uuid) });
}

/* ---------------------------------------------------------------- fetch proxy */
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.invalid|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;
const MAX_PROXY_BYTES = 25 * 1024 * 1024;
async function proxyFetch(request, env, self, ip) {
  const target = request.headers.get('x-ehub-target') || new URL(request.url).searchParams.get('url');
  let u;
  try { u = new URL(target); } catch { return json({ message: 'A valid target URL is required.' }, 400); }
  if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname) || u.hostname === self.hostname) return json({ message: 'That address cannot be fetched.' }, 403);
  const who = await verifiedIdentity(env, request.headers);
  if (!who) return json({ message: 'Sign-in token missing.' }, 401);
  const limited = await rateLimit(env, 'fetch', who, ip);
  if (limited) return limited;
  const h = new Headers();
  for (const [k, v] of request.headers) {
    if (/^(host|cookie|origin|referer|x-ehub-.*|ehub-auth|cf-.*|x-forwarded-.*|x-real-ip|content-length)$/i.test(k)) continue;
    h.set(k, v);
  }
  const init = { method: request.method, headers: h, redirect: 'follow', signal: AbortSignal.timeout(25000) };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  let r;
  try { r = await fetch(u.href, init); } catch (e) { return json({ message: 'Could not reach ' + u.hostname + '.' }, 502); }
  try { if (new URL(r.url).hostname === self.hostname) return json({ message: 'That address cannot be fetched.' }, 403); } catch {}
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_PROXY_BYTES) return json({ message: 'That response is too large to proxy.' }, 413);
  const out = new Headers(r.headers);
  out.delete('set-cookie'); out.delete('content-security-policy'); out.delete('strict-transport-security');
  out.set('x-ehub-final-url', r.url);
  let body = r.body;
  if (body && !len) {
    let seen = 0;
    body = body.pipeThrough(new TransformStream({ transform(chunk, c) { seen += chunk.byteLength; if (seen > MAX_PROXY_BYTES) c.error(new Error('too large')); else c.enqueue(chunk); } }));
  }
  return new Response(body, { status: r.status, statusText: r.statusText, headers: out });
}

/* ------------------------------------------------------------ published sites */
const SITE_MAX_FILE = 10 * 1024 * 1024;
const siteStub = (env, name) => env.APP_SERVER.get(env.APP_SERVER.idFromName('site|' + name));
function siteOp(env, name, op, extra = {}, body) {
  const h = new Headers({ 'x-ehub-site': op, 'x-ehub-site-name': name });
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return siteStub(env, name).fetch('https://site.internal/', { method: body !== undefined ? 'POST' : 'GET', headers: h, body });
}
async function siteAPI(request, env, name, rel) {
  const who = await verifiedIdentity(env, request.headers);
  if (!who) return json({ message: 'Sign-in token missing.' }, 401);
  const dec = (r) => { try { return decodeURIComponent(r); } catch { return r; } };
  const path = rel == null ? null : rel.split('/').map(dec).join('/');
  const m = request.method;
  if (rel == null && m === 'POST') return siteOp(env, name, 'claim', { 'x-ehub-uuid': who.uuid });
  if (rel == null && m === 'DELETE') return siteOp(env, name, 'drop', { 'x-ehub-uuid': who.uuid });
  if (path != null && m === 'PUT') {
    if (Number(request.headers.get('content-length') || 0) > SITE_MAX_FILE) return json({ message: 'Files on a published site can be up to 10 MB.' }, 413);
    const buf = await request.arrayBuffer();
    if (buf.byteLength > SITE_MAX_FILE) return json({ message: 'Files on a published site can be up to 10 MB.' }, 413);
    return siteOp(env, name, 'put', { 'x-ehub-uuid': who.uuid, 'x-ehub-site-path': encodeURIComponent(path), 'x-ehub-site-type': request.headers.get('content-type') || '' }, buf);
  }
  if (path != null && m === 'DELETE') return siteOp(env, name, 'del', { 'x-ehub-uuid': who.uuid, 'x-ehub-site-path': encodeURIComponent(path) });
  return json({ message: 'Not found' }, 404);
}
async function serveSite(env, url) {
  const [, , name, ...rest] = url.pathname.split('/');
  let path = rest.map((x) => { try { return decodeURIComponent(x); } catch { return x; } }).join('/');
  if (!rest.length) return Response.redirect(url.origin + '/s/' + name + '/' + url.search, 301);
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const r = await siteOp(env, name, 'get', { 'x-ehub-site-path': encodeURIComponent(path) });
  const h = new Headers(r.headers);
  // Published pages are other people's content: run them in an opaque origin so they can't touch this hub's data.
  h.set('content-security-policy', "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals");
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'no-referrer');
  return new Response(r.body, { status: r.status, headers: h });
}

/* ------------------------------------------------------------ ICE / TURN */
const STUN_ONLY = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
const TURN_TTL = 86400;
const turnConfigured = (env) => !!(env && env.CF_TURN_KEY_ID && env.CF_TURN_KEY_API_TOKEN);
// GET /api/turn -> { iceServers, ttl, turn }. TURN credentials are minted for signed-in browsers only; everyone else,
// and every failure, gets STUN (direct connections still work on most networks).
async function turnServers(request, env, ip) {
  const stun = (why) => json({ iceServers: STUN_ONLY, ttl: 3600, turn: false, reason: why }, 200, { 'cache-control': 'no-store' });
  if (!turnConfigured(env)) return stun('not_configured');
  const who = await verifiedIdentity(env, request.headers);
  if (!who) return stun('not_signed_in');
  const limited = await rateLimit(env, 'turn', who, ip);
  if (limited) return stun('rate_limited');
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { authorization: `Bearer ${env.CF_TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: TURN_TTL }),
    });
    if (!r.ok) return stun('turn_error_' + r.status);
    const j = await r.json();
    let ice = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    // Browsers time out on the :53 variants that some networks block; keep them out.
    ice = ice.map((s) => ({ ...s, urls: [].concat(s.urls || []).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
    if (!ice.length) return stun('turn_empty');
    return json({ iceServers: ice, ttl: TURN_TTL, turn: true }, 200, { 'cache-control': 'no-store' });
  } catch (e) { return stun('turn_unreachable'); }
}

/* ------------------------------------------------------------ peer signalling */
// Relay budgets: one relayed camera+mic stream is ~60-80 KB/s; a host relaying to several guests sends one per guest.
const DIAG_MAX_POST = 24 * 1024, DIAG_MAX_ENTRY = 16 * 1024, DIAG_KEEP = 200;
const PEER_MSGS_PER_SEC = 200, PEER_BYTES_PER_SEC = 640 * 1024, PEER_ROOM_BYTES_PER_SEC = 2.5 * 1024 * 1024;
export class PeerRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keep-alive pings are answered here without waking the object or reaching the other peers.
    try { this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}')); } catch {}
  }
  async fetch(request) {
    if (new URL(request.url).pathname.startsWith('/diag/')) return this.diag(request);
    if (this.ctx.getWebSockets().length >= 48) return new Response('Room is full', { status: 429 });
    // ?sid=<random id the engine keeps for this page>: lets relayed traffic be addressed to one socket.
    let sid = '';
    try { sid = (new URL(request.url).searchParams.get('sid') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24); } catch {}
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], sid ? ['s:' + sid] : []);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  // Per-socket and per-room budgets for relayed traffic (in memory; reset if the object is evicted, which is fine).
  allow(ws, bytes) {
    const now = Date.now();
    if (!this.rate) this.rate = new WeakMap();
    if (!this.room || now - this.room.t >= 1000) this.room = { t: now, b: 0 };
    let r = this.rate.get(ws);
    if (!r || now - r.t >= 1000) { r = { t: now, b: 0, n: 0 }; this.rate.set(ws, r); }
    r.n++; r.b += bytes; this.room.b += bytes;
    return r.n <= PEER_MSGS_PER_SEC && r.b <= PEER_BYTES_PER_SEC && this.room.b <= PEER_ROOM_BYTES_PER_SEC;
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg === 'string') {
      if (msg.length > 262144 || !this.allow(ws, msg.length)) return;
      // Messages addressed to one socket ("dst") go only there; everything else (dial/answer/ice) is broadcast.
      let dst = null;
      if (msg.indexOf('"dst":"') >= 0) { try { const m = JSON.parse(msg); if (m && typeof m.dst === 'string') dst = m.dst.replace(/[^A-Za-z0-9]/g, '').slice(0, 24); } catch {} }
      const targets = dst ? this.ctx.getWebSockets('s:' + dst) : this.ctx.getWebSockets();
      for (const other of targets) if (other !== ws) { try { other.send(msg); } catch {} }
      return;
    }
    // Binary: relayed media, [0xE1][sid length][sid][payload], forwarded untouched to that socket.
    const u = new Uint8Array(msg);
    if (u.length < 4 || u[0] !== 0xE1 || u.length > 1048576) return;
    const n = u[1];
    if (!n || n > 24 || u.length < 2 + n) return;
    let sid = '';
    for (let i = 2; i < 2 + n; i++) sid += String.fromCharCode(u[i]);
    if (/[^A-Za-z0-9]/.test(sid) || !this.allow(ws, u.length)) return;
    for (const other of this.ctx.getWebSockets('s:' + sid)) if (other !== ws) { try { other.send(msg); } catch {} }
  }
  async webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {} }
  // Connection diagnostics for one meeting code (this object is named 'diag:<code>' and holds no sockets).
  async diag(request) {
    const url = new URL(request.url), st = this.ctx.storage, now = Date.now();
    const pad = (n) => String(n).padStart(10, '0');
    const nocache = { 'cache-control': 'no-store' };
    if (request.method === 'POST') {
      if (!this.dr || now - this.dr.t >= 1000) this.dr = { t: now, n: 0 };
      if (++this.dr.n > 12) return json({ ok: false, message: 'Slow down.' }, 429, nocache);
      const text = await request.text();
      if (text.length > DIAG_MAX_POST) return json({ ok: false, message: 'Too large.' }, 413, nocache);
      let b; try { b = JSON.parse(text); } catch { return json({ ok: false, message: 'Bad JSON.' }, 400, nocache); }
      const k = String((b && b.k) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
      if (k.length < 12) return json({ ok: false, message: 'Key missing.' }, 400, nocache);
      const id = String(b.id || '').replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 48);
      if (!this.dc) this.dc = new Map();
      const last = this.dc.get(id + '|' + k) || 0;
      if (now - last < 1500) return json({ ok: false, message: 'Slow down.' }, 429, nocache);
      this.dc.set(id + '|' + k, now);
      if (this.dc.size > 200) this.dc.clear();
      const meta = (await st.get('meta')) || { seq: 0, first: 1, keys: [] };
      if (!meta.keys.includes(k)) { meta.keys.push(k); if (meta.keys.length > 32) meta.keys.shift(); }
      let entry = { t: now, id, d: b.d === undefined ? null : b.d };
      if (JSON.stringify(entry).length > DIAG_MAX_ENTRY) entry = { t: now, id, truncated: true, d: JSON.stringify(b.d).slice(0, DIAG_MAX_ENTRY - 200) };
      meta.seq++;
      await st.put('e:' + pad(meta.seq), entry);
      const drop = [];
      while (meta.seq - meta.first + 1 > DIAG_KEEP) drop.push('e:' + pad(meta.first++));
      if (drop.length) await st.delete(drop);
      await st.put('meta', meta);
      await st.setAlarm(now + 72 * 3600 * 1000);
      return json({ ok: true, seq: meta.seq }, 200, nocache);
    }
    if (request.method !== 'GET') return json({ message: 'Not found' }, 404);
    const meta = await st.get('meta');
    const k = (url.searchParams.get('k') || '').replace(/[^A-Za-z0-9]/g, '');
    if (!meta) return json({ ok: false, message: 'No diagnostics for this meeting code.' }, 404, nocache);
    if (!k || !meta.keys.includes(k)) return json({ ok: false, entries: meta.seq - meta.first + 1, message: 'A diagnostics key from Connection info is needed (?k=).' }, 403, nocache);
    const since = Math.max(Number(url.searchParams.get('since')) || 0, meta.first - 1);
    const limit = Math.min(DIAG_KEEP, Math.max(1, Number(url.searchParams.get('limit')) || DIAG_KEEP));
    const rows = await st.list({ start: 'e:' + pad(since + 1), prefix: 'e:', limit });
    const entries = []; for (const [key, v] of rows) entries.push(Object.assign({ seq: Number(key.slice(2)) }, v));
    return json({ ok: true, code: url.pathname.split('/')[2], seq: meta.seq, first: meta.first, entries }, 200, nocache);
  }
  async alarm() { try { await this.ctx.storage.deleteAll(); } catch {} }
  async webSocketError(ws) { try { ws.close(1011, 'error'); } catch {} }
}

/* ------------------------------------------------------------- app team servers */
const SYSTEM_OWNER = { uuid: '00000000-0000-4000-8000-000000000000', username: 'everything-hub' };

export class AppServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.router = null; this.key = null; this.inst = null; this.owner = null;
  }

  async boot(key, inst, app, origin) {
    this.origin = origin;
    if (this.router && this.key === key) return;
    this.key = key; this.inst = inst; this.app = app;
    this.owner = (await this.ctx.storage.get('sys:owner')) || null;
    const router = new Router();
    const self = this;
    const meCtx = {
      get ehub() { return self.ehubFor(self.owner || SYSTEM_OWNER, 'me', null); },
    };
    const install = SCRIPTS[key];
    const lazy = new Proxy({}, { get: (_, k) => meCtx.ehub[k], has: (_, k) => k in meCtx.ehub });
    install(router, meCtx, lazy);
    this.router = router;
  }

  ehubFor(who, ns, req) {
    const self = this, env = this.env;
    const proof = req && req.proof;
    const fsx = makeFS(this.ctx.storage, ns, who, `/${ns === 'me' ? 'owner' : who.username}/AppData/${this.inst}`, (id) => `https://${this.inst}.ehub.work/__file/${id}`);
    if (proof) {
      const baseStat = fsx.stat, baseRead = fsx.read;
      fsx.stat = async (p, o) => (normProof(p) === proof.path ? { id: 'proof', uid: 'proof', name: proof.path.split('/').pop(), path: proof.path, is_dir: false, size: proof.bytes.length, is_shared: false, owner: { username: who.username, uuid: who.uuid }, created: Date.now() / 1000 | 0, modified: Date.now() / 1000 | 0 } : baseStat(p, o));
      fsx.read = async (p, o) => (normProof(p) === proof.path ? new Blob([proof.bytes], { type: 'application/json' }) : baseRead(p, o));
    }
    return {
      kv: makeKV(this.ctx.storage, ns),
      fs: fsx,
      auth: {
        isSignedIn: () => true,
        getUser: async () => ({ uuid: who.uuid, username: who.username, email: who.username + '@users.everything-hub', email_confirmed: true, is_temp: false }),
        whoami: async () => ({ uuid: who.uuid, username: who.username }),
      },
      email: {
        send: async (msg) => {
          if (!emailConfigured(env)) { const e = new Error('Email sending is not set up on this Pravahaxhub server yet.'); e.code = 'email_not_configured'; e.status = 503; throw e; }
          const limited = await rateLimit(env, 'email', who.uuid === SYSTEM_OWNER.uuid ? null : who, 'server');
          if (limited) { const j = await limited.json(); throw Object.assign(new Error(j.message), { status: 429, code: 'rate_limited' }); }
          const r = await sendEmail(env, msg || {}, who);
          if (!r.delivered || !r.delivered.length) { const e = new Error(r.message || 'The email could not be sent.'); e.status = 502; throw e; }
          return r;
        },
        sendTransactional: async (msg) => self.ehubFor(who, ns, req).email.send(msg),
      },
      ai: {
        chat: async (...a) => {
          const limited = await rateLimit(env, 'ai', who.uuid === SYSTEM_OWNER.uuid ? null : who, 'server');
          if (limited) { const j = await limited.json(); throw Object.assign(new Error(j.message), { status: 429, code: 'rate_limited' }); }
          return aiChatSimple(env, ...a);
        },
      },
      workers: {
        exec: async (u, init) => {
          const url = new URL(String(u && u.url ? u.url : u));
          const m = /^([a-z0-9-]+)\.ehub\.work$/i.exec(url.hostname);
          if (!m) return fetch(u, init);
          const h = new Headers((init && init.headers) || {});
          if (req && req.token) { h.set('x-ehub-auth', req.token); if (!h.has('ehub-auth')) h.set('ehub-auth', req.token); }
          return routeWorker(env, this.app, m[1].toLowerCase(), url.pathname, url.search, new Request('https://hub.internal/', { ...(init || {}), headers: h }));
        },
        create: async () => { throw new Error('Team servers cannot create other servers.'); },
      },
      peer: { serve: async () => { throw new Error('Not available on the server.'); } },
      authToken: (req && req.token) || 'server.' + btoa(JSON.stringify({ t: 'au', uu: who.uuid })) + '.hub',
      APIOrigin: this.origin || 'https://everything-hub.invalid',
      env: 'worker',
    };
  }

  // A published site ("site|<name>"): owner, then files in the same chunked store team servers use.
  async site(request) {
    const h = request.headers, st = this.ctx.storage, op = h.get('x-ehub-site'), uuid = h.get('x-ehub-uuid');
    const owner = await st.get('site:owner');
    const fsx = makeFS(st, 'site', SYSTEM_OWNER, '/', () => '');
    const path = (() => { try { return decodeURIComponent(h.get('x-ehub-site-path') || ''); } catch { return ''; } })().replace(/^\/+/, '');
    if (op === 'get') {
      if (!owner) return json({ message: 'This site does not exist.' }, 404);
      try { const b = await fsx.read('/' + path); return new Response(b, { headers: { 'content-type': b.type || 'application/octet-stream', 'cache-control': 'public, max-age=60' } }); }
      catch { return new Response('<!doctype html><meta charset="utf-8"><title>Not found</title><p style="font:15px system-ui;padding:40px">This page isn’t published.</p>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }); }
    }
    if (op === 'claim') {
      if (owner && owner.uuid !== uuid) return json({ message: 'That site name is taken.' }, 409);
      if (!owner) await st.put('site:owner', { uuid, at: Date.now() });
      return json({ success: true, subdomain: h.get('x-ehub-site-name') });
    }
    if (!owner) return json({ message: 'This site does not exist.' }, 404);
    if (owner.uuid !== uuid) return json({ message: 'Only the person who published this site can change it.' }, 403);
    if (op === 'put') {
      if (!path || path.length > 1000 || path.split('/').some((x) => x === '..')) return json({ message: 'Bad path.' }, 400);
      const count = (await st.get('site:files')) || 0;
      if (count > 5000) return json({ message: 'This site has too many files.' }, 413);
      const type = h.get('x-ehub-site-type') || '';
      const blob = new Blob([await request.arrayBuffer()], { type: /^[\w.+-]+\/[\w.+-]+/.test(type) && !/octet-stream/.test(type) ? type : '' });
      const existed = await fsx.exists('/' + path);
      await fsx.write('/' + path, blob, { overwrite: true });
      if (!existed) await st.put('site:files', count + 1);
      return json({ success: true });
    }
    if (op === 'del') {
      if (path === '*' || path === '') { const kids = await st.list({ prefix: 'fs:site:' }); for (const k of [...kids.keys()]) await st.delete(k); await st.put('site:files', 0); }
      else await fsx.delete('/' + path);
      return json({ success: true });
    }
    if (op === 'drop') { await st.deleteAll(); return json({ success: true }); }
    return json({ message: 'Unknown operation' }, 400);
  }

  // System instances ("sys|auth", "sys|limits") reached only from this Worker's own code.
  async sys(op, body) {
    const st = this.ctx.storage;
    if (op === 'key') {
      let k = await st.get('auth:key');
      if (!k) { const raw = crypto.getRandomValues(new Uint8Array(32)); k = btoa(String.fromCharCode(...raw)); await st.put('auth:key', k); }
      return { key: k };
    }
    if (op === 'claimed') return { claimed: !!(await st.get('claim:' + String(body.uuid || '').toLowerCase())) };
    if (op === 'claim') {
      const id = 'claim:' + String(body.uuid || '').toLowerCase(), cur = await st.get(id);
      if (cur && cur.hash !== body.hash) return { ok: false };
      if (!cur) await st.put(id, { hash: body.hash, at: Date.now() });
      return { ok: true };
    }
    if (op === 'hit') {
      // fixed windows; minute windows live in memory, longer ones are persisted
      const now = Math.floor(Date.now() / 1000);
      this.mem = this.mem || new Map();
      const cur = [];
      for (const b of body.buckets || []) {
        const win = Number(b.win) || 60, slot = Math.floor(now / win), id = b.k + '|' + win + '|' + slot;
        let n = this.mem.get(id);
        if (n === undefined) n = win > 60 ? (await st.get('rl:' + id)) || 0 : 0;
        if (n >= b.limit) return { ok: false, bucket: b.k, retryAfter: (slot + 1) * win - now };
        cur.push([id, n, win]);
      }
      for (const [id, n, win] of cur) { this.mem.set(id, n + 1); if (win > 60) st.put('rl:' + id, n + 1); }
      if (this.mem.size > 20000) this.mem.clear();
      if (Math.random() < 0.002) { // drop counters from past windows
        const old = await st.list({ prefix: 'rl:', limit: 1000 }), dead = [];
        for (const k of old.keys()) { const [, w, sl] = k.slice(3).split('|'); if ((Number(sl) + 1) * Number(w) < now) dead.push(k); }
        for (let i = 0; i < dead.length; i += 128) await st.delete(dead.slice(i, i + 128));
      }
      return { ok: true };
    }
    return { error: 'unknown op' };
  }

  async fetch(request) {
    const h = request.headers;
    const sysOp = h.get('x-ehub-sys');
    if (sysOp) return json(await this.sys(sysOp, await request.json().catch(() => ({}))));
    if (h.get('x-ehub-site')) return this.site(request);
    const key = h.get('x-ehub-key'), inst = h.get('x-ehub-inst'), app = h.get('x-ehub-app');
    const pathq = h.get('x-ehub-path') || '/';
    if (!key || !SCRIPTS[key]) return json({ message: 'Not found' }, 404);
    await this.boot(key, inst, app, h.get('x-ehub-origin'));
    const who = await verifiedIdentity(this.env, h);
    const [path] = pathq.split('?');

    if (path === '/__deploy') {
      if (!who) return json({ message: 'Sign in first.' }, 401);
      if (!this.owner && !Object.values(FIXED).includes(key)) { this.owner = { uuid: who.uuid, username: who.username }; await this.ctx.storage.put('sys:owner', this.owner); }
      return json({ success: true, name: inst, owner: this.owner ? this.owner.username : SYSTEM_OWNER.username });
    }
    if (path.startsWith('/__file/')) {
      const id = path.slice('/__file/'.length);
      const rec = await this.ctx.storage.get('sys:url:' + id);
      if (!rec || rec.exp < Date.now()) return json({ message: 'This link has expired.' }, 410);
      const fsx = makeFS(this.ctx.storage, rec.ns, SYSTEM_OWNER, '/', () => '');
      try { const b = await fsx.read(rec.path); return new Response(b, { headers: { 'content-type': b.type || 'application/octet-stream', 'cache-control': 'private, max-age=300' } }); }
      catch { return json({ message: 'Not found' }, 404); }
    }

    let proof = null;
    if (who && h.get('x-ehub-proof-file')) {
      try { proof = { path: normProof(decodeURIComponent(h.get('x-ehub-proof-path') || '')), bytes: b64urlDecode(h.get('x-ehub-proof-file')) }; } catch {}
    }
    const token = h.get('ehub-auth') || h.get('x-ehub-auth') || null;
    const fwd = new Headers();
    for (const [k, v] of h) if (!/^x-ehub-/.test(k) && !/^cf-/.test(k)) fwd.set(k, v);
    const init = { method: request.method, headers: fwd };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
    const req = new Request(`https://${inst}.ehub.work${pathq}`, init);
    const reqCtx = { token, proof };
    const user = who ? { uuid: who.uuid, username: who.username, ehub: this.ehubFor(who, 'u:' + who.uuid, reqCtx) } : null;
    if (this.owner == null && who && !Object.values(FIXED).includes(key)) { this.owner = { uuid: who.uuid, username: who.username }; await this.ctx.storage.put('sys:owner', this.owner); }
    return this.router.handle(req, user);
  }
}

function normProof(p) { return String(p || '').replace(/\/+/g, '/').replace(/\/$/, ''); }
function b64urlDecode(s) {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
