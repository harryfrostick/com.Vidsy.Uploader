/**
 * main.js — Vidsy Bridge
 * Electron main process: window management, BrowserView, IPC handlers,
 * folder watcher (chokidar), session persistence, and float-on-top toggle.
 */

const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  dialog,
  session,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const Store = require('electron-store');

// ─── Persistent store for user prefs ───────────────────────────────────────
const store = new Store({
  defaults: {
    watchFolder: null,
    floatOnTop: false,
    windowBounds: { width: 800, height: 600 },
  },
});

// ─── Globals ────────────────────────────────────────────────────────────────
let mainWindow = null;
let vidsynView = null;  // BrowserView hosting app.vidsy.co
let watcher = null;     // chokidar instance
let currentWatchPath = null;

const VIDSY_BASE = 'https://app.vidsy.co';
const SESSION_PARTITION = 'persist:vidsy'; // key: keeps cookies/localStorage

// ─── Short-hash extractor ───────────────────────────────────────────────────
/**
 * Given a filename like "MIEZ_8368_video_v1.mp4",
 * returns { brand: "MIEZ", hash: "MIEZ_8368" } or null.
 */
function extractShortHash(filename) {
  console.log('[extractShortHash] Input:', filename);
  const match = path.basename(filename).match(/([A-Z]+)_(\d+)/i);
  console.log('[extractShortHash] Regex match result:', match);
  
  if (!match) {
    console.warn('[extractShortHash] No match found for:', filename);
    return null;
  }
  
  const result = {
    brand: match[1].toUpperCase(),
    hash: `${match[1].toUpperCase()}_${match[2]}`,
  };
  console.log('[extractShortHash] Extracted:', result);
  return result;
}

function buildVidsyUrl({ brand, hash }) {
  const url = `${VIDSY_BASE}/curation/${brand}/videos/${hash}`;
  console.log('[buildVidsyUrl] Constructed URL:', url);
  // Result: https://app.vidsy.co/curation/MIEZ/videos/MIEZ_8368
  return url;
}

// ─── Navigate BrowserView + auto-inject file after load ────────────────────
function navigateAndInject(filePath) {
  console.log('[navigateAndInject] Started with:', filePath);
  
  if (!vidsynView) {
    console.error('[navigateAndInject] BrowserView not available');
    return;
  }

  const result = extractShortHash(filePath);
  console.log('[navigateAndInject] Hash extraction result:', result);
  
  if (!result) {
    // Notify renderer that the filename didn't match
    const errorMsg = 'Filename does not match the BRAND_XXXX pattern.';
    console.warn('[navigateAndInject]', errorMsg, 'File:', filePath);
    mainWindow?.webContents.send('nav-error', {
      file: path.basename(filePath),
      reason: errorMsg,
    });
    return;
  }

  const targetUrl = buildVidsyUrl(result);
  console.log('[navigateAndInject] Target URL:', targetUrl);

  // Tell the renderer about the pending navigation so the UI can update
  mainWindow?.webContents.send('nav-started', {
    file: path.basename(filePath),
    url: targetUrl,
    hash: result.hash,
  });

  console.log('[navigateAndInject] Loading URL in BrowserView:', targetUrl);
  vidsynView.webContents.loadURL(targetUrl);

  // Once the page finishes loading, attempt the "Vibe-Check" auto-upload
  vidsynView.webContents.once('did-finish-load', () => {
    console.log('[navigateAndInject] Page loaded, starting inject...');
    injectFileIntoUploader(filePath);
    mainWindow?.webContents.send('nav-complete', { url: targetUrl });
  });
}

/**
 * Vibe-Check: programmatically inject a local file into Vidsy's upload zone.
 *
 * Strategy:
 *  1. Read the file via Node (in main process).
 *  2. Pass the base64 blob + name into the renderer via executeJavaScript.
 *  3. Reconstruct a File object, build a DataTransfer, and dispatch a
 *     "drop" event on whatever element Vidsy uses as its dropzone.
 *
 * Because Vidsy's markup may change, we try multiple selector heuristics.
 */
async function injectFileIntoUploader(filePath) {
  console.log('[injectFileIntoUploader] Starting with:', filePath);
  
  if (!vidsynView) {
    console.error('[injectFileIntoUploader] BrowserView is null!');
    return;
  }
  console.log('[injectFileIntoUploader] BrowserView is available');

  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
    console.log('[injectFileIntoUploader] File read successfully, size:', fileBuffer.length);
  } catch (err) {
    console.error('[injectFileIntoUploader] Could not read file:', err.message);
    mainWindow?.webContents.send('inject-error', { reason: err.message });
    return;
  }

  const base64 = fileBuffer.toString('base64');
  const mimeType = filePath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  const fileName = path.basename(filePath);
  console.log('[injectFileIntoUploader] File ready for injection:', { fileName, mimeType, base64Length: base64.length });

  // This script runs inside Vidsy's page context
  const script = `
    (async () => {
      // Decode base64 → Uint8Array → File
      const b64 = "${base64}";
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], "${fileName}", { type: "${mimeType}" });

      // Heuristic selectors for Vidsy's drop zone (update if their markup changes)
      const selectors = [
        '[data-testid="upload-dropzone"]',
        '.upload-drop-zone',
        '[class*="dropzone"]',
        '[class*="drop-zone"]',
        'input[type="file"]',
      ];

      let target = null;
      for (const sel of selectors) {
        target = document.querySelector(sel);
        if (target) break;
      }

      if (!target) {
        return { ok: false, reason: 'No upload dropzone found on page.' };
      }

      // If it's a file input, set files directly
      if (target.tagName === 'INPUT') {
        const dt = new DataTransfer();
        dt.items.add(file);
        target.files = dt.files;
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, method: 'input' };
      }

      // Otherwise dispatch drag-and-drop events
      const dt = new DataTransfer();
      dt.items.add(file);

      const makeDragEvent = (type) => {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
        return ev;
      };

      target.dispatchEvent(makeDragEvent('dragenter'));
      target.dispatchEvent(makeDragEvent('dragover'));
      target.dispatchEvent(makeDragEvent('drop'));

      return { ok: true, method: 'drag-drop' };
    })()
  `;

  try {
    console.log('[injectFileIntoUploader] Executing JavaScript in BrowserView...');
    const result = await vidsynView.webContents.executeJavaScript(script);
    console.log('[injectFileIntoUploader] Script result:', result);
    
    if (result?.ok) {
      console.log('[injectFileIntoUploader] Success! Method:', result.method);
      mainWindow?.webContents.send('inject-success', { method: result.method, file: fileName });
    } else {
      console.warn('[injectFileIntoUploader] Script returned error:', result?.reason);
      mainWindow?.webContents.send('inject-error', { reason: result?.reason || 'Unknown' });
    }
  } catch (err) {
    console.error('[injectFileIntoUploader] executeJavaScript error:', err.message);
    mainWindow?.webContents.send('inject-error', { reason: err.message });
  }
}

// ─── Folder watcher ─────────────────────────────────────────────────────────
function startWatcher(folderPath) {
  stopWatcher();
  currentWatchPath = folderPath;
  store.set('watchFolder', folderPath);

  watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,         // only react to NEW files, not existing ones
    awaitWriteFinish: {
      stabilityThreshold: 1500, // wait 1.5 s after last write (file fully copied)
      pollInterval: 200,
    },
  });

  watcher.on('add', (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp4' || ext === '.mov') {
      console.log('[watcher] New video detected:', filePath);
      mainWindow?.webContents.send('watcher-file', { filePath });
      navigateAndInject(filePath);
    }
  });

  watcher.on('error', (err) => {
    console.error('[watcher] Error:', err);
    mainWindow?.webContents.send('watcher-error', { reason: err.message });
  });

  mainWindow?.webContents.send('watcher-started', { folderPath });
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

// ─── BrowserView layout helper ──────────────────────────────────────────────
// main.js
const SIDEBAR_WIDTH = 800; // Match your window width

function layoutBrowserView() {
  if (!mainWindow || !vidsynView) return;
  
  // We set width and height to 0 so the Vidsy website
  // is completely invisible, but still running in the background.
  vidsynView.setBounds({
    x: 0,
    y: 0,
    width: 0, 
    height: 0,
  });
}

// ─── Create main window ──────────────────────────────────────────────────────
function createWindow() {
  console.log('[main] createWindow() called');
  const { width, height } = store.get('windowBounds');
  const floatOnTop = store.get('floatOnTop');

  // Use a dedicated persistent session so Vidsy login survives restarts
  const vidsySession = session.fromPartition(SESSION_PARTITION);

  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[main] Preload path:', preloadPath);
  console.log('[main] __dirname:', __dirname);
  console.log('[main] Dev server URL:', MAIN_WINDOW_VITE_DEV_SERVER_URL);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS native traffic lights
    alwaysOnTop: floatOnTop,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,   // security: isolate renderer from Node
      nodeIntegration: false,   // security: no Node in renderer
      sandbox: false,           // needed for preload to use require
    },
  });

  console.log('[main] BrowserWindow created');

  // ── Load the React renderer ──
  const devUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173';
  console.log('[main] Loading URL:', devUrl);
  mainWindow.loadURL(devUrl);
  
  mainWindow.webContents.on('did-fail-load', (error) => {
    console.error('[main] Failed to load:', error);
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[main] Renderer loaded successfully');
  });

  // ── Attach BrowserView for Vidsy ──
  vidsynView = new BrowserView({
    webPreferences: {
      session: vidsySession,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.addBrowserView(vidsynView);
  vidsynView.webContents.loadURL(VIDSY_BASE);
  layoutBrowserView();

  // Re-layout when window is resized
  mainWindow.on('resize', layoutBrowserView);

  // Persist window size
  mainWindow.on('close', () => {
    const [w, h] = mainWindow.getSize();
    store.set('windowBounds', { width: w, height: h });
  });

  // Open external links in system browser, not inside the BrowserView
  vidsynView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Restore watch folder from last session
  const savedFolder = store.get('watchFolder');
  if (savedFolder && fs.existsSync(savedFolder)) {
    startWatcher(savedFolder);
  }
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

// Renderer drops a file onto the React drop zone
ipcMain.on('file-dropped', (_event, { filePath }) => {
  console.log('[main] file-dropped event received:', filePath);
  if (!filePath) {
    console.warn('[main] No file path provided');
    mainWindow?.webContents.send('inject-error', { reason: 'No file path provided' });
    return;
  }
  navigateAndInject(filePath);
});

// Renderer requests folder picker
ipcMain.handle('select-watch-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Watch Folder',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const folderPath = result.filePaths[0];
  startWatcher(folderPath);
  return folderPath;
});

// Stop watching
ipcMain.on('stop-watcher', () => {
  stopWatcher();
  store.set('watchFolder', null);
  mainWindow?.webContents.send('watcher-stopped', {});
});

// Toggle always-on-top
ipcMain.on('set-float', (_event, { enabled }) => {
  store.set('floatOnTop', enabled);
  mainWindow?.setAlwaysOnTop(enabled);
});

// Get initial state for the renderer
ipcMain.handle('get-initial-state', () => ({
  watchFolder: store.get('watchFolder'),
  floatOnTop: store.get('floatOnTop'),
}));

// Manual URL navigate (user types a hash in the UI)
ipcMain.on('navigate-to-hash', (_event, { hash }) => {
  if (!vidsynView || !hash) return;
  const match = hash.match(/^([A-Z]+)_(\d+)$/i);
  if (!match) return;
  const url = buildVidsyUrl({ brand: match[1].toUpperCase(), hash: hash.toUpperCase() });
  vidsynView.webContents.loadURL(url);
  mainWindow?.webContents.send('nav-started', { hash, url });
});

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
