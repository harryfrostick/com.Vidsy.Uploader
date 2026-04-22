"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
console.log("[preload] Loading preload.js");
console.log("[preload] contextBridge:", typeof contextBridge);
console.log("[preload] ipcRenderer:", typeof ipcRenderer);
const ALLOWED_EVENTS = [
  "nav-started",
  "nav-complete",
  "nav-error",
  "inject-success",
  "inject-error",
  "upload-progress",
  "upload-complete",
  "upload-error",
  "watcher-started",
  "watcher-stopped",
  "watcher-file",
  "watcher-error"
];
try {
  contextBridge.exposeInMainWorld("vidsyBridge", {
    // ── Send a locally-dropped file path to main process ──
    fileDropped(filePath) {
      console.log("[preload.fileDropped] Called with:", filePath);
      try {
        ipcRenderer.send("file-dropped", { filePath });
        console.log("[preload.fileDropped] IPC sent successfully");
      } catch (err) {
        console.error("[preload.fileDropped] IPC send failed:", err);
        throw err;
      }
    },
    // ── Open system folder picker, returns the chosen path or null ──
    selectWatchFolder() {
      return ipcRenderer.invoke("select-watch-folder");
    },
    // ── Stop the chokidar watcher ──
    stopWatcher() {
      ipcRenderer.send("stop-watcher");
    },
    // ── Toggle always-on-top float mode ──
    setFloat(enabled) {
      ipcRenderer.send("set-float", { enabled });
    },
    // ── Navigate BrowserView to a manually entered hash ──
    navigateToHash(hash) {
      ipcRenderer.send("navigate-to-hash", { hash });
    },
    // ── Fetch initial persisted state ──
    getInitialState() {
      return ipcRenderer.invoke("get-initial-state");
    },
    // ── Subscribe to main-process events ──
    // Returns an unsubscribe function for cleanup in useEffect
    on(channel, callback) {
      if (!ALLOWED_EVENTS.includes(channel)) {
        console.warn("[preload] Blocked unknown channel:", channel);
        return () => {
        };
      }
      const handler = (_event, data) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    // ── Utility: extract just the filename from a full path ──
    // Safe to expose — no FS access, just string ops
    basename(filePath) {
      return path.basename(filePath);
    }
  });
  console.log('[preload] contextBridge.exposeInMainWorld("vidsyBridge") completed successfully');
} catch (err) {
  console.error("[preload] Failed to expose vidsyBridge:", err);
}
