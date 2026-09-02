const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createEmptyState, normalizeState, pruneTotals } = require('./focus-store');

let mainWindow;
let floatingWindow;

app.setName('Foco');
app.setPath('userData', path.join(app.getPath('appData'), 'Foco-Jonatas'));
app.disableHardwareAcceleration();

function statePath() {
  return path.join(app.getPath('userData'), 'focus-data.json');
}

function readState() {
  try {
    return pruneTotals(normalizeState(JSON.parse(fs.readFileSync(statePath(), 'utf8'))));
  } catch {
    return createEmptyState();
  }
}

function writeState(state) {
  const next = pruneTotals(normalizeState(state));
  const target = statePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(next, null, 2));
  return next;
}

function createWindow() {
  const saved = readState();
  const workArea = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    width: 420,
    height: 332,
    minWidth: 320,
    minHeight: 290,
    maxWidth: 1200,
    maxHeight: 900,
    x: workArea.x + Math.max(0, workArea.width - 452),
    y: workArea.y + 32,
    frame: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    transparent: true,
    resizable: true,
    alwaysOnTop: saved.alwaysOnTop,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

function createFloatingWindow() {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show();
    floatingWindow.focus();
    return floatingWindow;
  }
  const display = screen.getPrimaryDisplay().workArea;
  floatingWindow = new BrowserWindow({
    width: 230,
    height: 112,
    minWidth: 120,
    minHeight: 64,
    maxWidth: 360,
    maxHeight: 160,
    x: display.x + display.width - 250,
    y: display.y + display.height - 142,
    frame: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    thickFrame: true,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'none',
    hasShadow: false,
    roundedCorners: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    minimizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingWindow.loadFile(path.join(__dirname, 'floating.html'));
  floatingWindow.setMaximizable(false);
  floatingWindow.setFullScreenable(false);
  floatingWindow.on('show', () => floatingWindow?.setAlwaysOnTop(true, 'screen-saver'));
  floatingWindow.on('blur', () => floatingWindow?.setAlwaysOnTop(true, 'screen-saver'));
  floatingWindow.on('closed', () => {
    floatingWindow = null;
    mainWindow?.webContents.send('floating:visibility', false);
  });
  return floatingWindow;
}

ipcMain.handle('state:load', () => readState());
ipcMain.handle('state:save', (_event, state) => writeState(state));
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:show-main', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow?.show();
  mainWindow?.focus();
});
ipcMain.handle('window:close', () => {
  if (floatingWindow && !floatingWindow.isDestroyed()) mainWindow?.hide();
  else mainWindow?.close();
});
ipcMain.handle('window:always-on-top', (_event, enabled) => {
  mainWindow?.setAlwaysOnTop(Boolean(enabled));
  return Boolean(enabled);
});
ipcMain.handle('window:compact', (_event, compact) => {
  if (!mainWindow) return;
  if (compact) {
    mainWindow.setMinimumSize(260, 76);
    mainWindow.setSize(328, 104, true);
  } else {
    mainWindow.setSize(328, 248, true);
  }
});
ipcMain.handle('floating:toggle', () => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close();
    return false;
  }
  createFloatingWindow();
  return true;
});
ipcMain.handle('floating:show', () => {
  createFloatingWindow();
  return true;
});
ipcMain.handle('window:float-mode', () => {
  createFloatingWindow();
  mainWindow?.hide();
  return true;
});
ipcMain.handle('floating:dock', () => {
  floatingWindow?.close();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});
ipcMain.handle('floating:close', () => {
  floatingWindow?.close();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
});
ipcMain.handle('floating:bounds', () => floatingWindow?.getBounds());
ipcMain.handle('floating:resize', (_event, width, height) => {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  floatingWindow.setSize(
    Math.max(130, Math.min(360, Math.round(width))),
    Math.max(68, Math.min(160, Math.round(height)))
  );
});
ipcMain.handle('floating:resize-by', (_event, edge, dx, dy) => {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  const bounds = floatingWindow.getBounds();
  let { x, y, width, height } = bounds;
  const minWidth = 120;
  const minHeight = 64;
  const maxWidth = 500;
  const maxHeight = 300;
  if (edge.includes('right')) width = Math.min(maxWidth, Math.max(minWidth, width + dx));
  if (edge.includes('bottom')) height = Math.min(maxHeight, Math.max(minHeight, height + dy));
  if (edge.includes('left')) {
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, width - dx));
    x += width - nextWidth;
    width = nextWidth;
  }
  if (edge.includes('top')) {
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, height - dy));
    y += height - nextHeight;
    height = nextHeight;
  }
  floatingWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
});
ipcMain.handle('floating:compact', () => {
  if (!floatingWindow || floatingWindow.isDestroyed()) return false;
  const { width } = floatingWindow.getBounds();
  const compact = width > 170;
  floatingWindow.setSize(compact ? 150 : 230, compact ? 76 : 112, true);
  return compact;
});
ipcMain.handle('floating:step-size', (_event, direction) => {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  const bounds = floatingWindow.getBounds();
  const step = direction < 0 ? -1 : 1;
  floatingWindow.setSize(
    Math.max(130, Math.min(360, bounds.width + step * 24)),
    Math.max(68, Math.min(160, bounds.height + step * 12)),
    true
  );
});
ipcMain.on('timer:broadcast', (_event, timerState) => {
  floatingWindow?.webContents.send('timer:state', timerState);
});
ipcMain.on('timer:command', (_event, command) => {
  mainWindow?.webContents.send('timer:command', command);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
