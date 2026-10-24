// Pravahahub desktop: opens the live Pravahahub site in its own window.
const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');

const HOME = 'https://pravaha-hub.countrypande1.workers.dev/';
const ORIGIN = new URL(HOME).origin;

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 800, minHeight: 560,
    title: 'Pravahahub', backgroundColor: '#ffffff', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(HOME);

  // Links to other sites open in the user's browser; Pravahahub pages (and its app windows/popups) stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN) || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png') } };
    }
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN) && /^https?:/i.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  // No connection and nothing cached yet: show a friendly retry page.
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  // Camera, microphone, screen share, notifications, clipboard for Meetings and the office apps.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const ok = (details.requestingUrl || '').startsWith(ORIGIN);
    cb(ok && ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture', 'persistent-storage', 'fileSystem'].includes(permission));
  });
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    const { desktopCapturer } = require('electron');
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((s) => cb({ video: s[0] })).catch(() => cb({}));
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Pravahahub', submenu: [
      { label: 'Home', accelerator: 'Alt+Home', click: () => win && win.loadURL(HOME) },
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'quit' } ] },
    { role: 'editMenu' }
  ]));
  create();
});
app.on('window-all-closed', () => app.quit());
