/*
 * Offline support for the app shell. Data never goes through here: records
 * come from Pravahax Suite and are cached by the app itself in IndexedDB.
 *
 * - Page loads: network first, falling back to the cached shell offline.
 * - Hashed build assets: cache first (their names change with every build).
 * - Other same-origin files (icons, manifest): stale while revalidate.
 * - The Pravahax Suite SDK: network first, with a copy for starting offline.
 * - Other cross-origin requests (Pravahax Suite's API) are never touched, and
 *   neither is the team worker source, which owners deploy from here.
 */
const SDK = '../../everything-core.js';
// Filled in by the build (vite.config.js): this build's files, so the app
// opens offline after a single visit, and a cache per build, so the files
// of earlier builds are dropped.
const BUILD = '4293a0ca55ff';
const ASSETS = ["./assets/assignments-BaHjzFVl.js","./assets/chart-BvkGqc7s.js","./assets/common-jv9CUs_g.js","./assets/contact-detail-Ca3ayctA.js","./assets/contact-form-CFGylA3q.js","./assets/contacts-_RNDGuyo.js","./assets/costs-BToewCOj.js","./assets/csv-CKyxhRj1.js","./assets/dashboard-m_4U9JBi.js","./assets/documents-J4-Gza7J.js","./assets/expenses-DmzgeDPz.js","./assets/failures-D5BC932W.js","./assets/form-Cy_XYoZ-.js","./assets/fuel-CcN7_wP-.js","./assets/fuel-form-CyQ1eKt7.js","./assets/fuel-m4ow1LfT.js","./assets/grid-IpFosmZ1.js","./assets/importers-DIv1tTpg.js","./assets/index-C3Tl9ano.css","./assets/index-CScxJ6zY.js","./assets/inspection-detail-B8F0FJhI.js","./assets/inspection-form-builder-CaA0ycoh.js","./assets/inspection-forms-Xy27_ptF.js","./assets/inspection-run-8V4_g1vN.js","./assets/inspections-BfxmZqGa.js","./assets/issue-detail-hTlYDbwp.js","./assets/issue-form-B9DhiO54.js","./assets/issues-QeaAFx5i.js","./assets/line-items-DC8whEmi.js","./assets/meters-B3U8GIGt.js","./assets/onboarding-Ci1SXgWi.js","./assets/part-detail-CgF1WXU7.js","./assets/part-form-CFKTSa_d.js","./assets/parts-C9FmKXCD.js","./assets/purchase-order-detail-RepyCB2F.js","./assets/purchase-order-form-BzWnBAbI.js","./assets/purchase-orders-Dzudu5Cn.js","./assets/reminder-detail-B2cZPcVu.js","./assets/reminder-form-BlkoyDjt.js","./assets/reminders-Da2hRJts.js","./assets/renewals-TwDgQ6ZR.js","./assets/report-defs-D_0eKjJ0.js","./assets/report-qCWzjvgn.js","./assets/reports-ROqMOP5t.js","./assets/sample-Caz4RbbL.js","./assets/sample-data-C2VKFACh.js","./assets/service-BKiJ3q-J.js","./assets/service-detail-BPdpT9KP.js","./assets/service-doc-Bs39NKnA.js","./assets/service-form-DMp8YiBk.js","./assets/service-program-CiATaEve.js","./assets/service-programs-DadCTez-.js","./assets/service-tasks-DgRt9Mzd.js","./assets/settings-W108mSon.js","./assets/vehicle-detail-C-EHzd6M.js","./assets/vehicle-form-BfoQdCSE.js","./assets/vehicles-Bn3rQ_I_.js","./assets/vendor-detail-Cijx1ugm.js","./assets/vendor-form-BrA8nNz4.js","./assets/vendors-BiCCHVob.js","./assets/work-order-detail-a9xaMzRN.js","./assets/work-orders-lnObtpZx.js"];
const CACHE = `fleet-${BUILD}`;
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './favicon.ico'];

// This build's copy first: the previous build's cache is kept for a while,
// and caches.match() alone would find its older page and SDK first.
const cached = (req) => caches.open(CACHE).then((c) => c.match(req)).then((hit) => hit || caches.match(req));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll([...SHELL, ...ASSETS]);
        // The page loaded the SDK before this worker existed; keep a copy now.
        await fetch(SDK, { mode: 'no-cors' })
          .then((res) => cache.put(SDK, res))
          .catch(() => {});
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Keep the previous build's files as well (keys come oldest first): a
      // tab still running it may open a screen it has not loaded yet.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).slice(0, -1).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url === SDK) {
    // Without it a signed-in person can't open their fleet offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(SDK, copy)));
          }
          return res;
        })
        .catch(() => cached(SDK).then((hit) => hit || Response.error())),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  // The team worker source is deployed from here and must always be current.
  if (url.pathname.includes('/worker/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only the app page itself becomes the offline shell, never an
          // error page or another file opened in a tab.
          if (res.ok && /text\/html/i.test(res.headers.get('content-type') || '')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => cached('./index.html')),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    cached(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
