const path = require('node:path');
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
  const opts = { properties: ['openDirectory'] };
  const result = await dialog.showOpenDialog(window, opts);
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('render', async (_, options) => render({ ...options, onLog: message => window.webContents.send('render-log', message) }));
ipcMain.handle('analyze', async (_, options) => analyze({ ...options, onLog: message => window.webContents.send('render-log', message) }));
