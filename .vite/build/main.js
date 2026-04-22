"use strict";
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  dialog,
  session,
  shell
} = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const Store = require("electron-store");
const store = new Store({
  defaults: {
    watchFolder: null,
    floatOnTop: false,
    windowBounds: { width: 800, height: 600 }
  }
});
let mainWindow = null;
let vidsynView = null;
let watcher = null;
const VIDSY_BASE = "https://app.vidsy.co";
const SESSION_PARTITION = "persist:vidsy";
function extractShortHash(filename) {
  console.log("[extractShortHash] Input:", filename);
  const match = path.basename(filename).match(/([A-Z]+)_(\d+)/i);
  console.log("[extractShortHash] Regex match result:", match);
  if (!match) {
    console.warn("[extractShortHash] No match found for:", filename);
    return null;
  }
  const result = {
    brand: match[1].toUpperCase(),
    hash: `${match[1].toUpperCase()}_${match[2]}`
  };
  console.log("[extractShortHash] Extracted:", result);
  return result;
}
function buildVidsyUrl({ brand, hash }) {
  const url = `${VIDSY_BASE}/curation/${brand}/videos/${hash}`;
  console.log("[buildVidsyUrl] Constructed URL:", url);
  return url;
}
function navigateAndInject(filePath) {
  console.log("[navigateAndInject] Started with:", filePath);
  if (!vidsynView) {
    console.error("[navigateAndInject] BrowserView not available");
    return;
  }
  const result = extractShortHash(filePath);
  console.log("[navigateAndInject] Hash extraction result:", result);
  if (!result) {
    const errorMsg = "Filename does not match the BRAND_XXXX pattern.";
    console.warn("[navigateAndInject]", errorMsg, "File:", filePath);
    mainWindow == null ? void 0 : mainWindow.webContents.send("nav-error", {
      file: path.basename(filePath),
      reason: errorMsg
    });
    return;
  }
  const targetUrl = buildVidsyUrl(result);
  console.log("[navigateAndInject] Target URL:", targetUrl);
  mainWindow == null ? void 0 : mainWindow.webContents.send("nav-started", {
    file: path.basename(filePath),
    url: targetUrl,
    hash: result.hash
  });
  console.log("[navigateAndInject] Loading URL in BrowserView:", targetUrl);
  vidsynView.webContents.loadURL(targetUrl);
  vidsynView.webContents.once("did-finish-load", () => {
    console.log("[navigateAndInject] Page loaded, starting inject...");
    injectFileIntoUploader(filePath, result.hash);
    mainWindow == null ? void 0 : mainWindow.webContents.send("nav-complete", { url: targetUrl });
  });
}
async function injectFileIntoUploader(filePath, projectHash) {
  console.log("[injectFileIntoUploader] Starting with:", filePath, "Hash:", projectHash);
  if (!vidsynView) {
    console.error("[injectFileIntoUploader] BrowserView is null!");
    return;
  }
  console.log("[injectFileIntoUploader] BrowserView is available");
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
    console.log("[injectFileIntoUploader] File read successfully, size:", fileBuffer.length);
  } catch (err) {
    console.error("[injectFileIntoUploader] Could not read file:", err.message);
    mainWindow == null ? void 0 : mainWindow.webContents.send("inject-error", { reason: err.message });
    return;
  }
  const base64 = fileBuffer.toString("base64");
  const mimeType = filePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  const fileName = path.basename(filePath);
  console.log("[injectFileIntoUploader] File ready for injection:", { fileName, mimeType, base64Length: base64.length });
  const script = `
    (async () => {
      // Decode base64 → Uint8Array → File
      const b64 = "${base64}";
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], "${fileName}", { type: "${mimeType}" });

      // 1. Determine project ID to look for
      const fullHash = "${projectHash}"; 
      const numericID = fullHash.split('_')[1] || fullHash;
      console.log('Searching for project slot:', fullHash, 'or', numericID);
      
      let target = null;
      let projectContainer = null;
      let retries = 0;
      const MAX_RETRIES = 12; // Try for 12 seconds

      while (retries < MAX_RETRIES) {
        const allTextElements = document.querySelectorAll('p, span, h1, h2, h3, h4, div, b, strong, a');
        for (const el of allTextElements) {
          const text = el.textContent.trim();
          if (text.includes(fullHash) || (numericID && text.includes(numericID))) {
            projectContainer = el.closest('[class*="item"], [class*="card"], [class*="row"], [class*="slot"], section, article');
            if (projectContainer) break;
          }
        }

        if (projectContainer) {
          // Inside the container, look for an input first (most reliable)
          target = projectContainer.querySelector('input[type="file"]');
          if (!target) {
            // Then look for standard dropzones
            const selectors = ['[data-testid="upload-dropzone"]', '.upload-drop-zone', '[class*="dropzone"]'];
            for (const sel of selectors) {
              target = projectContainer.querySelector(sel);
              if (target) break;
            }
          }
          if (!target) target = projectContainer;
          break;
        }

        console.log('Slot not found yet, retrying... (' + (retries + 1) + ')');
        await new Promise(r => setTimeout(r, 1000));
        retries++;
      }

      // Final Fallback: Search the entire page for ANY file input if we didn't find one in the container
      if (!target || target.tagName !== 'INPUT') {
        const globalInput = document.querySelector('input[type="file"]');
        if (globalInput) {
          console.log('Using global file input fallback');
          target = globalInput;
        }
      }

      if (!target) {
        console.log('No specific dropzone found, falling back to document.body');
        target = document.body;
      }

      // Method A: Direct Input Injection (Highly Reliable)
      if (target.tagName === 'INPUT') {
        console.log('Executing Direct Input Injection');
        const dt = new DataTransfer();
        dt.items.add(file);
        target.files = dt.files;
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, method: 'input-direct', target: 'input[type="file"]' };
      }

      // Method B: Drag-and-Drop Simulation
      console.log('Executing Drag-and-Drop Simulation');
      if (target.style) {
        target.style.outline = '5px solid violet';
        target.style.backgroundColor = 'rgba(139, 92, 246, 0.2)';
      }

      const dt = new DataTransfer();
      dt.items.add(file);
      dt.dropEffect = 'copy';
      dt.effectAllowed = 'all';

      const makeDragEvent = (type) => {
        const rect = target.getBoundingClientRect();
        return new DragEvent(type, { 
          bubbles: true, 
          cancelable: true, 
          dataTransfer: dt,
          clientX: rect.left + (rect.width / 2),
          clientY: rect.top + (rect.height / 2)
        });
      };

      target.dispatchEvent(makeDragEvent('dragenter'));
      target.dispatchEvent(makeDragEvent('dragover'));
      await new Promise(r => setTimeout(r, 200));
      target.dispatchEvent(makeDragEvent('dragover'));
      target.dispatchEvent(makeDragEvent('drop'));

      return { 
        ok: true, 
        method: 'drag-drop', 
        target: target.tagName + (target.className ? '.' + target.className.split(' ').join('.') : ''),
        foundContainer: !!projectContainer,
        retries: retries
      };
    })()
  `;
  try {
    console.log("[injectFileIntoUploader] Executing JavaScript in BrowserView...");
    const result = await vidsynView.webContents.executeJavaScript(script);
    console.log("[injectFileIntoUploader] Script result:", result);
    if (result == null ? void 0 : result.ok) {
      console.log("[injectFileIntoUploader] Success! Method:", result.method, "Target:", result.target);
      mainWindow == null ? void 0 : mainWindow.webContents.send("inject-success", { method: result.method, file: fileName, target: result.target });
    } else {
      console.warn("[injectFileIntoUploader] Script returned error:", result == null ? void 0 : result.reason);
      mainWindow == null ? void 0 : mainWindow.webContents.send("inject-error", { reason: (result == null ? void 0 : result.reason) || "Unknown" });
    }
  } catch (err) {
    console.error("[injectFileIntoUploader] executeJavaScript error:", err.message);
    mainWindow == null ? void 0 : mainWindow.webContents.send("inject-error", { reason: err.message });
  }
}
function startWatcher(folderPath) {
  stopWatcher();
  store.set("watchFolder", folderPath);
  watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,
    // only react to NEW files, not existing ones
    awaitWriteFinish: {
      stabilityThreshold: 1500,
      // wait 1.5 s after last write (file fully copied)
      pollInterval: 200
    }
  });
  watcher.on("add", (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp4" || ext === ".mov") {
      console.log("[watcher] New video detected:", filePath);
      mainWindow == null ? void 0 : mainWindow.webContents.send("watcher-file", { filePath });
      navigateAndInject(filePath);
    }
  });
  watcher.on("error", (err) => {
    console.error("[watcher] Error:", err);
    mainWindow == null ? void 0 : mainWindow.webContents.send("watcher-error", { reason: err.message });
  });
  mainWindow == null ? void 0 : mainWindow.webContents.send("watcher-started", { folderPath });
}
function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
function layoutBrowserView() {
  if (!mainWindow || !vidsynView) return;
  vidsynView.setBounds({
    x: -2e3,
    y: -2e3,
    width: 1024,
    height: 768
  });
}
function createWindow() {
  console.log("[main] createWindow() called");
  const { width, height } = store.get("windowBounds");
  const floatOnTop = store.get("floatOnTop");
  const vidsySession = session.fromPartition(SESSION_PARTITION);
  const preloadPath = path.join(__dirname, "preload.js");
  console.log("[main] Preload path:", preloadPath);
  console.log("[main] __dirname:", __dirname);
  console.log("[main] Dev server URL:", "http://localhost:5173");
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    // macOS native traffic lights
    alwaysOnTop: floatOnTop,
    backgroundColor: "#0d0d0f",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      // security: isolate renderer from Node
      nodeIntegration: false,
      // security: no Node in renderer
      sandbox: false
      // needed for preload to use require
    }
  });
  console.log("[main] BrowserWindow created");
  const devUrl = "http://localhost:5173";
  console.log("[main] Loading URL:", devUrl);
  mainWindow.loadURL(devUrl);
  mainWindow.webContents.on("did-fail-load", (error) => {
    console.error("[main] Failed to load:", error);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[main] Renderer loaded successfully");
  });
  const vidsyPreloadPath = path.join(__dirname, "vidsy-preload.js");
  vidsynView = new BrowserView({
    webPreferences: {
      session: vidsySession,
      nodeIntegration: false,
      contextIsolation: true,
      preload: vidsyPreloadPath
      // Attach the progress-tracking preload
    }
  });
  mainWindow.addBrowserView(vidsynView);
  vidsynView.webContents.loadURL(VIDSY_BASE);
  vidsynView.webContents.on("console-message", (event, level, message) => {
    console.log("[Vidsy Platform Console]", message);
  });
  layoutBrowserView();
  mainWindow.on("resize", layoutBrowserView);
  mainWindow.on("close", () => {
    const [w, h] = mainWindow.getSize();
    store.set("windowBounds", { width: w, height: h });
  });
  vidsynView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  const savedFolder = store.get("watchFolder");
  if (savedFolder && fs.existsSync(savedFolder)) {
    startWatcher(savedFolder);
  }
}
ipcMain.on("file-dropped", (_event, { filePath }) => {
  console.log("[main] file-dropped event received:", filePath);
  if (!filePath) {
    console.warn("[main] No file path provided");
    mainWindow == null ? void 0 : mainWindow.webContents.send("inject-error", { reason: "No file path provided" });
    return;
  }
  navigateAndInject(filePath);
});
ipcMain.handle("select-watch-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select Watch Folder",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const folderPath = result.filePaths[0];
  startWatcher(folderPath);
  return folderPath;
});
ipcMain.on("stop-watcher", () => {
  stopWatcher();
  store.set("watchFolder", null);
  mainWindow == null ? void 0 : mainWindow.webContents.send("watcher-stopped", {});
});
ipcMain.on("set-float", (_event, { enabled }) => {
  store.set("floatOnTop", enabled);
  mainWindow == null ? void 0 : mainWindow.setAlwaysOnTop(enabled);
});
ipcMain.handle("get-initial-state", () => ({
  watchFolder: store.get("watchFolder"),
  floatOnTop: store.get("floatOnTop")
}));
ipcMain.on("navigate-to-hash", (_event, { hash }) => {
  if (!vidsynView || !hash) return;
  const match = hash.match(/^([A-Z]+)_(\d+)$/i);
  if (!match) return;
  const url = buildVidsyUrl({ brand: match[1].toUpperCase(), hash: hash.toUpperCase() });
  vidsynView.webContents.loadURL(url);
  mainWindow == null ? void 0 : mainWindow.webContents.send("nav-started", { hash, url });
});
ipcMain.on("upload-progress", (_event, { percent }) => {
  mainWindow == null ? void 0 : mainWindow.webContents.send("upload-progress", { percent });
});
ipcMain.on("upload-complete", () => {
  mainWindow == null ? void 0 : mainWindow.webContents.send("upload-complete", {});
});
ipcMain.on("upload-error", (_event, { reason }) => {
  mainWindow == null ? void 0 : mainWindow.webContents.send("upload-error", { reason });
});
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  stopWatcher();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
