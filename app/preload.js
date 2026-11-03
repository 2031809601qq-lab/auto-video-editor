const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('editor', {
  choose: kind => ipcRenderer.invoke('choose', kind),
  render: options => ipcRenderer.invoke('render', options),
  analyze: options => ipcRenderer.invoke('analyze', options),
  onLog: callback => ipcRenderer.on('render-log', (_, message) => callback(message))
});
