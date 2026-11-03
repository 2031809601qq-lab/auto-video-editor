const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { render } = require('./editor');
const { analyze } = require('./ai');
let window;
app.whenReady().then(() => {
  window = new BrowserWindow({ width: 1200, height: 820, minWidth: 900, minHeight: 650, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  window.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) window = new BrowserWindow({ width: 1200, height: 820, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } }); window.loadFile(path.join(__dirname, 'index.html')); });
ipcMain.handle('choose', async (_, kind) => {
  const opts = kind === 'plan' ? { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] } : { properties: ['openDirectory'] };
  const result = await dialog.showOpenDialog(window, opts);
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('save-plan', async (_, plan, file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(plan, null, 2), 'utf8'); return file; });
ipcMain.handle('load-plan', async (_, file) => JSON.parse(fs.readFileSync(file, 'utf8')));
ipcMain.handle('render', async (_, options) => render({ ...options, onLog: message => window.webContents.send('render-log', message) }));
ipcMain.handle('analyze', async (_, options) => analyze({ ...options, onLog: message => window.webContents.send('render-log', message) }));
