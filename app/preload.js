const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('editor', {
  choose: kind => ipcRenderer.invoke('choose', kind),
  savePlan: (plan, file) => ipcRenderer.invoke('save-plan', plan, file),
  loadPlan: file => ipcRenderer.invoke('load-plan', file),
  render: options => ipcRenderer.invoke('render', options),
  onLog: callback => ipcRenderer.on('render-log', (_, message) => callback(message))
});
