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
    windowBounds: { width: 1280, height: 820 }
  }
});
let mainWindow = null;
let vidsynView = null;
let watcher = null;
const VIDSY_BASE = "https://app.vidsy.co";
const SESSION_PARTITION = "persist:vidsy";
function extractShortHash(filename) {
  const match = path.basename(filename).match(/^([A-Z]+)_(\d+)/i);
  if (!match) return null;
  return {
    brand: match[1].toUpperCase(),
    hash: `${match[1].toUpperCase()}_${match[2]}`
  };
}
function buildVidsyUrl({ brand, hash }) {
  return `${VIDSY_BASE}/curation/${brand}/videos/${hash}`;
}
function navigateAndInject(filePath) {
  if (!vidsynView) return;
  const result = extractShortHash(filePath);
  if (!result) {
    mainWindow == null ? void 0 : mainWindow.webContents.send("nav-error", {
      file: path.basename(filePath),
      reason: "Filename does not match the BRAND_XXXX pattern."
    });
    return;
  }
  const targetUrl = buildVidsyUrl(result);
  mainWindow == null ? void 0 : mainWindow.webContents.send("nav-started", {
    file: path.basename(filePath),
    url: targetUrl,
    hash: result.hash
  });
  vidsynView.webContents.loadURL(targetUrl);
  vidsynView.webContents.once("did-finish-load", () => {
    injectFileIntoUploader(filePath);
    mainWindow == null ? void 0 : mainWindow.webContents.send("nav-complete", { url: targetUrl });
  });
}
async function injectFileIntoUploader(filePath) {
  if (!vidsynView) return;
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error("[inject] Could not read file:", err.message);
    mainWindow == null ? void 0 : mainWindow.webContents.send("inject-error", { reason: err.message });
    return;
  }
  const base64 = fileBuffer.toString("base64");
  const mimeType = filePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  const fileName = path.basename(filePath);
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
    const result = await vidsynView.webContents.executeJavaScript(script);
    if (result == null ? void 0 : result.ok) {
      mainWindow == null ? void 0 : mainWindow.webContents.send("inject-success", { method: result.method, file: fileName });
    } else {
      mainWindow == null ? void 0 : mainWindow.webContents.send("inject-error", { reason: (result == null ? void 0 : result.reason) || "Unknown" });
    }
  } catch (err) {
    console.error("[inject] executeJavaScript error:", err.message);
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
const SIDEBAR_WIDTH = 300;
function layoutBrowserView() {
  if (!mainWindow || !vidsynView) return;
  const [winW, winH] = mainWindow.getContentSize();
  vidsynView.setBounds({
    x: SIDEBAR_WIDTH,
    y: 0,
    width: winW - SIDEBAR_WIDTH,
    height: winH
  });
}
function createWindow() {
  const { width, height } = store.get("windowBounds");
  const floatOnTop = store.get("floatOnTop");
  const vidsySession = session.fromPartition(SESSION_PARTITION);
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      // security: isolate renderer from Node
      nodeIntegration: false,
      // security: no Node in renderer
      sandbox: false
      // needed for preload to use require
    }
  });
  {
    mainWindow.loadURL("http://localhost:5173");
  }
  vidsynView = new BrowserView({
    webPreferences: {
      session: vidsySession,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.addBrowserView(vidsynView);
  vidsynView.webContents.loadURL(VIDSY_BASE);
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
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  stopWatcher();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
