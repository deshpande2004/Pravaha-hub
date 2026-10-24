// Lets the site know it is running inside the desktop app, and keeps every app saved for offline use:
// whenever the app is online it asks the service worker to download any app files not yet on this device
// (only what is missing or changed), and reports progress to the taskbar/dock.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pravahaxhubDesktop', { platform: process.platform, version: '1.1.1' });

function saveAll() {
  const sw = navigator.serviceWorker;
  if (!sw || !navigator.onLine || !/^https:$/.test(location.protocol)) return;
  sw.ready.then((reg) => { if (reg.active) reg.active.postMessage({ type: 'ehub-save-all-offline' }); }).catch(() => {});
}
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (window.top !== window) return;
    if (d && d.type === 'ehub-offline-progress') ipcRenderer.send('offline-progress', { state: d.state, done: d.done || 0, total: d.total || 0, failed: d.failed || 0 });
  });
}
if (window.top === window) window.addEventListener('load', () => setTimeout(saveAll, 3000));
if (window.top === window) window.addEventListener('online', () => setTimeout(saveAll, 3000));

// In the desktop app, wording written for the website ("saved in this browser") reads as app wording
// ("saved on this device"). Display text only: typed content, editors and fields are never touched.
(() => {
  if (!/(^|\.)pravahax-hub\.countrypande1\.workers\.dev$/.test(location.hostname)) return;
  const RULES = [
    [/\bin this browser on this device\b/g, 'on this device'],
    [/\b(in|on) this browser\b/g, 'on this device'], [/\bIn this browser\b/g, 'On this device'],
    [/\bfrom this browser\b/g, 'from this device'],
    [/\bin your browser settings\b/g, 'in your system settings'],
    [/\b(right |free |entirely )?in your browser\b/g, (m, a) => (a || '') + 'in the app'],
    [/\bthrough the browser\b/g, 'through the app'],
    [/\bin the browser\b/g, 'in the app'],
    [/\bBrowser [Ss]torage\b/g, 'App storage'], [/\bbrowser storage\b/g, 'app storage'],
    [/\bThis browser\b/g, 'This app'], [/\bthis browser\b/g, 'this app'],
    [/\bYour browser\b/g, 'The app'], [/\byour browser\b/g, 'the app'],
    [/\bThe browser\b/g, 'The app'], [/\bthe browser\b/g, 'the app'],
  ];
  const fix = (s) => { if (!s || !/browser/i.test(s)) return s; for (const [re, to] of RULES) s = s.replace(re, to); return s; };
  const SKIP = 'textarea,input,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],code,pre,script,style,noscript,svg text';
  const skip = (el) => !el || (el.closest && el.closest(SKIP));
  const doText = (n) => { if (!skip(n.parentElement)) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } };
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const doEl = (el) => {
    if (el.nodeType !== 1 || skip(el)) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v && /browser/i.test(v)) el.setAttribute(a, fix(v)); }
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (/browser/i.test(n.nodeValue)) doText(n);
    el.querySelectorAll('[title],[placeholder],[aria-label],[alt]').forEach((c) => { if (!skip(c)) for (const a of ATTRS) { const v = c.getAttribute(a); if (v && /browser/i.test(v)) c.setAttribute(a, fix(v)); } });
  };
  const start = () => {
    doEl(document.documentElement);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') { if (/browser/i.test(m.target.nodeValue)) doText(m.target); }
        else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && /browser/i.test(v) && !skip(m.target)) m.target.setAttribute(m.attributeName, fix(v)); }
        else m.addedNodes.forEach((n) => { if (n.nodeType === 3) { if (/browser/i.test(n.nodeValue)) doText(n); } else doEl(n); });
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  // Native dialogs (alert/confirm/prompt) get the same wording.
  try {
    const { webFrame } = require('electron');
    webFrame.executeJavaScript(`(() => { const R = ${JSON.stringify(RULES.map(([re, to]) => [re.source, re.flags, typeof to === 'string' ? to : null]))};
      const fix = (s) => { s = String(s ?? ''); for (const [src, fl, to] of R) s = s.replace(new RegExp(src, fl), to === null ? ((m, a) => (a || '') + 'in the app') : to); return s; };
      for (const k of ['alert', 'confirm']) { const o = window[k]; window[k] = function (m) { return o.call(this, fix(m)); }; }
      const p = window.prompt; window.prompt = function (m, d) { return p.call(this, fix(m), d); }; })()`);
  } catch {}
})();
