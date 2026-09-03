const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusAPI', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  showMain: () => ipcRenderer.invoke('window:show-main'),
  close: () => ipcRenderer.invoke('window:close'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:always-on-top', enabled),
  resizeMainBy: (edge, dx, dy) => ipcRenderer.invoke('window:resize-by', edge, dx, dy),
  setCompact: (compact) => ipcRenderer.invoke('window:compact', compact),
  toggleFloating: () => ipcRenderer.invoke('floating:toggle'),
  showFloating: () => ipcRenderer.invoke('floating:show'),
  enterFloatingMode: () => ipcRenderer.invoke('window:float-mode'),
  enterFullscreenMode: () => ipcRenderer.invoke('fullscreen:enter'),
  dockFullscreen: () => ipcRenderer.invoke('fullscreen:dock'),
  stopFullscreen: () => ipcRenderer.invoke('fullscreen:stop'),
  requestFullscreenStart: () => ipcRenderer.invoke('fullscreen:start-request'),
  dockFloating: () => ipcRenderer.invoke('floating:dock'),
  resizeFloatingBy: (edge, dx, dy) => ipcRenderer.invoke('floating:resize-by', edge, dx, dy),
  closeFloating: () => ipcRenderer.invoke('floating:close'),
  broadcastTimer: (state) => ipcRenderer.send('timer:broadcast', state),
  sendTimerCommand: (command) => ipcRenderer.send('timer:command', command),
  onTimerState: (callback) => ipcRenderer.on('timer:state', (_event, state) => callback(state)),
  onTimerCommand: (callback) => ipcRenderer.on('timer:command', (_event, command) => callback(command)),
  onFloatingVisibility: (callback) => ipcRenderer.on('floating:visibility', (_event, visible) => callback(visible))
});
