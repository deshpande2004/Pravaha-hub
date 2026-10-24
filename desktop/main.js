// Pravahahub desktop: opens the live Pravahahub site in its own window.
const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('com.pravahahub.desktop'); // own taskbar icon, pinning and notifications on Windows

const HOME = 'https://pravahax-hub.countrypande1.workers.dev/';
const ORIGIN = new URL(HOME).origin;

if (!app.requestSingleInstanceLock()) { app.quit(); }

// Remember window size, position and maximized state between launches, like a native app.
const STATE = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch { return { width: 1400, height: 900, maximized: true }; } }
function saveState() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  try { fs.writeFileSync(STATE(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch {}
}

let win;
function create() {
  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1400, height: st.height || 900, minWidth: 800, minHeight: 560,
    title: 'Pravahahub', backgroundColor: '#ffffff', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
  });
  win.setMenuBarVisibility(false); // no browser-style menu bar; shortcuts still work
  win.once('ready-to-show', () => { if (st.maximized) win.maximize(); win.show(); });
  win.on('close', saveState);
  win.webContents.setVisualZoomLevelLimits(1, 1); // no accidental pinch-zoom of the whole window
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('Pravahahub'); });
  // Mouse back/forward buttons move within Pravahahub.
  win.on('app-command', (e, cmd) => {
    const h = win.webContents.navigationHistory;
    if (cmd === 'browser-backward' && h.canGoBack()) h.goBack();
    if (cmd === 'browser-forward' && h.canGoForward()) h.goForward();
  });
  win.loadURL(HOME);

  // Links to other sites open in the user's browser; Pravahahub pages (and its app windows/popups) stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN) || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: false, title: 'Pravahahub', icon: path.join(__dirname, 'build', 'icon.png') } };
    }
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => child.setMenuBarVisibility(false));
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
      { label: 'Back', accelerator: 'Alt+Left', click: () => { const h = win && win.webContents.navigationHistory; if (h && h.canGoBack()) h.goBack(); } },
      { label: 'Forward', accelerator: 'Alt+Right', click: () => { const h = win && win.webContents.navigationHistory; if (h && h.canGoForward()) h.goForward(); } },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'quit' } ] },
    { role: 'editMenu' }
  ]));
  create();
});
app.on('window-all-closed', () => app.quit());
