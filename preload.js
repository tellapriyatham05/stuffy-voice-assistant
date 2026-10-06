const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stuffy', {
  sendAudio: (samples) => ipcRenderer.send('audio', samples),
  micStatus: (status) => ipcRenderer.send('mic-status', status),
  micLevel: (level) => ipcRenderer.send('mic-level', level),
  onDisplay: (callback) => ipcRenderer.on('display', (_event, display) => callback(display)),
  onSpeak: (callback) => ipcRenderer.on('speak', (_event, audio) => callback(audio)),
  spoke: (id, error) => ipcRenderer.send('spoke', { id, error }),
  pointerOver: (over) => ipcRenderer.send('pointer-over', over),
  dragTo: (x, y) => ipcRenderer.send('drag-to', { x, y }),
  dragEnd: () => ipcRenderer.send('drag-end'),
  clicked: () => ipcRenderer.send('hamster-click'),
  menu: () => ipcRenderer.send('hamster-menu'),
});
