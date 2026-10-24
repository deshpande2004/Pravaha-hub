// Lets the site know it is running inside the desktop app, and keeps every app saved for offline use:
// whenever the app is online it asks the service worker to download any app files not yet on this device
// (only what is missing or changed), and reports progress to the taskbar/dock.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pravahaxhubDesktop', { platform: process.platform, version: '1.1.0' });

function saveAll() {
  const sw = navigator.serviceWorker;
  if (!sw || !navigator.onLine || !/^https:$/.test(location.protocol)) return;
  sw.ready.then((reg) => { if (reg.active) reg.active.postMessage({ type: 'ehub-save-all-offline' }); }).catch(() => {});
}
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.type === 'ehub-offline-progress') ipcRenderer.send('offline-progress', { state: d.state, done: d.done || 0, total: d.total || 0, failed: d.failed || 0 });
  });
}
window.addEventListener('load', () => setTimeout(saveAll, 3000));
window.addEventListener('online', () => setTimeout(saveAll, 3000));
