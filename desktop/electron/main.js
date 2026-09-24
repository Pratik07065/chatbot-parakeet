const { app, BrowserWindow, ipcMain, shell, desktopCapturer, globalShortcut, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createWorker } = require('tesseract.js');

// Hardware Audio & Chromium Web Audio switches
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); // prevents OS prompt blocking
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('allow-http-screen-capture');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';

let dashboardWindow = null;
let overlayWindow = null;
let currentSessionData = null;
let coreProcess = null;

// Parakeet Floating Widget Mode Bounds & State
const EXPANDED_BOUNDS = { width: 680, height: 600 };
const WIDGET_BOUNDS = { width: 64, height: 64 };
let isWidgetMode = false;
let tray = null;
let lastExpandedBounds = null;

// Setup System Tray
function createTray() {
  if (tray) return;
  try {
    const iconCandidates = [
      path.join(__dirname, '../src/assets/hero.png'),
      path.join(__dirname, '../public/favicon.svg'),
      path.join(__dirname, '../assets/icon.png'),
    ];
    let iconPath = null;
    for (const p of iconCandidates) {
      if (fs.existsSync(p)) {
        iconPath = p;
        break;
      }
    }

    let trayIcon;
    if (iconPath) {
      trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else {
      trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Parakeet Interview Copilot');
    tray.on('click', () => {
      toggleHudMode(false); // Restore full HUD
    });

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Restore HUD Overlay',
        click: () => toggleHudMode(false),
      },
      {
        label: 'Minimize to Floating Widget',
        click: () => toggleHudMode(true),
      },
      { type: 'separator' },
      {
        label: 'Quit Parakeet AI',
        click: () => app.quit(),
      },
    ]);
    tray.setContextMenu(contextMenu);
    console.log('[Electron] System Tray initialized successfully.');
  } catch (err) {
    console.warn('[Electron] Could not initialize system tray:', err);
  }
}

function toggleHudMode(minimizeToWidget) {
  const targetWin = overlayWindow;
  if (!targetWin || targetWin.isDestroyed()) return;

  isWidgetMode = typeof minimizeToWidget === 'boolean' ? minimizeToWidget : !isWidgetMode;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  if (isWidgetMode) {
    // Switch to compact floating bubble
    try {
      const curBounds = targetWin.getBounds();
      if (curBounds.width > 120 && curBounds.height > 120) {
        lastExpandedBounds = curBounds;
      }
    } catch (_) {}

    targetWin.setMinimumSize(48, 48);
    targetWin.setBounds({
      x: Math.round((screenW - WIDGET_BOUNDS.width) / 2),
      y: 24,
      width: WIDGET_BOUNDS.width,
      height: WIDGET_BOUNDS.height,
    });
    targetWin.setAlwaysOnTop(true, 'screen-saver');
    targetWin.webContents.send('hud-mode-change', { mode: 'widget' });
    console.log('[Electron] Switched to compact floating widget mode');
  } else {
    // Restore full HUD overlay
    const targetW = Math.max(420, lastExpandedBounds?.width || EXPANDED_BOUNDS.width);
    const targetH = Math.max(220, lastExpandedBounds?.height || EXPANDED_BOUNDS.height);
    const targetX = Math.max(10, Math.min(screenW - targetW - 10, lastExpandedBounds?.x ?? Math.round((screenW - targetW) / 2)));
    const targetY = Math.max(10, Math.min(screenH - targetH - 10, lastExpandedBounds?.y ?? 24));

    targetWin.setMinimumSize(400, 120);
    targetWin.setBounds({
      x: targetX,
      y: targetY,
      width: targetW,
      height: targetH,
    });
    targetWin.setAlwaysOnTop(true, 'screen-saver');
    targetWin.webContents.send('hud-mode-change', { mode: 'expanded' });
    console.log('[Electron] Restored to expanded overlay mode');
  }
}

// Safe IPC Handler registration (prevents duplicate handler registration crashes)
function registerIpcHandler(channel, handler) {
  try {
    ipcMain.removeHandler(channel);
  } catch (_) {}
  ipcMain.handle(channel, handler);
}

// Production Python Core Engine Lifecycle Manager
function spawnCoreEngine() {
  if (app.isPackaged) {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'parakeet-core.exe' : 'parakeet-core';
    const binaryPath = path.join(process.resourcesPath, 'bin', binaryName);
    
    console.log(`[Electron] Spawning bundled core engine: ${binaryPath}`);
    try {
      coreProcess = spawn(binaryPath, [], {
        stdio: 'ignore',
        detached: false,
        windowsHide: true,
      });

      coreProcess.on('error', (err) => {
        console.error('[Electron] Failed to start core engine binary:', err);
      });

      coreProcess.on('exit', (code, signal) => {
        console.log(`[Electron] Core engine terminated with code ${code}, signal ${signal}`);
      });
    } catch (e) {
      console.error('[Electron] Exception while spawning core engine:', e);
    }
  }
}

function killCoreEngine() {
  if (coreProcess) {
    console.log('[Electron] Terminating core engine process...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', coreProcess.pid.toString(), '/f', '/t']);
      } else {
        coreProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('[Electron] Error killing core engine process:', e);
    }
    coreProcess = null;
  }
}

// 1. Create Clean Light-Themed Dashboard Window (Parakeet Workspace)
function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    center: true,
    frame: true,
    title: 'Parakeet AI',
    backgroundColor: '#F9FAFB',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    dashboardWindow.loadURL(`${VITE_DEV_SERVER_URL}`);
  } else {
    dashboardWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

// 2. Create Stealth Floating HUD Overlay Window
function createOverlayWindow() {
  if (overlayWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const overlayWidth = 680;
  const overlayHeight = 600;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    minWidth: 48,
    minHeight: 48,
    resizable: true,
    x: Math.round((screenWidth - overlayWidth) / 2),
    y: 24, // Positioned gracefully near the top
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    title: 'Parakeet AI - Floating Copilot',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  createTray();

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Undetectable Screen Capture Protection
  overlayWindow.setContentProtection(true);

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}#overlay`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'overlay' });
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    isWidgetMode = false;
  });
}

// Screen capture helper
async function capturePrimaryScreen() {
  const targetWin = overlayWindow || dashboardWindow;
  let wasVisible = false;

  try {
    if (targetWin && !targetWin.isDestroyed()) {
      wasVisible = targetWin.isVisible();
      if (wasVisible) targetWin.hide();
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.min(width || 1920, 1920),
        height: Math.min(height || 1080, 1080),
      },
    });

    const primarySource = sources[0] || sources.find((s) => s.id.includes('screen:0:0'));
    if (!primarySource) throw new Error("No screen source found");

    // Get clean base64 data without data-url prefix
    const imgBuffer = primarySource.thumbnail.toPNG();
    const base64Data = imgBuffer.toString('base64');

    if (targetWin && !targetWin.isDestroyed() && wasVisible) {
      targetWin.show();
      targetWin.focus();
    }

    return {
      success: true,
      image_base64: base64Data,
      dataUrl: `data:image/png;base64,${base64Data}`
    };
  } catch (err) {
    if (targetWin && !targetWin.isDestroyed() && wasVisible) {
      targetWin.show();
    }
    console.error('Failed to capture screen:', err);
    return { success: false, error: err.message };
  }
}

// Ultra-fast Local OCR Worker & Screen Text Extractor
let ocrWorkerInstance = null;
let ocrWorkerPromise = null;

async function getOcrWorker() {
  if (ocrWorkerInstance) return ocrWorkerInstance;
  if (ocrWorkerPromise) return ocrWorkerPromise;

  ocrWorkerPromise = (async () => {
    try {
      console.log('[Electron] Initializing warm local Tesseract OCR worker...');
      const worker = await createWorker('eng');
      ocrWorkerInstance = worker;
      console.log('[Electron] Local Tesseract OCR worker ready.');
      return worker;
    } catch (err) {
      console.error('[Electron] Failed to initialize Tesseract OCR worker:', err);
      ocrWorkerPromise = null;
      throw err;
    }
  })();

  return ocrWorkerPromise;
}

async function fastScreenExtract() {
  const targetWin = overlayWindow || dashboardWindow;
  let wasVisible = false;

  try {
    if (targetWin && !targetWin.isDestroyed()) {
      wasVisible = targetWin.isVisible();
      if (wasVisible) targetWin.hide();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 } // Downscale to 720p to cut capture and OCR processing time
    });

    if (targetWin && !targetWin.isDestroyed() && wasVisible) {
      targetWin.show();
      targetWin.focus();
    }

    const primary = sources[0] || sources.find((s) => s.id.includes('screen:0:0'));
    if (!primary) return { success: false, error: "No screen detected", extracted_text: "" };

    const imgBuffer = primary.thumbnail.toPNG();
    const base64Data = imgBuffer.toString('base64');

    console.log('[Electron] Running local OCR on 1280x720 screen capture...');
    const startTime = Date.now();
    const worker = await getOcrWorker();
    const { data: { text } } = await worker.recognize(imgBuffer);
    const duration = Date.now() - startTime;
    console.log(`[Electron] Local OCR complete in ${duration}ms. Extracted ${text ? text.length : 0} chars.`);

    return {
      success: true,
      extracted_text: text ? text.trim() : "",
      image_base64: base64Data,
      duration_ms: duration,
    };
  } catch (err) {
    if (targetWin && !targetWin.isDestroyed() && wasVisible) {
      targetWin.show();
    }
    console.error('[Electron] Fast screen OCR extraction error:', err);
    return { success: false, error: err.message, extracted_text: "" };
  }
}

// Register Screen & Extraction Handlers immediately
registerIpcHandler('app:version', () => app.getVersion());
registerIpcHandler('app:platform', () => process.platform);
registerIpcHandler('session:get-data', () => currentSessionData);
registerIpcHandler('capture:screen', async () => capturePrimaryScreen());
registerIpcHandler('take-screenshot', async () => capturePrimaryScreen());
registerIpcHandler('fast-screen-extract', async () => fastScreenExtract());
registerIpcHandler('screen:fast-extract', async () => fastScreenExtract());

function handleStartSession(sessionData) {
  currentSessionData = sessionData;
  console.log('[Electron] Starting Copilot Session:', sessionData);

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow.webContents.send('session:started', sessionData);
    });
    if (!overlayWindow.webContents.isLoading()) {
      overlayWindow.webContents.send('session:started', sessionData);
    }

    overlayWindow.show();
    overlayWindow.focus();
  }

  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.hide();
  }
}

function handleEndSession(summaryData) {
  console.log('[Electron] Ending Copilot Session...');

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }

  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('session:ended', summaryData);
    dashboardWindow.show();
    dashboardWindow.focus();
  } else {
    createDashboardWindow();
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.once('did-finish-load', () => {
        dashboardWindow.webContents.send('session:ended', summaryData);
      });
    }
  }
}

// Register session start/end listeners
ipcMain.on('session:start', (event, sessionData) => handleStartSession(sessionData));
ipcMain.on('start-session', (event, sessionData) => handleStartSession(sessionData));
ipcMain.on('session:end', (event, summaryData) => handleEndSession(summaryData));
ipcMain.on('end-session', (event, summaryData) => handleEndSession(summaryData));

// Floating Widget Mode IPC Handlers
ipcMain.handle('toggle-widget-mode', (event, minimizeToWidget) => {
  toggleHudMode(minimizeToWidget);
  return { isWidgetMode };
});
registerIpcHandler('toggle-widget-mode', (event, minimizeToWidget) => {
  toggleHudMode(minimizeToWidget);
  return { isWidgetMode };
});

// Dynamic Overlay Window Resizing & Boundary Alignment
registerIpcHandler('resize-overlay', (event, dimensions) => {
  if (isWidgetMode) return null;
  if (overlayWindow && !overlayWindow.isDestroyed() && dimensions) {
    const { width, height } = dimensions;
    const safeW = Math.max(380, Math.min(1920, Math.round(width)));
    const safeH = Math.max(100, Math.min(1200, Math.round(height)));
    overlayWindow.setSize(safeW, safeH);
    return { width: safeW, height: safeH };
  }
  return null;
});

registerIpcHandler('window:resize-overlay', (event, dimensions) => {
  if (isWidgetMode) return null;
  if (overlayWindow && !overlayWindow.isDestroyed() && dimensions) {
    const { width, height } = dimensions;
    const safeW = Math.max(380, Math.min(1920, Math.round(width)));
    const safeH = Math.max(100, Math.min(1200, Math.round(height)));
    overlayWindow.setSize(safeW, safeH);
    return { width: safeW, height: safeH };
  }
  return null;
});

// Window controls & Mouse Event Pass-Through
function handleSetIgnoreMouse(win, ignore, options) {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
  }
}

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  handleSetIgnoreMouse(win, ignore, options);
});

ipcMain.on('window:set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  handleSetIgnoreMouse(win, ignore, options);
});

ipcMain.on('toggle-ignore-mouse', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  handleSetIgnoreMouse(win, ignore);
});

ipcMain.on('window:set-opacity', (event, opacity) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && typeof opacity === 'number') {
    win.setOpacity(Math.max(0.1, Math.min(1.0, opacity)));
  }
});

ipcMain.on('window:set-always-on-top', (event, flag) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setAlwaysOnTop(Boolean(flag), 'screen-saver');
  }
});

ipcMain.on('window:set-content-protection', (event, flag) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setContentProtection(Boolean(flag));
  }
});

ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win === overlayWindow) {
    toggleHudMode(true);
  } else if (win) {
    win.minimize();
  }
});

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// Audio Loopback & Screen Sources for System Audio Capture
registerIpcHandler('get-audio-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null }));
  } catch (err) {
    console.error('[Electron] Error getting audio sources:', err);
    return [];
  }
});

registerIpcHandler('desktop-capturer:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (err) {
    console.error('[Electron] Error getting capturer sources:', err);
    return [];
  }
});

app.whenReady().then(() => {
  const { session } = require('electron');

  // Re-verify all critical IPC handlers on ready
  registerIpcHandler('fast-screen-extract', async () => fastScreenExtract());
  registerIpcHandler('screen:fast-extract', async () => fastScreenExtract());
  registerIpcHandler('capture:screen', async () => capturePrimaryScreen());
  registerIpcHandler('take-screenshot', async () => capturePrimaryScreen());

  // Explicitly grant media permissions for mic and loopback audio
  if (session.defaultSession) {
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return permission === 'media';
    });
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(permission === 'media');
    });
  }

  // Start backend core engine if running in packaged production mode
  spawnCoreEngine();

  // Pre-warm local OCR worker in background for instant first-time screen recognition
  getOcrWorker().catch((e) => console.log('[Electron] OCR worker pre-warming postponed:', e.message));

  createTray();
  createDashboardWindow();

  // Global hotkey Cmd/Ctrl + Shift + S
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    const targetWin = overlayWindow && overlayWindow.isVisible() ? overlayWindow : dashboardWindow;
    if (targetWin && !targetWin.isDestroyed()) {
      const base64Data = await capturePrimaryScreen();
      targetWin.webContents.send('shortcut:capture-screen', base64Data);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboardWindow();
    }
  });
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  killCoreEngine();
  if (ocrWorkerInstance) {
    try {
      await ocrWorkerInstance.terminate();
    } catch (_) {}
    ocrWorkerInstance = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
