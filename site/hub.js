/* Pravahax Suite — hub shell. No build step, no dependencies. */
(() => {
  'use strict';

  /* ------------------------------------------------------------ helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? '⌘' : 'Ctrl';
  const today = () => new Date().toISOString().slice(0, 10);
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const mobile = () => matchMedia('(max-width: 760px)').matches;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const I = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/></svg>',
    reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v4"/><path d="M8.5 3h7l-1 6 3 3v2h-11v-2l3-3z"/></svg>',
    pinOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v4" fill="none"/><path d="M8.5 3h7l-1 6 3 3v2h-11v-2l3-3z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 7.5 7.5 0 1 0 20 14.5z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="13" height="13" rx="3"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.6 3.2 4.9 5.5 4.9 10.3A4.9 4.9 0 0 1 12 17.7a4.9 4.9 0 0 1-4.9-4.9c0-1.9.8-3.3 1.8-4.5.2 1.4.9 2.4 2 2.9-.4-3.4.6-6.3 1.1-8.7zM8 19h8a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2z" opacity=".95"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c.5 4.3 2.7 6.5 7 7-4.3.5-6.5 2.7-7 7-.5-4.3-2.7-6.5-7-7 4.3-.5 6.5-2.7 7-7z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.4"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5 13.5h6L10.5 21 19 10h-6z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5 12 15.5l5-5M5 20h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  };
  const setIcon = (el, svg) => { if (el) el.innerHTML = svg; };

  /* ------------------------------------------------------------- state */
  const KEY = 'everything:hub';
  const DEFAULT_PINS = ['documents', 'spreadsheet', 'presentation', 'notes', 'tasks', 'calendar', 'photo-studio', 'chess'];
  const state = (() => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
    return Object.assign({ theme: 'system', accent: 'terracotta', wall: 'dawn', pins: null, recents: [], days: {}, opens: {}, titles: {}, toured: false, firstSeen: Date.now() }, s);
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  if (!Array.isArray(state.pins)) { state.pins = DEFAULT_PINS.slice(); save(); }

  let APPS = [], CATS = [], byId = new Map();
  const built = new Map(); // id -> 'built' | 'missing' | 'unknown'

  /* ------------------------------------------------------------- theme */
  const root = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const dark = state.theme === 'dark' || (state.theme === 'system' && mq.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.accent = state.accent;
    root.dataset.wall = state.wall;
    setIcon($('#themeBtn'), dark ? I.sun : I.moon);
    $$('#themeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.theme)));
    $$('#accents .sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.accent)));
    $$('#walls .wsw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.wall)));
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.head.appendChild(h('meta', { name: 'theme-color' }));
    meta.content = dark ? '#161412' : '#f4efe7';
  }
  mq.addEventListener?.('change', applyTheme);

  /* -------------------------------------------------------------- icons */
  function appIcon(app, cls = 'ic') {
    if (!app) return h('span', { class: cls + ' mono' }, '?');
    const img = h('img', { class: cls, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false', src: `apps/${app.id}/icon-128.png` });
    img.addEventListener('error', function onErr() {
      if (img.dataset.fb) { img.replaceWith(h('span', { class: cls + ' mono', 'aria-hidden': 'true' }, app.name[0])); return; }
      img.dataset.fb = '1'; img.src = `icons/${app.id}.png`;
    });
    return img;
  }
  const altLine = (app) => (app.alternativeTo ? `Instead of ${app.alternativeTo}` : app.description || '');

  /* ------------------------------------------------------------ usage */
  // Ask once for persistent storage so the browser doesn't evict app data under storage pressure.
  let persistAsked = false, persistState = null; // null unknown, true kept, false best effort
  function askPersist() {
    if (persistAsked || !navigator.storage?.persist) return Promise.resolve(persistState); persistAsked = true;
    return (navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false))
      .then((p) => p || navigator.storage.persist())
      .then((ok) => { persistState = !!ok; return persistState; })
      .catch(() => { persistState = false; return false; });
  }
  function recordOpen(id) {
    askPersist();
    const d = today();
    state.days[d] = Array.from(new Set([...(state.days[d] || []), id]));
    const keys = Object.keys(state.days).sort();
    while (keys.length > 70) delete state.days[keys.shift()];
    state.recents = [{ id, at: Date.now() }, ...state.recents.filter((r) => r.id !== id)].slice(0, 16);
    state.opens[id] = (state.opens[id] || 0) + 1;
    save();
  }
  function weekApps() {
    const set = new Set();
    for (let i = 0; i < 7; i++) { const d = new Date(Date.now() - i * 864e5); (state.days[dayKey(d)] || []).forEach((x) => set.add(x)); }
    return set.size;
  }
  function streak() {
    let n = 0, i = state.days[today()] ? 0 : 1;
    for (; ; i++) { const d = dayKey(new Date(Date.now() - i * 864e5)); if (state.days[d]?.length) n++; else break; }
    return n;
  }
  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ------------------------------------------------------------- home */
  function renderHero() {
    const hr = new Date().getHours();
    const [w, line] = hr < 5 ? ['night', 'Still up? Everything is here when you need it.'] : hr < 12 ? ['morning', 'A fresh page. What are we making today?'] : hr < 17 ? ['afternoon', 'Pick up where you left off, or start something new.'] : hr < 22 ? ['evening', 'Wind down, tidy up, or play a quiet game.'] : ['night', 'Late hours, calm tools.'];
    $('#greet').innerHTML = `Good <em>${w}</em>`;
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#sub').textContent = `${date}. ${line}`;
    const stats = $('#stats'); stats.replaceChildren();
    const wk = weekApps(), st = streak(), open = tabs.length;
    if (wk) stats.append(h('span', { class: 'stat', html: `${I.spark}<span>You've used <b>${wk}</b> app${wk === 1 ? '' : 's'} this week</span>` }));
    else stats.append(h('span', { class: 'stat', html: `${I.spark}<span><b>${APPS.length || 51}</b> apps ready — no account needed</span>` }));
    if (st > 1) stats.append(h('span', { class: 'stat', html: `${I.flame}<span><b>${st}</b>-day streak</span>` }));
    if (open) stats.append(h('span', { class: 'stat', html: `${I.layers}<span><b>${open}</b> open</span>` }));
  }

  function renderRecents() {
    const box = $('#recents'); box.replaceChildren();
    const list = state.recents.filter((r) => byId.has(r.id)).slice(0, 12);
    $('#clearRecents').hidden = !list.length;
    if (!list.length) {
      box.append(h('div', { class: 'empty' }, h('span', { class: 'em-ic', html: I.clock }), h('div', {}, h('b', {}, 'Nothing here yet'), 'Open anything below and it will wait for you here, right where you left it.')));
      return;
    }
    const row = h('div', { class: 'recents' });
    list.forEach((r) => {
      const app = byId.get(r.id);
      const isOpen = tabs.some((t) => t.id === r.id);
      const title = state.titles[r.id] && state.titles[r.id] !== app.name ? state.titles[r.id] : null;
      const el = h('button', { class: 'recent', 'aria-label': `Open ${app.name}`, onclick: () => navigate(app.id, el) },
        appIcon(app), h('div', { style: 'min-width:0' }, h('b', {}, app.name), h('small', {}, title ? truncate(title, 22) : ago(r.at))), isOpen ? h('span', { class: 'live', title: 'Open now' }) : null);
      row.append(el);
    });
    box.append(row);
  }
  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function renderPins() {
    const box = $('#pins'); box.replaceChildren();
    state.pins = state.pins.filter((id) => byId.has(id));
    if (!state.pins.length) {
      box.append(h('div', { class: 'empty' }, h('span', { class: 'em-ic', html: I.pin }), h('div', {}, h('b', {}, 'Pin the apps you love'), 'Hover any app and tap the pin. They’ll gather here, in whatever order you like.')));
      return;
    }
    const grid = h('div', { class: 'pins', id: 'pinGrid' });
    state.pins.forEach((id) => {
      const app = byId.get(id);
      const el = h('div', { class: 'pinned', role: 'button', tabindex: '0', 'aria-label': `Open ${app.name}`, dataset: { id } }, appIcon(app), h('b', {}, app.name));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(id, el); } });
      grid.append(el);
    });
    box.append(grid);
    enablePinDrag(grid);
  }

  // Pointer-driven reordering that works with mouse, pen and touch (long-press).
  function enablePinDrag(grid) {
    let drag = null;
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.pinned'); if (!el || e.button > 0) return;
      drag = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, active: false, pointer: e.pointerId, touch: e.pointerType === 'touch', timer: null, target: null, after: false };
      if (drag.touch) drag.timer = setTimeout(() => { if (drag) start(); }, 320);
    });
    const start = () => {
      drag.active = true; drag.el.classList.add('dragging');
      try { drag.el.setPointerCapture(drag.pointer); } catch {}
      navigator.vibrate?.(8);
    };
    grid.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.hypot(dx, dy) > 6) { if (drag.touch) { clearTimeout(drag.timer); drag = null; return; } start(); } else return;
      }
      e.preventDefault();
      $$('.pinned', grid).forEach((p) => p.classList.remove('drop-before', 'drop-after'));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pinned');
      if (over && over !== drag.el) {
        const r = over.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2;
        over.classList.add(after ? 'drop-after' : 'drop-before'); drag.target = over.dataset.id; drag.after = after;
      } else drag.target = null;
    });
    const end = (e) => {
      if (!drag) return;
      clearTimeout(drag.timer);
      const d = drag; drag = null;
      $$('.pinned', grid).forEach((p) => p.classList.remove('drop-before', 'drop-after', 'dragging'));
      if (!d.active) { if (e.type === 'pointerup') navigate(d.id, d.el); return; }
      if (d.target) {
        const arr = state.pins.filter((x) => x !== d.id);
        let i = arr.indexOf(d.target) + (d.after ? 1 : 0);
        arr.splice(i, 0, d.id); state.pins = arr; save();
        flip(grid, () => renderPins());
      }
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
    grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.pinned')) e.preventDefault(); });
  }
  // FLIP animate pin positions across a re-render.
  function flip(grid, mutate) {
    const before = new Map($$('.pinned', grid).map((el) => [el.dataset.id, el.getBoundingClientRect()]));
    mutate();
    if (reduceMotion()) return;
    $$('#pinGrid .pinned').forEach((el) => {
      const a = before.get(el.dataset.id); if (!a) return;
      const b = el.getBoundingClientRect();
      el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,1.2,.35,1)' });
    });
  }

  function togglePin(id, btn) {
    const on = state.pins.includes(id);
    state.pins = on ? state.pins.filter((x) => x !== id) : [...state.pins, id];
    save();
    $$(`.tile[data-id="${id}"] .pin`).forEach((b) => { b.setAttribute('aria-pressed', String(!on)); b.innerHTML = !on ? I.pinOn : I.pin; b.title = !on ? 'Unpin' : 'Pin'; });
    if (btn && !reduceMotion()) btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,1.4,.35,1)' });
    renderPins();
    toast(on ? `Unpinned ${byId.get(id).name}` : `Pinned ${byId.get(id).name}`, { action: { label: 'Undo', run: () => togglePin(id) } });
  }

  let activeCat = 'All';
  function renderChips() {
    const box = $('#chips'); box.replaceChildren();
    const mk = (id, label, n) => h('button', { class: 'chip', 'aria-pressed': String(activeCat === id), onclick: () => { activeCat = id; renderChips(); filterCats(true); } }, label, n != null ? h('span', { class: 'n' }, n) : null);
    box.append(mk('All', 'All apps', APPS.length));
    CATS.forEach((c) => box.append(mk(c.id, c.name, APPS.filter((a) => a.category === c.id).length)));
  }
  function filterCats(scroll) {
    $$('.cat-section').forEach((s) => { s.hidden = activeCat !== 'All' && s.dataset.cat !== activeCat; });
    if (scroll) {
      const bar = $('#chipsBar'); const home = $('#home');
      const top = bar.offsetTop - 4;
      if (home.scrollTop > top || activeCat !== 'All') home.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }
  function renderCats() {
    const box = $('#cats'); box.replaceChildren();
    let delay = 0;
    CATS.forEach((c) => {
      const apps = APPS.filter((a) => a.category === c.id);
      const grid = h('div', { class: 'grid' });
      apps.forEach((app) => {
        const pinned = state.pins.includes(app.id);
        const tile = h('div', { class: 'tile', role: 'button', tabindex: '0', 'aria-label': `Open ${app.name}`, dataset: { id: app.id }, style: `animation-delay:${Math.min(delay++ * 18, 600)}ms` },
          appIcon(app),
          h('div', { class: 'meta' }, h('b', {}, app.name), h('small', {}, altLine(app))),
          h('button', { class: 'pin', 'aria-pressed': String(pinned), 'aria-label': `${pinned ? 'Unpin' : 'Pin'} ${app.name}`, title: pinned ? 'Unpin' : 'Pin', html: pinned ? I.pinOn : I.pin, onclick: (e) => { e.stopPropagation(); togglePin(app.id, e.currentTarget); } }),
          built.get(app.id) === 'missing' ? h('span', { class: 'badge' }, 'Not built') : null);
        tile.addEventListener('click', () => navigate(app.id, tile));
        tile.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tile) { e.preventDefault(); navigate(app.id, tile); } });
        grid.append(tile);
      });
      box.append(h('section', { class: 'cat-section', dataset: { cat: c.id }, id: `cat-${c.id.replace(/\s+/g, '-').toLowerCase()}` },
        h('div', { class: 'block-head' }, h('div', {}, h('h2', {}, c.name), h('p', {}, c.blurb))), grid));
    });
    filterCats(false);
  }
  function renderHome() { renderHero(); renderRecents(); renderPins(); renderChips(); renderCats(); }

  /* ---------------------------------------------------------- tabs/apps */
  const tabs = []; // { id, iframe|pane, title, loading, closeHandler }
  let activeId = null;
  let pendingFrom = null, pendingItems = null, pendingArgs = null;

  function appURL(id, items, args) {
    // The server answers apps/<id>/index.html with a redirect to apps/<id>/; ask for the folder directly (one round trip less on mobile).
    let u = `apps/${encodeURIComponent(id)}/${location.protocol === 'file:' ? 'index.html' : ''}`;
    const q = [];
    if (items && items.length) q.push(`everything-items=${encodeURIComponent(JSON.stringify(items))}`);
    if (args && Object.keys(args).length) q.push(`everything-args=${encodeURIComponent(JSON.stringify(args))}`);
    return q.length ? `${u}?${q.join('&')}` : u;
  }
  async function checkBuilt(id) {
    if (built.has(id) && built.get(id) !== 'unknown') return built.get(id);
    try {
      const r = await fetch(`apps/${encodeURIComponent(id)}/${location.protocol === 'file:' ? 'index.html' : ''}`, { method: 'HEAD', cache: 'no-store' });
      built.set(id, r.ok ? 'built' : r.status === 404 ? 'missing' : 'unknown');
    } catch { built.set(id, 'unknown'); }
    return built.get(id);
  }

  function makeTab(id, items, args) {
    const app = byId.get(id);
    const tab = { id, title: app.name, loading: true, closeHandler: false, el: null };
    const frames = $('#frames');
    if (built.get(id) === 'missing') {
      tab.loading = false;
      tab.el = h('div', { class: 'notbuilt' }, h('div', {}, appIcon(app), h('h3', {}, `${app.name} isn’t built yet`),
        h('p', { html: `This hub looks for <code>apps/${esc(id)}/index.html</code>. Build ${esc(app.name)} into that folder and it will open right here — no reload of the hub needed.` }),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn primary', onclick: () => go('#/') }, 'Back home'), h('button', { class: 'btn', onclick: async () => { built.delete(id); if ((await checkBuilt(id)) !== 'missing') { closeTab(id, true); navigate(id); } else toast('Still not there. Build it, then try again.'); } }, 'Check again'))));
    } else {
      const f = h('iframe', { class: 'frame', title: app.name, src: appURL(id, items, args), allow: 'clipboard-read; clipboard-write; fullscreen; camera; microphone; display-capture; autoplay; web-share; geolocation; midi', allowfullscreen: true });
      f.addEventListener('load', () => { tab.loading = false; renderTabs(); tab.onload?.(); warm(id); });
      tab.el = f;
    }
    frames.append(tab.el);
    tabs.push(tab);
    return tab;
  }

  // Ask the hub's service worker to keep this app's entry page for offline use.
  function warm(id) { if (navigator.serviceWorker?.controller) [appURL(id), `apps/${id}/icon-128.png`].forEach((u) => fetch(u).catch(() => {})); }

  function renderTabs() {
    const box = $('#tabs'); box.replaceChildren();
    tabs.forEach((t, i) => {
      const app = byId.get(t.id);
      const el = h('div', { class: `tab${t.loading ? ' loading' : ''}`, role: 'tab', tabindex: '0', 'aria-selected': String(t.id === activeId), title: t.title !== app.name ? `${t.title} — ${app.name}` : app.name },
        appIcon(app), h('span', { class: 't' }, t.title || app.name), i < 9 ? h('span', { class: 'k' }, `${isMac ? '⌘' : '^'}${i + 1}`) : null,
        h('button', { class: 'x', 'aria-label': `Close ${app.name}`, html: I.x, onclick: (e) => { e.stopPropagation(); closeTab(t.id); } }));
      el.addEventListener('click', () => go(`#/app/${t.id}`));
      el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t.id); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(`#/app/${t.id}`); });
      box.append(el);
    });
    const cnt = $('#dockOpen .count'); if (cnt) cnt.remove();
    if (tabs.length) $('#dockOpen').append(h('span', { class: 'count' }, tabs.length));
    box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function activate(id) {
    activeId = id;
    tabs.forEach((t) => t.el.classList.toggle('on', t.id === id));
    renderTabs();
    const t = tabs.find((x) => x.id === id);
    document.title = `${t?.title || byId.get(id)?.name} · Pravahax Suite`;
    if (t && t.el.tagName === 'IFRAME') setTimeout(() => { try { t.el.contentWindow?.focus(); } catch {} }, 60);
  }

  async function showApp(id) {
    const app = byId.get(id);
    if (!app) { toast('That app isn’t in this hub.'); go('#/', true); return; }
    const from = pendingFrom; pendingFrom = null;
    const items = pendingItems; pendingItems = null;
    const args = pendingArgs; pendingArgs = null;
    let tab = tabs.find((t) => t.id === id);
    const wasHome = !document.body.classList.contains('in-app');
    if (!tab) {
      await checkBuilt(id);
      tab = makeTab(id, items, args);
      recordOpen(id);
    } else {
      if (items) postTo(tab, { type: 'items', items });
      recordOpen(id);
    }
    const fromEl = from && from.isConnected ? from : null;
    if (wasHome && fromEl && !reduceMotion()) zoomFrom(fromEl, app, tab);
    else if (wasHome && !reduceMotion()) tab.el.animate([{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
    document.body.classList.add('in-app');
    activate(id);
    $('#dockHome').classList.remove('on');
  }

  function zoomFrom(el, app, tab) {
    const r = el.getBoundingClientRect();
    const g = h('div', { class: 'ghost' }, appIcon(app));
    const radius = getComputedStyle(el).borderRadius || '22px';
    Object.assign(g.style, { left: '0px', top: '0px', width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius });
    document.body.append(g);
    const top = mobile() ? 50 : 50;
    const W = innerWidth, H = innerHeight - top;
    const anim = g.animate([
      { transform: `translate(${r.left}px, ${r.top}px)`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius, opacity: 1 },
      { transform: `translate(0px, ${top}px)`, width: `${W}px`, height: `${H}px`, borderRadius: '0px', opacity: 1 },
    ], { duration: 560, easing: 'cubic-bezier(.2,.95,.25,1)', fill: 'forwards' });
    const icon = g.firstChild;
    icon.animate([{ transform: 'scale(.7)' }, { transform: 'scale(1.15)' }], { duration: 560, easing: 'cubic-bezier(.2,1.3,.35,1)', fill: 'forwards' });
    let done = false;
    const fade = () => { if (done) return; done = true; g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-out', fill: 'forwards' }).onfinish = () => g.remove(); };
    anim.onfinish = () => { if (!tab.loading) fade(); else { tab.onload = () => setTimeout(fade, 120); setTimeout(fade, 2600); } };
  }

  function go(hash, replace) {
    if (location.hash === hash) { route(); return; }
    if (replace) history.replaceState(null, '', hash); else location.hash = hash;
    if (replace) route();
  }
  function navigate(id, fromEl, items, args) {
    pendingFrom = fromEl || null;
    pendingItems = items || null;
    pendingArgs = args || null;
    closeOverlays();
    go(`#/app/${id}`);
  }
  function goHome() {
    document.body.classList.remove('in-app');
    document.title = 'Pravahax Suite';
    $('#dockHome').classList.add('on');
    renderHero(); renderRecents(); renderHomeFiles();
  }
  // Deep links: #/app/<id>, optionally ?open=<drive path> (repeatable) to open files in it.
  function route() {
    if (location.hash === '#/files') { goHome(); showFiles(); return; }
    hideFiles();
    const m = /^#\/app\/([^/?#]+)(?:\?(.*))?/.exec(location.hash);
    if (m) {
      if (m[2] && !pendingItems) {
        const open = new URLSearchParams(m[2]).getAll('open').filter(Boolean);
        if (open.length) pendingItems = open;
        history.replaceState(null, '', `#/app/${m[1]}`);
      }
      showApp(decodeURIComponent(m[1]));
    } else goHome();
  }

  function closeTab(id, force) {
    const i = tabs.findIndex((t) => t.id === id); if (i < 0) return;
    const t = tabs[i];
    if (t.closeHandler && !force) {
      if (activeId !== id) go(`#/app/${id}`);
      postTo(t, { type: 'requestClose' });
      t.closeRequested = Date.now();
      return;
    }
    const remove = () => { t.el.remove(); };
    if (!reduceMotion() && t.id === activeId) t.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = remove; else remove();
    tabs.splice(i, 1);
    if (activeId === id) {
      const next = tabs[i] || tabs[i - 1];
      activeId = null;
      if (next && document.body.classList.contains('in-app')) go(`#/app/${next.id}`, true);
      else go('#/', true);
    }
    renderTabs(); renderRecents(); renderHero();
  }
  function closeAll() { [...tabs].forEach((t) => closeTab(t.id, true)); go('#/', true); }
  function postTo(tab, msg) { try { tab.el.contentWindow?.postMessage({ everything: 1, ...msg }, location.origin); } catch {} }
  const activeTab = () => tabs.find((t) => t.id === activeId);

  function resolveApp(name) {
    if (!name) return null;
    const n = String(name).toLowerCase().replace(/^ehub[-_]/, '').replace(/\s+/g, '-');
    if (byId.has(n)) return byId.get(n);
    return APPS.find((a) => a.aliases.includes(n) || a.name.toLowerCase() === n.replace(/-/g, ' ')) || APPS.find((a) => a.id.startsWith(n) || n.startsWith(a.id));
  }

  /* --------------------------------------------- messages from the apps */
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.everything !== 1) return;
    const tab = tabs.find((t) => t.el.tagName === 'IFRAME' && t.el.contentWindow === e.source);
    const d = e.data;
    switch (d.type) {
      case 'launchApp': {
        const app = resolveApp(d.target);
        if (app) {
          const a = d.args && typeof d.args === 'object' ? { ...d.args } : {};
          const items = Array.isArray(a.items) ? a.items.map((x) => x.path || x) : null;
          delete a.items;
          navigate(app.id, null, items, Object.keys(a).length ? a : null);
        }
        else toast(`Couldn’t find an app called “${d.target}”.`);
        break;
      }
      case 'setWindowTitle':
        if (tab) {
          tab.title = String(d.title || '').trim() || byId.get(tab.id).name;
          state.titles[tab.id] = tab.title; save();
          renderTabs();
          if (tab.id === activeId) document.title = `${tab.title} · Pravahax Suite`;
        }
        break;
      case 'exit': if (tab) closeTab(tab.id, true); break;
      case 'closeHandler': if (tab) tab.closeHandler = !!d.on; break;
      case 'hideWindow': if (tab && tab.id === activeId) go('#/'); break;
      case 'showWindow': if (tab) go(`#/app/${tab.id}`); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'toast': toast(d.message || '', d.action === 'settings' ? { action: { label: 'Settings', run: () => openSheet('ai') } } : d.action === 'files' ? { action: { label: 'Show in Files', run: () => openFiles(d.path) }, timeout: 6500 } : {}); break;
      case 'key':
        if (d.combo === 'mod+k') togglePalette();
        else if (/^mod\+[1-9]$/.test(d.combo)) switchTo(Number(d.combo.slice(-1)) - 1);
        break;
      default: break;
    }
  });

  /* -------------------------------------------------------------- toast */
  function toast(msg, opts = {}) {
    if (!msg) return;
    const box = $('#toasts');
    const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'tx' }, msg));
    if (opts.action) el.append(h('button', { onclick: () => { opts.action.run(); dismiss(); } }, opts.action.label));
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    let timer = setTimeout(dismiss, opts.timeout || (opts.action ? 5200 : 3200));
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1600); });
    function dismiss() { el.classList.add('out'); setTimeout(() => el.remove(), 300); }
  }

  /* -------------------------------------------------------------- menus */
  function popMenu(anchor, items) {
    closeMenus();
    const m = h('div', { class: 'menu-pop', role: 'menu' });
    items.filter(Boolean).forEach((it) => m.append(h('button', { role: 'menuitem', onclick: () => { closeMenus(); it.run(); } }, it.icon ? h('span', { html: it.icon, style: 'display:grid' }) : null, it.label)));
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
    let top = r.bottom + 6; if (top + mr.height > innerHeight - 8) top = r.top - mr.height - 6;
    m.style.top = `${Math.max(8, top)}px`;
    m.style.left = `${Math.max(8, Math.min(r.right - mr.width, innerWidth - mr.width - 8))}px`;
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    function outside(e) { if (!m.contains(e.target)) { closeMenus(); document.removeEventListener('pointerdown', outside, true); } }
  }
  const closeMenus = () => $$('.menu-pop').forEach((m) => m.remove());

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else ($('#frames').requestFullscreen || $('#frames').webkitRequestFullscreen)?.call($('#frames'));
  }
  function switchTo(i) { const t = tabs[i]; if (t) go(`#/app/${t.id}`); }

  /* ------------------------------------------------------------ palette */
  let palItems = [], palSel = 0, files = [];
  const palette = $('#palette'), palInput = $('#palInput'), palList = $('#palList');
  const isPalOpen = () => palette.classList.contains('on');
  function openPalette(q = '') {
    closeMenus(); closeSheet();
    palette.classList.add('on'); $('#scrim').classList.add('on');
    palInput.value = q; palSel = 0; renderPalette();
    setTimeout(() => palInput.focus(), 30);
    loadFiles().then(() => { if (isPalOpen()) renderPalette(); });
  }
  function closePalette() { palette.classList.remove('on'); if (!$('#sheet').classList.contains('on')) $('#scrim').classList.remove('on'); }
  function togglePalette() { isPalOpen() ? closePalette() : openPalette(); }

  // Subsequence fuzzy match with bonuses for word starts and contiguity.
  function fuzzy(q, text) {
    if (!q) return { score: 1, idx: [] };
    const t = text.toLowerCase(); q = q.toLowerCase();
    const direct = t.indexOf(q);
    if (direct >= 0) return { score: 100 - direct + (direct === 0 || /\W/.test(t[direct - 1]) ? 40 : 0) + q.length * 2, idx: Array.from({ length: q.length }, (_, i) => direct + i) };
    let ti = 0, score = 0, prev = -2; const idx = [];
    for (const c of q) {
      const f = t.indexOf(c, ti); if (f < 0) return null;
      score += f === prev + 1 ? 6 : 1; if (f === 0 || /[\s\-_.]/.test(t[f - 1])) score += 5;
      idx.push(f); prev = f; ti = f + 1;
    }
    return { score: score - (t.length - q.length) * 0.05, idx };
  }
  const mark = (text, idx) => { if (!idx || !idx.length) return esc(text); const s = new Set(idx); return [...text].map((c, i) => (s.has(i) ? `<mark>${esc(c)}</mark>` : esc(c))).join(''); };

  const EXT_APP = { docx: 'documents', doc: 'documents', odt: 'documents', rtf: 'documents', xlsx: 'spreadsheet', xls: 'spreadsheet', csv: 'spreadsheet', ods: 'spreadsheet', pptx: 'presentation', ppt: 'presentation', odp: 'presentation', pdf: 'pdf', md: 'notes', txt: 'notes', png: 'photo-studio', jpg: 'photo-studio', jpeg: 'photo-studio', webp: 'photo-studio', psd: 'photo-studio', svg: 'vector-studio', ai: 'vector-studio', mp3: 'audio-studio', wav: 'audio-studio', ogg: 'audio-studio', flac: 'audio-studio', mid: 'music-studio', midi: 'music-studio', mp4: 'video-studio', webm: 'video-studio', mov: 'video-studio', stl: '3d', glb: '3d', gltf: '3d', obj: '3d', dxf: 'cad', dwg: 'cad', ics: 'calendar', vcf: 'contacts' };
  function appForFile(path) {
    const m = /^\/[^/]+\/AppData\/([^/]+)\//.exec(path);
    if (m && byId.has(m[1])) return byId.get(m[1]);
    const ext = (/\.([a-z0-9]+)$/i.exec(path) || [])[1];
    return ext && byId.get(EXT_APP[ext.toLowerCase()]);
  }
  function loadFiles() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('everything-drive'); } catch { return resolve(); }
      req.onupgradeneeded = () => { req.transaction.abort(); };
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result; const out = [];
        if (!db.objectStoreNames.contains('nodes')) { db.close(); return resolve(); }
        const cur = db.transaction('nodes').objectStore('nodes').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { const n = c.value; if (!n.is_dir && !/\/\.|\/(node_modules|cache|\.cache)\//.test(n.path)) out.push({ path: n.path, name: n.name, modified: n.modified, size: n.size }); c.continue(); }
          else { out.sort((a, b) => b.modified - a.modified); files = out.slice(0, 300); db.close(); resolve(); }
        };
        cur.onerror = () => { db.close(); resolve(); };
      };
    });
  }


  /* ------------------------------------------- Files: what is saved in Pravahax Suite (this browser) */
  // Every app saves into one drive in this browser: IndexedDB "everything-drive", rooted at /me. This screen lists the
  // user's own files there (documents, spreadsheets, decks, PDFs, pictures…), not apps' internal data.
  const DOC_EXT = new Set(['docx', 'doc', 'odt', 'rtf', 'xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods', 'pptx', 'ppt', 'odp', 'pdf', 'md', 'txt', 'html', 'htm', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'psd', 'mp3', 'wav', 'ogg', 'flac', 'mid', 'midi', 'mp4', 'webm', 'mov', 'stl', 'glb', 'gltf', 'obj', 'dxf', 'dwg', 'ics', 'vcf', 'zip']);
  const extOf = (n) => ((/\.([a-z0-9]+)$/i.exec(n) || [])[1] || '').toLowerCase();
  const fsBus = (() => { try { return new BroadcastChannel('everything:fs'); } catch { return null; } })();
  function driveDB() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('everything-drive'); } catch { return resolve(null); }
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch {} }; // no drive yet: leave creating it to the apps
      req.onerror = () => resolve(null);
      req.onsuccess = () => { const db = req.result; if (!db.objectStoreNames.contains('nodes')) { db.close(); resolve(null); } else resolve(db); };
    });
  }
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function driveTx(mode, fn) {
    const db = await driveDB(); if (!db) throw new Error('Nothing has been saved in this browser yet.');
    try {
      return await new Promise((resolve, reject) => {
        const t = db.transaction('nodes', mode), st = t.objectStore('nodes'); let out;
        t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('Cancelled'));
        Promise.resolve(fn(st, (v) => { out = v; })).catch((e) => { try { t.abort(); } catch {} reject(e); });
      });
    } finally { db.close(); }
  }
  async function driveAll() { try { return (await driveTx('readonly', async (st, done) => done(await reqP(st.getAll())))) || []; } catch { return []; } }
  const parentOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
  function hubLoc(path) {
    let segs = String(path).split('/').filter(Boolean);
    if (segs[0] === 'me') segs.shift();
    if (segs[0] === 'AppData' && segs.length > 2) segs = segs.slice(2);
    return ['Pravahax Suite', ...segs].join(' › ');
  }
  const folderOf = (path) => hubLoc(parentOf(path)).replace(/^Pravahax Suite( › )?/, '') || 'Pravahax Suite';
  const hiddenPath = (p) => /\/\.[^/]*/.test(p) || /\/(Trash|node_modules|cache)(\/|$)/i.test(p);
  function isUserFile(n, all) {
    if (!n || n.is_dir || !String(n.path).startsWith('/me/') || hiddenPath(n.path)) return false;
    if (all) return true;
    return !n.path.startsWith('/me/AppData/') || DOC_EXT.has(extOf(n.name));
  }
  async function listUserFiles(all) { return (await driveAll()).filter((n) => isUserFile(n, all)).sort((a, b) => (b.modified || 0) - (a.modified || 0)); }
  function fsNotify(kind, path, extra) { try { fsBus?.postMessage({ kind, type: kind, path, app: 'hub', at: Date.now(), ...(extra || {}) }); } catch {} }
  async function readDriveFile(path) {
    const n = await driveTx('readonly', async (st, done) => done(await reqP(st.get(path))));
    if (!n || n.is_dir) throw new Error('That file is no longer there.');
    return n.blob instanceof Blob ? n.blob : new Blob([n.blob || ''], { type: n.type || '' });
  }
  async function renameDriveFile(path, newName) {
    const target = `${parentOf(path)}/${newName}`;
    if (target === path) return path;
    await driveTx('readwrite', async (st, done) => {
      const n = await reqP(st.get(path)); if (!n) throw new Error('That file is no longer there.');
      if (await reqP(st.get(target))) throw new Error(`A file named “${newName}” is already in ${folderOf(path)}.`);
      st.put({ ...n, path: target, name: newName, parent: parentOf(target), modified: Math.floor(Date.now() / 1000) });
      st.delete(path); done(target);
    });
    fsNotify('rename', target, { from: path });
    return target;
  }
  async function deleteDriveFile(path) {
    await driveTx('readwrite', async (st) => { st.delete(path); });
    fsNotify('delete', path);
  }
  function saveBlobToDevice(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name || 'file' });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function modal({ title, text, value, ext, confirm = 'OK', danger = false, validate }) {
    return new Promise((resolve) => {
      const box = $('#hubModal'); box.replaceChildren(); box.hidden = false;
      const input = value != null ? h('input', { type: 'text', value, 'aria-label': 'Name', autocomplete: 'off', spellcheck: 'false' }) : null;
      const errEl = h('p', { class: 'err', role: 'alert' });
      const finish = (v) => { box.hidden = true; box.replaceChildren(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
      document.addEventListener('keydown', onKey, true);
      const form = h('form', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onsubmit: (e) => {
        e.preventDefault();
        if (!input) return finish(true);
        const v = input.value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
        const bad = validate ? validate(v) : (v ? null : 'Enter a name');
        if (bad) { errEl.textContent = bad; input.focus(); return; }
        finish(v);
      } },
        h('h3', {}, title), text ? h('p', {}, text) : null,
        input ? h('div', { class: 'nm' }, input, ext ? h('span', { class: 'ext' }, ext) : null) : null, input ? errEl : null,
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'Cancel'), h('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}` }, confirm)));
      box.append(form);
      box.onpointerdown = (e) => { if (e.target === box) finish(null); };
      setTimeout(() => { if (input) { input.focus(); input.select(); } else form.querySelector('[type=submit]').focus(); }, 30);
    });
  }
  const filesUI = { folder: 'all', q: '', all: false, highlight: null, list: [] };
  const isFilesOpen = () => !$('#filesView').hidden;
  function openFiles(highlight) { filesUI.highlight = highlight || null; closeOverlays(); go('#/files'); }
  function fileIcon(n) { const app = appForFile(n.path); return app ? appIcon(app) : h('span', { class: 'gl', html: I.file }); }
  function openDriveFile(n) {
    const app = appForFile(n.path);
    if (!app) { toast('No app here opens that kind of file yet. Use Download to keep a copy on your device.'); return; }
    navigate(app.id, null, [n.path]);
  }
  async function renameFlow(n) {
    const m = /^(.*?)(\.[a-z0-9]{1,8})?$/i.exec(n.name), stem = m[1], ext = m[2] || '';
    const v = await modal({ title: 'Rename', text: `In ${hubLoc(parentOf(n.path))}`, value: stem, ext, confirm: 'Rename' });
    if (v == null || v + ext === n.name) return;
    try { const p = await renameDriveFile(n.path, v + ext); filesUI.highlight = p; toast(`Renamed to “${v + ext}”.`); refreshFiles(); }
    catch (e) { toast(e.message || 'Couldn’t rename that file.'); }
  }
  async function downloadFlow(n) {
    try { saveBlobToDevice(await readDriveFile(n.path), n.name); toast(`Downloading “${n.name}” to this device.`); }
    catch (e) { toast(e.message || 'Couldn’t download that file.'); }
  }
  async function deleteFlow(n) {
    const ok = await modal({ title: `Delete “${n.name}”?`, text: 'It is removed from Pravahax Suite in this browser. This can’t be undone. Download it first if you want a copy on your device.', confirm: 'Delete', danger: true });
    if (!ok) return;
    try { await deleteDriveFile(n.path); toast(`Deleted “${n.name}”.`); refreshFiles(); }
    catch (e) { toast(e.message || 'Couldn’t delete that file.'); }
  }
  function fileRow(n) {
    const meta = `${folderOf(n.path)} · ${fmtBytes(n.size || 0)}${n.modified ? ` · ${ago(n.modified * 1000)}` : ''}`;
    return h('div', { class: `file-row${filesUI.highlight === n.path ? ' hl' : ''}`, role: 'listitem', dataset: { path: n.path } },
      fileIcon(n),
      h('button', { class: 'file-main', title: `Open ${n.name}`, onclick: () => openDriveFile(n) }, h('b', {}, n.name), h('small', {}, meta)),
      h('div', { class: 'file-acts' },
        h('button', { onclick: () => openDriveFile(n) }, 'Open'),
        h('button', { onclick: () => renameFlow(n) }, 'Rename'),
        h('button', { onclick: () => downloadFlow(n) }, 'Download'),
        h('button', { class: 'danger', onclick: () => deleteFlow(n) }, 'Delete')));
  }
  async function renderFilesView() {
    filesUI.list = await listUserFiles(filesUI.all);
    const folders = [...new Set(filesUI.list.map((n) => folderOf(n.path)))].sort((a, b) => a.localeCompare(b));
    if (filesUI.folder !== 'all' && !folders.includes(filesUI.folder)) filesUI.folder = 'all';
    const chips = $('#filesChips'); chips.replaceChildren();
    [['all', 'All files', filesUI.list.length], ...folders.map((f) => [f, f, filesUI.list.filter((n) => folderOf(n.path) === f).length])].forEach(([id, label, n]) =>
      chips.append(h('button', { class: 'chip', 'aria-pressed': String(filesUI.folder === id), onclick: () => { filesUI.folder = id; renderFilesView(); } }, label, h('span', { class: 'n' }, n))));
    const q = filesUI.q.toLowerCase();
    const shown = filesUI.list.filter((n) => (filesUI.folder === 'all' || folderOf(n.path) === filesUI.folder) && (!q || n.name.toLowerCase().includes(q) || folderOf(n.path).toLowerCase().includes(q)));
    const box = $('#filesList'); box.replaceChildren();
    if (!shown.length) {
      box.append(h('div', { class: 'files-empty' }, h('b', {}, filesUI.list.length ? 'Nothing matches' : 'No saved files yet'),
        filesUI.list.length ? 'Try another search or folder.' : 'When you press Save in Spreadsheet, Documents, Presentation, PDF Editor or another app, the file is kept here — in this browser on this device.'));
    } else shown.forEach((n) => box.append(fileRow(n)));
    if (filesUI.highlight) box.querySelector('.file-row.hl')?.scrollIntoView({ block: 'center' });
    storageLine();
  }
  async function storageLine() {
    const el = $('#filesStore'); if (!el) return;
    let usage = '';
    try { const est = await navigator.storage?.estimate?.(); if (est) usage = ` About ${fmtBytes(est.usage || 0)} used.`; } catch {}
    let p = persistState;
    try { if (p == null && navigator.storage?.persisted) p = await navigator.storage.persisted(); } catch {}
    el.replaceChildren(h('span', { html: p ? '<b>Kept safe:</b> this browser agreed not to clear Pravahax Suite’s storage on its own.' : '<b>Stored in this browser only.</b> Clearing site data (or the browser running very low on space) removes it, so download anything important.' }), usage);
  }
  let filesTimer = null;
  function refreshFiles() { clearTimeout(filesTimer); filesTimer = setTimeout(() => { if (isFilesOpen()) renderFilesView(); renderHomeFiles(); }, 120); }
  async function renderHomeFiles() {
    const block = $('#filesBlock'); if (!block) return;
    const list = (await listUserFiles(false)).slice(0, 6);
    block.hidden = !list.length;
    const box = $('#homeFiles'); box.replaceChildren();
    if (!list.length) return;
    const grid = h('div', { class: 'home-files' });
    list.forEach((n) => grid.append(h('button', { class: 'home-file', title: `${n.name} — ${hubLoc(n.path)}`, onclick: () => openDriveFile(n) }, fileIcon(n), h('div', {}, h('b', {}, n.name), h('small', {}, `${folderOf(n.path)}${n.modified ? ` · ${ago(n.modified * 1000)}` : ''}`)))));
    box.append(grid);
  }
  function showFiles() {
    $('#filesView').hidden = false; document.body.classList.add('in-files');
    $('#dockHome').classList.remove('on'); $('#dockFiles')?.classList.add('on');
    document.title = 'Files · Pravahax Suite';
    askPersist().then(storageLine);
    renderFilesView();
    setTimeout(() => { if (!mobile()) $('#filesQuery').focus({ preventScroll: true }); }, 60);
  }
  function hideFiles() { if (isFilesOpen()) { $('#filesView').hidden = true; document.body.classList.remove('in-files'); $('#dockFiles')?.classList.remove('on'); filesUI.highlight = null; } }
  if (fsBus) fsBus.addEventListener('message', refreshFiles);

  function actions() {
    const t = activeTab();
    return [
      { kind: 'action', label: 'Go home', sub: 'Back to all your apps', icon: I.home, run: () => go('#/'), keys: 'home back' },
      { kind: 'action', label: root.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', sub: 'Theme', icon: root.dataset.theme === 'dark' ? I.sun : I.moon, run: () => { state.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); }, keys: 'theme dark light mode night' },
      { kind: 'action', label: 'Your files', sub: 'Everything you saved, in this browser', icon: I.folder, run: () => openFiles(), keys: 'files documents saved storage drive browse where my files' },
      { kind: 'action', label: 'Open settings', sub: 'Theme, wallpaper, AI and your data', icon: I.gear, run: () => openSheet(), keys: 'preferences settings options' },
      { kind: 'action', label: 'AI settings', sub: aiOn() ? 'Using your own OpenAI-compatible key' : 'Built-in AI is on — optionally use your own key', icon: I.spark, run: () => openSheet('ai'), keys: 'ai key openai model assistant gpt' },
      { kind: 'action', label: 'Export all my data', sub: 'Download a backup of everything', icon: I.down, run: exportData, keys: 'backup export download save' },
      t ? { kind: 'action', label: `Reload ${byId.get(t.id).name}`, sub: 'Refresh the current app', icon: I.reload, run: reloadActive, keys: 'reload refresh' } : null,
      t ? { kind: 'action', label: `Close ${byId.get(t.id).name}`, sub: 'Close the current app', icon: I.close, run: () => closeTab(t.id), keys: 'close quit' } : null,
      tabs.length > 1 ? { kind: 'action', label: 'Close all apps', sub: `${tabs.length} open`, icon: I.close, run: closeAll, keys: 'close all quit' } : null,
      { kind: 'action', label: 'Replay the tour', sub: 'A 3-step introduction', icon: I.compass, run: () => { go('#/'); setTimeout(startTour, 350); }, keys: 'tour help intro onboarding' },
    ].filter(Boolean);
  }

  function renderPalette() {
    const q = palInput.value.trim();
    const groups = [];
    if (!q) {
      if (tabs.length) groups.push(['Open now', tabs.map((t) => ({ kind: 'app', app: byId.get(t.id), sub: t.title !== byId.get(t.id).name ? t.title : 'Switch to this app', hint: 'Switch' }))]);
      const rec = state.recents.filter((r) => byId.has(r.id) && !tabs.some((t) => t.id === r.id)).slice(0, 5);
      if (rec.length) groups.push(['Recent', rec.map((r) => ({ kind: 'app', app: byId.get(r.id), sub: `Opened ${ago(r.at)}` }))]);
      if (files.length) groups.push(['Recent files', files.slice(0, 4).map(fileItem)]);
      groups.push(['Commands', actions().slice(0, 4)]);
      if (!tabs.length && !rec.length) groups.push(['Try', ['spreadsheet', 'documents', 'whiteboard', 'chess'].filter((i) => byId.has(i)).map((id) => ({ kind: 'app', app: byId.get(id), sub: altLine(byId.get(id)) }))]);
    } else {
      const apps = [];
      APPS.forEach((app) => {
        const n = fuzzy(q, app.name), al = app.alternativeTo ? fuzzy(q, app.alternativeTo) : null, ds = fuzzy(q, app.description || ''), ids = app.aliases.map((a) => fuzzy(q, a)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
        const cat = fuzzy(q, app.category);
        // Weak scattered matches in long text are noise; only the name and ids may match loosely.
        const strong = (m, min) => (m && m.score >= min ? m.score : -1);
        const best = Math.max(n ? n.score + 30 : -1, strong(al, 40) * 0.9, ids ? ids.score : -1, strong(ds, 40) * 0.5, strong(cat, 40) * 0.3);
        if (best > 10) apps.push({ kind: 'app', app, score: best, idx: n ? n.idx : [], sub: altLine(app), subHtml: al && al.score >= 40 && (!n || al.score > n.score) ? `Instead of ${mark(app.alternativeTo, al.idx)}` : null });
      });
      apps.sort((a, b) => b.score - a.score);
      if (apps.length) groups.push(['Apps', apps.slice(0, 8)]);
      const cats = CATS.map((c) => ({ c, m: fuzzy(q, c.name) })).filter((x) => x.m && x.m.score > 3).map((x) => ({ kind: 'cat', cat: x.c, idx: x.m.idx, score: x.m.score + 10 }));
      if (cats.length) groups.push(['Categories', cats.slice(0, 3)]);
      const fl = files.map((f) => ({ f, m: fuzzy(q, f.name) })).filter((x) => x.m && x.m.score > 2).sort((a, b) => b.m.score - a.m.score).slice(0, 5).map((x) => Object.assign(fileItem(x.f, x.m.idx), { score: x.m.score + 25 }));
      if (fl.length) groups.push(['Files', fl]);
      const acts = actions().map((a) => ({ a, m: fuzzy(q, a.label) || fuzzy(q, a.keys) })).filter((x) => x.m && x.m.score > 3).sort((a, b) => b.m.score - a.m.score).map((x) => Object.assign({}, x.a, { idx: fuzzy(q, x.a.label)?.idx, score: x.m.score }));
      if (acts.length) groups.push(['Commands', acts.slice(0, 4)]);
    }
    if (q) {
      const top = (items) => Math.max(...items.map((it) => it.score != null ? it.score : it.idx ? 20 : 0));
      groups.sort((a, b) => top(b[1]) - top(a[1]));
    }
    palItems = [];
    palList.replaceChildren();
    if (!groups.length) {
      palList.append(h('div', { class: 'pal-empty', html: `Nothing matches “${esc(q)}”.<br><small>Try what you’d use elsewhere — “excel”, “slack”, “photoshop”.</small>` }));
      return;
    }
    groups.forEach(([label, items]) => {
      palList.append(h('div', { class: 'pal-group' }, label));
      items.forEach((it) => {
        const i = palItems.length; palItems.push(it);
        let lead, title, sub, hint = it.hint || 'Open';
        const subHtml = it.subHtml || null;
        if (it.kind === 'app') { lead = appIcon(it.app); title = mark(it.app.name, it.idx); sub = it.sub; }
        else if (it.kind === 'cat') { lead = h('span', { class: 'gl', html: I.tag }); title = mark(it.cat.name, it.idx); sub = `${APPS.filter((a) => a.category === it.cat.id).length} apps · ${it.cat.blurb}`; hint = 'Browse'; }
        else if (it.kind === 'file') { lead = it.app ? appIcon(it.app) : h('span', { class: 'gl', html: I.file }); title = mark(it.file.name, it.idx); sub = `${it.file.path.replace(/^\/me/, '~')} · ${ago(it.file.modified * 1000)}`; }
        else { lead = h('span', { class: 'gl', html: it.icon }); title = mark(it.label, it.idx); sub = it.sub; hint = 'Run'; }
        const el = h('button', { class: 'pal-item', role: 'option', 'aria-selected': String(i === palSel), dataset: { i }, onclick: () => runItem(it), onmousemove: () => { if (palSel !== i) { palSel = i; markSel(); } } },
          lead, h('span', { class: 'tx' }, h('b', { html: title }), subHtml ? h('small', { html: subHtml }) : sub ? h('small', {}, sub) : null), h('span', { class: 'hint' }, `${hint} ↵`));
        palList.append(el);
      });
    });
    palSel = Math.min(palSel, palItems.length - 1);
    markSel();
  }
  function fileItem(f, idx) { return { kind: 'file', file: f, app: appForFile(f.path), idx }; }
  function markSel() { $$('.pal-item', palList).forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.i) === palSel))); $(`.pal-item[data-i="${palSel}"]`, palList)?.scrollIntoView({ block: 'nearest' }); }
  function runItem(it) {
    closePalette();
    if (it.kind === 'app') navigate(it.app.id);
    else if (it.kind === 'cat') { go('#/'); activeCat = it.cat.id; renderChips(); filterCats(true); }
    else if (it.kind === 'file') { if (it.app) navigate(it.app.id, null, [it.file.path]); else toast('No app here opens that kind of file yet.'); }
    else it.run();
  }
  palInput.addEventListener('input', () => { palSel = 0; renderPalette(); });
  palInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, palItems.length); markSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = (palSel - 1 + palItems.length) % Math.max(1, palItems.length); markSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = palItems[palSel]; if (it) runItem(it); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });

  /* ------------------------------------------------------------- sheet */
  const aiOn = () => { try { const c = JSON.parse(localStorage.getItem('everything:ai') || 'null'); return !!(c && c.endpoint); } catch { return false; } };
  function openSheet(focus) {
    closePalette(); closeMenus();
    $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
    fillSettings();
    setTimeout(() => (focus === 'ai' ? $('#aiEndpoint') : $('#sheetClose')).focus(), 250);
    estimateUsage();
  }
  function closeSheet() { $('#sheet').classList.remove('on'); if (!isPalOpen()) $('#scrim').classList.remove('on'); }
  function fillSettings() {
    let c = {}; try { c = JSON.parse(localStorage.getItem('everything:ai') || '{}') || {}; } catch {}
    $('#aiEndpoint').value = c.endpoint || ''; $('#aiKey').value = c.apiKey || ''; $('#aiModel').value = c.model || '';
    const st = $('#aiState'); st.textContent = aiOn() ? 'On' : 'Off'; st.classList.toggle('on', aiOn());
    applyTheme();
  }
  async function estimateUsage() {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) $('#dataNote').textContent = `Everything you make lives in this browser — about ${fmtBytes(est.usage || 0)} so far.`;
    } catch {}
  }
  const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

  function buildSettings() {
    const accents = { terracotta: '#c8653d', sage: '#6f8f6a', ink: '#4d6a8c', plum: '#91597e', ochre: '#b98a2c' };
    const ab = $('#accents');
    Object.entries(accents).forEach(([k, v]) => ab.append(h('button', { class: 'sw', dataset: { v: k }, 'aria-label': `${k} accent`, title: k[0].toUpperCase() + k.slice(1), style: `background:${v}`, onclick: () => { state.accent = k; save(); applyTheme(); } })));
    const walls = { dawn: ['#f7d9c4', '#e7e0cf', 'Dawn'], sage: ['#d9e3cf', '#ece6d6', 'Sage'], dusk: ['#e6d3df', '#d9dcea', 'Dusk'], sea: ['#cfe0e2', '#d6e1ea', 'Sea'], plain: ['#f4efe7', '#f4efe7', 'Plain'] };
    const wb = $('#walls');
    Object.entries(walls).forEach(([k, [a, b, n]]) => wb.append(h('button', { class: 'wsw', dataset: { v: k }, 'aria-label': `${n} wallpaper`, style: `background:radial-gradient(circle at 25% 20%, ${a}, transparent 70%), radial-gradient(circle at 80% 80%, ${b}, transparent 70%), #f4efe7`, onclick: () => { state.wall = k; save(); applyTheme(); } }, h('span', {}, n))));
    $$('#themeSeg button').forEach((b) => b.addEventListener('click', () => { state.theme = b.dataset.v; save(); applyTheme(); }));
    $('#aiSave').addEventListener('click', () => {
      const endpoint = $('#aiEndpoint').value.trim(), apiKey = $('#aiKey').value.trim(), model = $('#aiModel').value.trim();
      if (!endpoint) { toast('Add an endpoint first, like https://api.openai.com/v1'); return; }
      localStorage.setItem('everything:ai', JSON.stringify({ endpoint, apiKey, model: model || 'gpt-4o-mini' }));
      fillSettings(); toast('AI is on for every app.');
    });
    $('#aiClear').addEventListener('click', () => { localStorage.removeItem('everything:ai'); fillSettings(); toast('Back to the built-in AI.'); });
    $('#aiTest').addEventListener('click', async () => {
      const endpoint = $('#aiEndpoint').value.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, ''), apiKey = $('#aiKey').value.trim(), model = $('#aiModel').value.trim() || 'gpt-4o-mini';
      if (!endpoint) { toast('Add an endpoint first.'); return; }
      const btn = $('#aiTest'); btn.textContent = 'Testing…'; btn.disabled = true;
      try {
        const r = await fetch(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 5 }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
        toast(`Connected — the model said “${(j.choices?.[0]?.message?.content || 'ok').trim().slice(0, 40)}”.`);
      } catch (e) { toast(`Couldn’t reach it: ${String(e.message || e).slice(0, 90)}`); }
      finally { btn.textContent = 'Test'; btn.disabled = false; }
    });
    $('#exportBtn').addEventListener('click', exportData);
    $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); });
    let clearArmed = 0;
    $('#clearBtn').addEventListener('click', async () => {
      const b = $('#clearBtn');
      if (Date.now() - clearArmed > 4000) { clearArmed = Date.now(); b.textContent = 'Tap again to erase everything'; setTimeout(() => { b.textContent = 'Clear everything…'; }, 4000); return; }
      b.textContent = 'Erasing…';
      await wipeAll();
      location.replace(location.pathname);
    });
    $('#tourBtn').addEventListener('click', () => { closeSheet(); go('#/'); setTimeout(startTour, 450); });
    $('#sheetClose').addEventListener('click', closeSheet);
  }

  /* ------------------------------------------------------- data export */
  const toB64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function enc(v) {
    if (v instanceof Blob) return { __ev: 'blob', type: v.type, name: v.name, data: toB64(await v.arrayBuffer()) };
    if (v instanceof ArrayBuffer) return { __ev: 'ab', data: toB64(v) };
    if (ArrayBuffer.isView(v)) return { __ev: 'ta', ctor: v.constructor.name, data: toB64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
    if (v instanceof Date) return { __ev: 'date', v: v.toISOString() };
    if (v instanceof Map) return { __ev: 'map', v: await enc([...v.entries()]) };
    if (v instanceof Set) return { __ev: 'set', v: await enc([...v.values()]) };
    if (Array.isArray(v)) return Promise.all(v.map(enc));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await enc(v[k]); return o; }
    return v;
  }
  function dec(v) {
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') {
      switch (v.__ev) {
        case 'blob': return v.name ? new File([fromB64(v.data)], v.name, { type: v.type }) : new Blob([fromB64(v.data)], { type: v.type });
        case 'ab': return fromB64(v.data).buffer;
        case 'ta': { const C = globalThis[v.ctor] || Uint8Array; const b = fromB64(v.data).buffer; return new C(b); }
        case 'date': return new Date(v.v);
        case 'map': return new Map(dec(v.v));
        case 'set': return new Set(dec(v.v));
        default: { const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o; }
      }
    }
    return v;
  }
  const idbP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const txP = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); });
  async function dbNames() {
    let names = ['everything-drive'];
    try { const dbs = await indexedDB.databases?.(); if (dbs) names = [...new Set(['everything-drive', ...dbs.map((d) => d.name).filter(Boolean)])]; } catch {}
    return names;
  }
  // Backup format v2: newline-delimited JSON, written and read a row at a time so big drives don't need one giant string.
  //   {"format":"everything-backup","version":2,...}  then {"t":"ls",k,v} / {"t":"db",name,version,stores} / {"t":"row",db,s,k?,v} / {"t":"end",rows}
  async function dumpDB(name, parts, onRow) {
    const db = await idbP(indexedDB.open(name));
    try {
      const metas = [];
      for (const sn of db.objectStoreNames) {
        const st = db.transaction(sn).objectStore(sn);
        metas.push({ name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: [...st.indexNames].map((i) => { const ix = st.index(i); return { name: i, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; }) });
      }
      parts.push(JSON.stringify({ t: 'db', name, version: db.version, stores: metas }) + '\n');
      for (const m of metas) {
        const keys = await idbP(db.transaction(m.name).objectStore(m.name).getAllKeys());
        for (let i = 0; i < keys.length; i += 100) {
          const chunk = keys.slice(i, i + 100);
          const tx = db.transaction(m.name); const st = tx.objectStore(m.name);
          const vals = await Promise.all(chunk.map((k) => idbP(st.get(k))));
          for (let j = 0; j < chunk.length; j++) {
            if (vals[j] === undefined) continue;
            const row = { t: 'row', db: name, s: m.name, v: await enc(vals[j]) };
            if (m.keyPath == null) row.k = await enc(chunk[j]);
            parts.push(JSON.stringify(row) + '\n'); onRow();
          }
        }
      }
    } finally { db.close(); }
  }
  let exporting = false;
  async function exportData() {
    if (exporting) return; exporting = true;
    toast('Gathering your data…');
    try {
      const parts = [JSON.stringify({ format: 'everything-backup', version: 2, exportedAt: new Date().toISOString(), origin: location.origin }) + '\n'];
      let rows = 0, ndb = 0;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); parts.push(JSON.stringify({ t: 'ls', k, v: localStorage.getItem(k) }) + '\n'); }
      for (const n of await dbNames()) { try { await dumpDB(n, parts, () => rows++); ndb++; } catch (e) { console.warn('skip db', n, e); } }
      parts.push(JSON.stringify({ t: 'end', rows }) + '\n');
      const blob = new Blob(parts, { type: 'application/x-ndjson' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `everything-backup-${today()}.json` });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 30000);
      state.lastBackup = Date.now(); save();
      toast(`Backup ready — ${fmtBytes(blob.size)}, ${ndb} database${ndb === 1 ? '' : 's'}.`);
    } catch (e) { toast(`Export failed: ${e.message || e}`); }
    finally { exporting = false; }
  }
  async function* lines(file) {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) yield l; }
    }
    if (buf.trim()) yield buf;
  }
  async function openFor(d) {
    await new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); });
    return new Promise((res, rej) => {
      const r = indexedDB.open(d.name, d.version || 1);
      r.onupgradeneeded = () => {
        const db0 = r.result;
        d.stores.forEach((st) => { const os = db0.createObjectStore(st.name, { keyPath: st.keyPath ?? undefined, autoIncrement: !!st.autoIncrement }); (st.indexes || []).forEach((ix) => os.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry })); });
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error(`${d.name} is in use — close other Pravahax Suite tabs and try again`));
    });
  }
  async function wipeStores() {
    for (const n of await dbNames()) await new Promise((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    try { localStorage.clear(); } catch {}
  }
  async function restoreV2(file) {
    // pass 1: the whole file must parse and end with its "end" record before anything is replaced
    let first = true, rows = 0, ended = false;
    for await (const l of lines(file)) {
      const o = JSON.parse(l);
      if (first) { if (o.format !== 'everything-backup' || o.version !== 2) throw new Error('not a backup'); first = false; continue; }
      if (o.t === 'row') rows++; else if (o.t === 'end') ended = o.rows === rows;
    }
    if (!ended) throw new Error('This backup file is incomplete or damaged.');
    closeAll();
    await wipeStores();
    const dbs = new Map(), meta = new Map(), pending = new Map();
    const flush = async (key) => {
      const list = pending.get(key); if (!list || !list.length) return;
      pending.set(key, []);
      const [dn, sn] = key.split('\u0000'); const db = dbs.get(dn); const m = meta.get(key);
      const tx = db.transaction(sn, 'readwrite'); const st = tx.objectStore(sn);
      list.forEach((row) => { const v = dec(row.v); if (m.keyPath != null) st.put(v); else st.put(v, dec(row.k)); });
      await txP(tx);
    };
    first = true;
    for await (const l of lines(file)) {
      if (first) { first = false; continue; }
      const o = JSON.parse(l);
      if (o.t === 'ls') { try { localStorage.setItem(o.k, o.v); } catch {} }
      else if (o.t === 'db') { dbs.set(o.name, await openFor(o)); o.stores.forEach((st) => meta.set(o.name + '\u0000' + st.name, st)); }
      else if (o.t === 'row') {
        const key = o.db + '\u0000' + o.s; if (!dbs.has(o.db)) continue;
        if (!pending.has(key)) pending.set(key, []);
        pending.get(key).push(o);
        if (pending.get(key).length >= 200) await flush(key);
      }
    }
    for (const k of pending.keys()) await flush(k);
    dbs.forEach((db) => db.close());
  }
  async function restoreV1(data) {
    closeAll();
    await wipeStores();
    Object.entries(data.localStorage || {}).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch {} });
    for (const d of data.indexedDB || []) {
      const db = await openFor(d);
      for (const s of d.stores) {
        if (!s.rows.length) continue;
        const tx = db.transaction(s.name, 'readwrite'); const st = tx.objectStore(s.name);
        s.rows.forEach((row) => { const v = dec(row.v); if (s.keyPath != null) st.put(v); else st.put(v, dec(row.k)); });
        await txP(tx);
      }
      db.close();
    }
  }
  async function importData(file) {
    let head = '';
    try { head = await file.slice(0, 200).text(); } catch {}
    const v2 = /^\{"format":"everything-backup","version":2/.test(head);
    const v1 = !v2 && /"format"\s*:\s*"everything-backup"/.test(await file.slice(0, 4096).text().catch(() => ''));
    if (!v1 && !v2) { toast('That file isn’t a Pravahax Suite backup.'); return; }
    if (!confirm('Restore this backup? It replaces all apps’ data in this browser with the backup’s contents.')) return;
    toast('Restoring…', { timeout: 60000 });
    try {
      if (v2) await restoreV2(file);
      else { const data = JSON.parse(await file.text()); if (data.format !== 'everything-backup') throw new Error('not a backup'); await restoreV1(data); }
      toast('Restored. Reloading…');
      setTimeout(() => location.replace(location.pathname), 700);
    } catch (e) { toast(`Import failed: ${e.message || e}`, { timeout: 8000 }); }
  }
  async function wipeAll() {
    closeAll();
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    try { const dbs = await indexedDB.databases?.(); for (const d of dbs || [{ name: 'everything-drive' }]) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(); }); } catch {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  }
  function reloadActive() {
    const t = activeTab(); if (!t || t.el.tagName !== 'IFRAME') return;
    t.loading = true; renderTabs();
    try { t.el.contentWindow.location.reload(); } catch { t.el.src = t.el.src; }
  }

  /* --------------------------------------------------------------- tour */
  function startTour() {
    const steps = [
      { el: () => $('#searchBtn'), title: 'Find anything', body: `${mobile() ? 'Tap Search' : `Press ${MOD} K from anywhere`} to jump to an app, a file or a command. Try typing what you’d use elsewhere — “excel” finds Spreadsheet.` },
      { el: () => $('#pinGrid') || $('#pins'), title: 'Keep favourites close', body: 'Pin what you love from any tile. Drag pins into your own order — long-press on a phone.' },
      { el: () => $('.cat-section .grid'), title: 'Open as many as you like', body: 'Apps stay alive in tabs, like a real desktop. Everything runs in this browser — no account, nothing sent anywhere.' },
    ];
    let i = 0;
    const hole = h('div', { class: 'tour-hole' }), card = h('div', { class: 'tour-card', role: 'dialog', 'aria-label': 'Welcome tour' });
    document.body.append(hole, card);
    const end = () => { hole.remove(); card.remove(); state.toured = true; save(); window.removeEventListener('resize', place); document.removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(); } if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); } };
    const next = () => { if (++i >= steps.length) end(); else show(); };
    function place() {
      const el = steps[i].el(); if (!el) return;
      const r = el.getBoundingClientRect(), pad = 10;
      Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, innerHeight * 0.5) + pad * 2}px`, borderRadius: i === 0 ? '999px' : '26px' });
      const cr = card.getBoundingClientRect();
      let top = r.top + Math.min(r.height, innerHeight * 0.5) + pad + 16;
      if (top + cr.height > innerHeight - 12) top = Math.max(12, r.top - pad - cr.height - 16);
      card.style.top = `${top}px`;
      card.style.left = `${Math.max(14, Math.min(r.left + r.width / 2 - cr.width / 2, innerWidth - cr.width - 14))}px`;
    }
    function show() {
      const s = steps[i], el = s.el();
      if (el) {
        const home = $('#home'); const r = el.getBoundingClientRect();
        const target = home.scrollTop + r.top - innerHeight * 0.28;
        home.scrollTo({ top: Math.max(0, target), behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
      card.replaceChildren(
        h('div', { class: 'step' }, `Step ${i + 1} of ${steps.length}`), h('h4', {}, s.title), h('p', {}, s.body),
        h('div', { class: 'row' }, h('div', { class: 'dots' }, steps.map((_, j) => h('i', { class: j === i ? 'on' : '' }))),
          h('div', { class: 'row' }, i < steps.length - 1 ? h('button', { class: 'btn', onclick: end }, 'Skip') : null, h('button', { class: 'btn accent', onclick: next }, i < steps.length - 1 ? 'Next' : 'Start exploring'))));
      setTimeout(place, reduceMotion() ? 0 : 380); place();
      card.querySelector('.btn.accent')?.focus({ preventScroll: true });
    }
    window.addEventListener('resize', place);
    document.addEventListener('keydown', key, true);
    show();
  }

  /* --------------------------------------------------------- shortcuts */
  function closeOverlays() { closePalette(); closeSheet(); closeMenus(); }
  document.addEventListener('keydown', (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); togglePalette(); return; }
    if (mod && /^[1-9]$/.test(e.key)) { if (tabs[Number(e.key) - 1]) { e.preventDefault(); switchTo(Number(e.key) - 1); } return; }
    if (e.key === 'Escape') {
      if ($$('.menu-pop').length) { closeMenus(); return; }
      if (isPalOpen()) { closePalette(); return; }
      if ($('#sheet').classList.contains('on')) { closeSheet(); return; }
      if (!$('#hubModal').hidden) return;
      if (isFilesOpen()) { e.preventDefault(); go('#/'); return; }
      if (document.body.classList.contains('in-app')) { e.preventDefault(); go('#/'); }
    }
    if (e.key === '/' && !isPalOpen() && !document.body.classList.contains('in-app') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); openPalette(); }
  });

  /* ----------------------------------------------------------- wiring */
  function wire() {
    setIcon($('#settingsBtn'), I.gear); setIcon($('#homeBtn'), I.grid); setIcon($('#reloadBtn'), I.reload); setIcon($('#popBtn'), I.ext); setIcon($('#fsBtn'), I.full); setIcon($('#moreBtn'), I.more); setIcon($('#sheetClose'), I.x);
    $('#dockHome .d-ic').outerHTML = I.home; $('#dockSearch .d-ic').outerHTML = I.search; $('#dockOpen .d-ic').outerHTML = I.layers; $('#dockSettings .d-ic').outerHTML = I.gear; $('#dockFiles .d-ic').outerHTML = I.folder;
    $('#filesBtn').innerHTML = `${I.folder}<span>Files</span>`; setIcon($('#filesBack'), I.home); setIcon($('#filesSearchIc'), I.search);
    $('#filesBtn').addEventListener('click', () => openFiles());
    $('#allFiles').addEventListener('click', () => openFiles());
    $('#dockFiles').addEventListener('click', () => openFiles());
    $('#filesBack').addEventListener('click', () => go('#/'));
    $('#filesQuery').addEventListener('input', (e) => { filesUI.q = e.target.value.trim(); renderFilesView(); });
    $('#filesShowAll').addEventListener('change', (e) => { filesUI.all = e.target.checked; renderFilesView(); });
    $('#browseFilesBtn')?.addEventListener('click', () => { closeSheet(); openFiles(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFiles(); });
    $('#kbdHint').textContent = `${MOD} K`; $('#modKey').textContent = MOD;
    $('#searchBtn').addEventListener('click', () => openPalette());
    $('#settingsBtn').addEventListener('click', () => openSheet());
    $('#themeBtn').addEventListener('click', () => { state.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); });
    $('#homeBtn').addEventListener('click', () => go('#/'));
    $('#reloadBtn').addEventListener('click', reloadActive);
    $('#popBtn').addEventListener('click', () => { const t = activeTab(); if (t) window.open(appURL(t.id), '_blank', 'noopener'); });
    $('#fsBtn').addEventListener('click', toggleFullscreen);
    $('#moreBtn').addEventListener('click', (e) => {
      const t = activeTab(); if (!t) return;
      const others = tabs.filter((x) => x.id !== t.id);
      popMenu(e.currentTarget, [
        ...others.map((o) => ({ label: `Switch to ${byId.get(o.id).name}`, icon: I.layers, run: () => go(`#/app/${o.id}`) })),
        { label: 'Open in new browser tab', icon: I.ext, run: () => window.open(appURL(t.id), '_blank', 'noopener') },
        { label: 'Full screen', icon: I.full, run: toggleFullscreen },
        { label: `Close ${byId.get(t.id).name}`, icon: I.close, run: () => closeTab(t.id) },
        tabs.length > 1 ? { label: 'Close all apps', icon: I.close, run: closeAll } : null,
      ]);
    });
    $('#scrim').addEventListener('click', closeOverlays);
    $('#clearRecents').addEventListener('click', () => { const prev = state.recents; state.recents = []; save(); renderRecents(); toast('Cleared.', { action: { label: 'Undo', run: () => { state.recents = prev; save(); renderRecents(); } } }); });
    $('#dockHome').addEventListener('click', () => { go('#/'); $('#home').scrollTo({ top: 0, behavior: 'smooth' }); });
    $('#dockSearch').addEventListener('click', () => openPalette());
    $('#dockSettings').addEventListener('click', () => openSheet());
    $('#dockOpen').addEventListener('click', (e) => {
      if (!tabs.length) { toast('No apps open yet — tap any app to start.'); return; }
      popMenu(e.currentTarget, [...tabs.map((t) => ({ label: byId.get(t.id).name + (t.title !== byId.get(t.id).name ? ` — ${truncate(t.title, 20)}` : ''), icon: I.layers, run: () => go(`#/app/${t.id}`) })), { label: 'Close all', icon: I.close, run: closeAll }]);
    });
    // Sticky chip bar gets a glass backdrop once it sticks.
    const home = $('#home');
    home.addEventListener('scroll', () => { const bar = $('#chipsBar'); bar.classList.toggle('stuck', bar.getBoundingClientRect().top <= 1); }, { passive: true });
    window.addEventListener('hashchange', route);
    // PWA install
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
    $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $('#installBtn').hidden = true; });
    window.addEventListener('appinstalled', () => toast('Installed. Pravahax Suite now lives on your home screen.'));
    window.addEventListener('online', () => toast('Back online.'));
    window.addEventListener('offline', () => toast('You’re offline — apps you’ve opened before still work.'));
  }

  /* -------------------------------------------------------------- boot */
  // App-level service workers (apps/<id>/sw.js, from earlier builds) would serve stale app pages in front of the hub's
  // worker; drop them before any app frame opens (the engine sends their future registrations to the hub worker).
  const swCleanup = (async () => {
    try {
      const sw = navigator.serviceWorker; if (!sw?.getRegistrations || location.protocol === 'file:') return;
      const base = new URL('apps/', location.href).pathname;
      for (const r of await sw.getRegistrations()) if (new URL(r.scope).pathname.startsWith(base)) await r.unregister().catch(() => {});
    } catch {}
  })();
  async function boot() {
    await Promise.race([swCleanup, new Promise((r) => setTimeout(r, 1500))]);
    wire();
    buildSettings();
    applyTheme();
    try {
      const r = await fetch('apps.json', { cache: 'no-cache' });
      const data = await r.json();
      APPS = data.apps; CATS = data.categories;
    } catch {
      toast('Couldn’t load the app list.');
    }
    byId = new Map(APPS.map((a) => [a.id, a]));
    renderHome();
    route();
    // Find out which apps are present, then mark the rest quietly.
    // Apps that are not on this server are not offered at all (a deep link still explains it).
    Promise.all(APPS.map((a) => checkBuilt(a.id))).then(() => { if ([...built.values()].includes('missing')) { APPS = APPS.filter((a) => built.get(a.id) !== 'missing'); renderHome(); } });
    if (!state.toured && !/^#\/app\//.test(location.hash)) setTimeout(startTour, 900);
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw\b/.test(location.search)) {
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'ehub-notification' && e.data.app && byId.has(e.data.app)) go(`#/app/${e.data.app}`); });
      // An app frame without a working engine (e.g. an old page served by a service worker from an earlier deploy)
      // is reloaded once the current worker is in charge.
      const reviveFrames = () => tabs.forEach((t) => {
        const f = t.el; if (!f || f.tagName !== 'IFRAME') return;
        try { const w = f.contentWindow; if (w && !w.ehub && w.location.pathname.includes('/apps/') && !t.revived) { t.revived = true; w.location.reload(); } } catch {}
      });
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'ehub-sw-upgraded') reviveFrames(); });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        reviveFrames();
        if (hadController) toast('Pravahax Suite was updated. Reload to use the new version — open apps keep running until then.', { action: { label: 'Reload', run: () => location.reload() }, timeout: 20000 });
        hadController = true;
      });
      const reg = () => navigator.serviceWorker.register('sw.js').then((r) => {
        const check = () => { if (navigator.onLine !== false) r.update().catch(() => {}); };
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      }).catch(() => {});
      if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
    }
    setInterval(renderHero, 60 * 1000);
  }
  window.__everythingHub = { state, navigate, openPalette, closePalette, openSheet, toast, tabs, startTour };
  boot();
})();
