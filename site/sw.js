/* Pravahaxhub — service worker.
 * Shell (launcher + engine): network-first with cache fallback, so updates land and offline still works.
 * Apps: page HTML is network-first (a fresh deploy never pairs an old page with deleted chunks);
 *       content-hashed build assets are cache-first (they never change); everything else is stale-while-revalidate.
 * The app cache survives updates so apps opened before keep working offline; only the shell cache is versioned.
 * Retired hosts (*.invalid) are never contacted; the old SDK address is answered with everything-core.js. */
const VERSION = 'everything-v4-pravahaxhub-5';
const SHELL = `${VERSION}-shell`;
const APPS = 'everything-apps-v4';
const FONTS = 'everything-fonts-v4';
const SHELL_FILES = ['./', 'index.html', 'hub.css', 'hub.js', 'apps.json', 'everything-core.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'icon-32.png', 'fonts.css', 'fonts/InstrumentSerif-italic-latin-1.woff2', 'fonts/InstrumentSerif-italic-latin-ext-0.woff2', 'fonts/InstrumentSerif-normal-latin-3.woff2', 'fonts/InstrumentSerif-normal-latin-ext-2.woff2', 'fonts/Inter-normal-latin-5.woff2', 'fonts/Inter-normal-latin-ext-4.woff2'];
const EHUB = /\.invalid$/i;
const TRACKERS = /(^|\.)(plausible\.io|google-analytics\.com|googletagmanager\.com|analytics\.google\.com|segment\.io|cdn\.segment\.com|mixpanel\.com|hotjar\.com|posthog\.com|sentry\.io)$/i;
// Build assets patched in place (same hashed name) by a Hub release; purged from the app cache on activate
// so returning users get the new code. Keep entries listed until clients have upgraded.
const PATCHED_ASSETS = ['apps/3d/assets/index-B6r-KXEZ.js','apps/accounting/assets/index-Y31yui-2.js','apps/accounting/assets/settings-CP85JtO7.js','apps/api-client/assets/dialogs-CjlVilq_.js','apps/api-client/assets/index-as9whK8r.js','apps/api-client/assets/palette-CvdwbpC5.js','apps/api-client/assets/share-dialog-DDO5MBjf.js','apps/audio-studio/assets/index-8P22Te0p.js','apps/backgammon/assets/index-dZJhCa9o.js','apps/building-design/assets/index-CIDxgC1x.js','apps/cad/assets/index-Dxi7HpPg.js','apps/calendar/assets/index-BeMMxs5v.js','apps/cap-table/assets/index-DTihSR7v.js','apps/checkers/assets/index-BqoeE6Q-.js','apps/chess/assets/index-NvEpspkx.js','apps/childcare/assets/index-DJd6RqZ6.js','apps/childcare/assets/invite-dls0ZHby.js','apps/childcare/assets/settings-Bk1cgAG2.js','apps/circuits/assets/index-84R54k65.js','apps/contacts/assets/index-CQYbMPR5.js','apps/contracts/assets/index-G3Ro83Lt.js','apps/crm/assets/index-CCcsfaL6.js','apps/documents/assets/app-2gvRhKgQ.js','apps/documents/assets/editor-CexbhN6S.js','apps/documents/assets/live-DoLSHGxb.js','apps/email/assets/index-mKch2_rH.js','apps/expense/assets/index-CQX4Bl8N.js','apps/field-service/assets/docview-lpwiGVr8.js','apps/field-service/assets/index-BJpHn5NE.js','apps/field-service/assets/settings-mEWGs9yD.js','apps/fleet/assets/dashboard-m_4U9JBi.js','apps/fleet/assets/index-CScxJ6zY.js','apps/fleet/assets/settings-W108mSon.js','apps/help-desk/assets/admin-data-CqsQWF-j.js','apps/help-desk/assets/admin-settings-BsEqnmPW.js','apps/help-desk/assets/admin-team-C7i8CYWZ.js','apps/help-desk/assets/backend-DdutCYsP.js','apps/help-desk/assets/main-CMybr4j1.js','apps/help-desk/assets/portal-7qAaSG5l.js','apps/hiring/assets/index-DFs488NA.js','apps/inventory/assets/index-BhXBrgSa.js','apps/invoicing/assets/index-Ckf7dMda.js','apps/legal/assets/index-2Azg8vQ7.js','apps/legal/assets/settings-hhHZo-wd.js','apps/meetings/assets/index-a-9772Cq.js','apps/music-studio/assets/index-BntBOMcR.js','apps/notes/assets/index-D1Qt5D3-.js','apps/parametric/assets/index-B507JEqP.js','apps/pdf/assets/editor-Djn6p-i7.js','apps/pdf/assets/index-C4zgv6ok.js','apps/photo-studio/assets/ai-ZUhTTzXL.js','apps/photo-studio/assets/automate-Cr-57-1D.js','apps/photo-studio/assets/controller-BgfBBOcJ.js','apps/photo-studio/assets/ehub-ai-Os6wm_ZF.js','apps/photo-studio/assets/export-dialog-CeqhFSBN.js','apps/photo-studio/assets/generate-DGFBpkFG.js','apps/photo-studio/assets/generate-QgqrUJhQ.js','apps/photo-studio/assets/index-Co4NJiJb.js','apps/photo-studio/assets/layers-export-CNw8d1x3.js','apps/photo-studio/assets/lens-batch-0JU5msaC.js','apps/photo-studio/assets/linked-CMUzWcZZ.js','apps/photo-studio/assets/match-font-DTqjA_Ob.js','apps/photo-studio/assets/page-export-Dfd2qtfq.js','apps/photo-studio/assets/panel-CAITmfxz.js','apps/photo-studio/assets/run-vbalXdsC.js','apps/photo-studio/assets/save-BoQHqG1h.js','apps/photo-studio/assets/service-CxF9h9Nk.js','apps/photo-studio/assets/share-D-crC3OH.js','apps/photo-studio/assets/sources-BFo-O4hk.js','apps/photo-studio/assets/statistics-Bh4P0ubU.js','apps/photo-studio/assets/tour-ui-DJt8W1m-.js','apps/photo-studio/assets/upscale-DHCatkoB.js','apps/photo-studio/assets/windows-C23eCePo.js','apps/photo-studio/assets/workspace-BfErIjyV.js','apps/pos/assets/index-CMZAKqCj.js','apps/presentation/assets/index-ByIk42KT.js','apps/projects/assets/index-BuquFqAF.js','apps/property-management/assets/compose-CoL7S6Kd.js','apps/property-management/assets/index-BFiwFIrS.js','apps/property-management/assets/settings-BmDVSnpm.js','apps/records/assets/index-G_S-DMGH.js','apps/shifts/assets/index-DtOIn22I.js','apps/signatures/assets/flatten-DqhnUhsA.js','apps/signatures/assets/main-D67b6-Nh.js','apps/spreadsheet/assets/index-CLkObwvf.js','apps/sudoku/assets/index-B4xHpJs-.js','apps/survey/assets/ai-dialog-B3PMozDn.js','apps/survey/assets/collect-BlzgDNCH.js','apps/survey/assets/home-B5al16t0.js','apps/survey/assets/main-DTxNUr04.js','apps/survey/assets/render-CxyYFoqL.js','apps/survey/assets/worker-source-BXg7CeG3.js','apps/tasks/assets/index-Dh8JAiwj.js','apps/teamchat/assets/index-DgTtbPFM.js','apps/time-tracking/assets/index-DrBhUOgM.js','apps/vector-studio/assets/index-CPyENg6u.js','apps/vector-studio/assets/lazy-BiZ-GXqw.js','apps/vector-studio/assets/save-for-web-DoLlJZvC.js','apps/video-studio/assets/dub-dialog-V3OJDGGH.js','apps/video-studio/assets/editor-C7CDekoh.js','apps/video-studio/assets/index-J6AT80FR.js','apps/video-studio/assets/review-page-DTtrVgO4.js','apps/video-studio/assets/script-video-DcaRqyeq.js','apps/video-studio/assets/script-video-uDonu1qI.js','apps/video-studio/assets/threads-CEz74RD4.js','apps/whiteboard/assets/admin-ui-CjHTGYb4.js','apps/whiteboard/assets/host-DnBi7s44.js','apps/whiteboard/assets/index-BYOKjIPH.js','apps/wiki/assets/index-tPTMAYcW.js'];
const HASHED = /\/assets\/[^/]+[-.][A-Za-z0-9_]{8,}\.(?:js|mjs|css|wasm|woff2?|ttf|png|jpe?g|webp|avif|svg|gif|json|data|bin)$/;

// Install never fails on a flaky (mobile) connection: each shell file is cached on its own; a miss is fetched later.
// A failed install would leave an older worker (and its old pages) in charge indefinitely.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map(async (f) => { const r = await fetch(new Request(f, { cache: 'reload' })); if (r.ok) await c.put(f, await clean(r)); }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, APPS, FONTS]);
    const keys = await caches.keys();
    // Caches from the first service-worker generations (before network-first app pages) can hold app pages that
    // need the retired SDK file; pages already open under them show "SDK failed to load". Purge and reload once.
    const legacy = keys.some((k) => !keep.has(k) && !/^everything-(v4-|apps-v4$|fonts-v4$)/.test(k));
    for (const k of keys) if (!keep.has(k)) await caches.delete(k);
    if (keys.includes(APPS)) {
      const ac = await caches.open(APPS);
      await Promise.allSettled(PATCHED_ASSETS.map((f) => ac.delete(new URL(f, scopeURL).href, { ignoreSearch: true })));
    }
    await self.clients.claim();
    // Pages already open under those caches are reloaded by the hub (frames without a working engine) when this
    // worker takes control; WindowClient.navigate() is not used because some Chrome builds close the tab instead.
    if (legacy) for (const w of await self.clients.matchAll({ type: 'window' })) w.postMessage({ type: 'ehub-sw-upgraded', legacy: true });
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data && e.data.type === 'ehub-sw-version' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: VERSION });
});

const scopeURL = new URL(self.registration.scope);
const inShell = (url) => url.origin === scopeURL.origin && SHELL_FILES.some((f) => new URL(f, scopeURL).pathname === url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (EHUB.test(url.hostname)) {
    if (/^sdk\.everything-hub\.invalid$/i.test(url.hostname)) {
      e.respondWith(caches.match(new URL('everything-core.js', scopeURL).href).then((r) => r || fetch(new URL('everything-core.js', scopeURL))).catch(() => new Response('', { headers: { 'content-type': 'text/javascript' } })));
    } else {
      e.respondWith(new Response(JSON.stringify({ success: false, error: { code: 'offline_local', message: 'Pravahaxhub runs locally.' } }), { status: 503, headers: { 'content-type': 'application/json' } }));
    }
    return;
  }
  if (TRACKERS.test(url.hostname)) { e.respondWith(new Response(/\.js(\?|$)/.test(url.pathname) ? '' : null, { status: /\.js(\?|$)/.test(url.pathname) ? 200 : 204, headers: { 'content-type': 'text/javascript' } })); return; }
  if (req.method !== 'GET') return;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(cacheFirst(req, FONTS)); return; }
  if (url.origin !== scopeURL.origin) return;
  if (url.pathname.startsWith(scopeURL.pathname + 'api/')) return; // the server API is never cached
  if (url.pathname === new URL('everything-core.js', scopeURL).pathname) { e.respondWith(networkFirst(req, SHELL, false, 4000)); return; }
  if (req.mode === 'navigate' && url.pathname === scopeURL.pathname || inShell(url)) { e.respondWith(networkFirst(req, SHELL, true)); return; }
  if (url.pathname.startsWith(scopeURL.pathname + 'apps/') || url.pathname.startsWith(scopeURL.pathname + 'icons/')) {
    if (req.headers.has('range')) return; // media seeking goes straight to the network
    if (req.mode === 'navigate' || /\/$|\.html?$/.test(url.pathname)) { e.respondWith(networkFirst(req, APPS, false)); return; }
    if (HASHED.test(url.pathname)) { e.respondWith(cacheFirst(req, APPS)); return; }
    e.respondWith(staleWhileRevalidate(req, APPS, e));
  }
});

// Network-first; app pages ignore the query (everything-items/args) when falling back to the cache.
// With waitMs, a slow network answer loses to a cached copy (the fresh one still refreshes the cache).
async function networkFirst(req, name, shell, waitMs) {
  const c = await caches.open(name);
  const key = shell || waitMs ? req : stripQuery(req.url);
  const net = fetch(req).then((res) => { if (res.ok && res.status === 200) c.put(key, res.clone()).catch(() => {}); return res; });
  const fallback = async () => {
    const hit = await c.match(key, { ignoreSearch: true });
    if (hit) return clean(hit);
    if (req.mode === 'navigate') { const home = shell ? await c.match('./') || await c.match('index.html') : null; if (home) return clean(home); return offline(); }
    return Response.error();
  };
  if (waitMs) {
    const hit = await c.match(key, { ignoreSearch: true });
    if (hit) {
      const timer = new Promise((r) => setTimeout(() => r(null), waitMs));
      const res = await Promise.race([net.catch(() => null), timer]);
      if (res && res.status < 500) return res;
      net.catch(() => {});
      return clean(hit);
    }
  }
  try { return await net; } catch { return fallback(); }
}
// A navigation must never be answered with a redirected response (Chrome turns it into a network error).
async function clean(res) {
  if (!res || !res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}
function stripQuery(u) { const x = new URL(u); x.search = ''; x.hash = ''; return x.href; }
async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()).catch(() => {}); return res; } catch { return Response.error(); }
}
async function staleWhileRevalidate(req, name, e) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreSearch: /everything-(items|args)/.test(new URL(req.url).search) });
  const net = fetch(req).then((res) => { if (res.ok && res.status === 200) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || offline();
}
function offline() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:15px system-ui;padding:40px;color:#444">You’re offline and this part of Pravahaxhub hasn’t been saved on this device yet. Open it once while online to use it offline.</body>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// Push and notifications for apps (they register through the hub's worker). Payload: { title, body, app, route, tag, icon }.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const app = typeof d.app === 'string' ? d.app : '';
  e.waitUntil(self.registration.showNotification(d.title || 'Pravahaxhub', {
    body: d.body || '', tag: d.tag || undefined, icon: d.icon || (app ? `apps/${app}/icon-128.png` : 'icon-192.png'), badge: 'icon-192.png',
    data: Object.assign({}, d.data || {}, { app, route: d.route || (d.data && d.data.route) || '' }),
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const target = new URL(d.app ? `./#/app/${encodeURIComponent(d.app)}` : './', scopeURL).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hub = wins.find((w) => w.frameType !== 'nested' && new URL(w.url).pathname === scopeURL.pathname);
    if (hub) { try { await hub.focus(); } catch {} hub.postMessage({ type: 'ehub-notification', app: d.app, route: d.route }); return; }
    await self.clients.openWindow(target);
  })());
});
