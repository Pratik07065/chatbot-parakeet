const { contextBridge, ipcRenderer } = require('electron');

// Expose safe Electron APIs for multi-window management, sessions, and screen capture
contextBridge.exposeInMainWorld('electronAPI', {
  // Session lifecycle
  startSession: (sessionData) => ipcRenderer.send('session:start', sessionData),
  endSession: (summaryData) => ipcRenderer.send('session:end', summaryData),
  getSessionData: () => ipcRenderer.invoke('session:get-data'),
  onSessionStarted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('session:started', handler);
    return () => ipcRenderer.removeListener('session:started', handler);
  },
  onSessionEnded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('session:ended', handler);
    return () => ipcRenderer.removeListener('session:ended', handler);
  },

  // Screen capture & fast OCR extraction
  fastScreenExtract: () => ipcRenderer.invoke('fast-screen-extract'),
  extractScreenText: () => ipcRenderer.invoke('fast-screen-extract'),
  captureScreen: () => ipcRenderer.invoke('capture:screen'),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  onGlobalShortcutCapture: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('shortcut:capture-screen', handler);
    return () => ipcRenderer.removeListener('shortcut:capture-screen', handler);
  },
  onScreenshotTaken: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('shortcut:capture-screen', handler);
    return () => ipcRenderer.removeListener('shortcut:capture-screen', handler);
  },
  onGlobalShortcut: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('shortcut:capture-screen', handler);
    return () => ipcRenderer.removeListener('shortcut:capture-screen', handler);
  },

  // Audio capture sources
  getAudioSources: () => ipcRenderer.invoke('get-audio-sources'),
  getDesktopSources: () => ipcRenderer.invoke('desktop-capturer:get-sources'),

  // Overlay window controls & dynamic sizing
  resizeOverlay: (dimensions) => ipcRenderer.invoke('resize-overlay', dimensions),
  setIgnoreMouse: (ignore, options) => {
    ipcRenderer.send('window:set-ignore-mouse-events', Boolean(ignore), options || { forward: true });
  },
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('window:set-ignore-mouse-events', Boolean(ignore), options || { forward: true });
  },
  setOpacity: (opacity) => {
    ipcRenderer.send('window:set-opacity', opacity);
  },
  setAlwaysOnTop: (flag) => {
    ipcRenderer.send('window:set-always-on-top', flag);
  },
  setContentProtection: (flag) => {
    ipcRenderer.send('window:set-content-protection', flag);
  },
  minimize: () => {
    ipcRenderer.send('window:minimize');
  },
  toggleWidgetMode: (minimizeToWidget) => ipcRenderer.invoke('toggle-widget-mode', minimizeToWidget),
  onHudModeChange: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('hud-mode-change', handler);
    return () => ipcRenderer.removeListener('hud-mode-change', handler);
  },
  maximize: () => {
    ipcRenderer.send('window:maximize');
  },
  close: () => {
    ipcRenderer.send('window:close');
  },
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  isElectron: true,
});
