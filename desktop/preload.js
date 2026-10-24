// Lets the site know it is running inside the desktop app.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('pravahahubDesktop', { platform: process.platform, version: '1.0.0' });
