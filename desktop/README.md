# Pravahahub for Windows

A desktop wrapper (Electron) that opens https://pravaha-hub.countrypande1.workers.dev in its own window.

Build:
1. `npm install`
2. `npx electron-builder --win dir --x64` (packages into `dist/win-unpacked`, afterPack.js embeds the icon)
3. `makensis installer.nsi` (writes `dist/Pravahahub-Setup-1.0.0.exe`, per-user install, no admin)
