/**
 * preload.js — Vidsy Bridge
 *
 * Runs in the renderer process but has access to Node/Electron APIs.
 * Exposes a minimal, typed API to the React app via contextBridge.
 * Nothing from Node leaks directly — only the functions we explicitly expose.
 */

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// ─── Allowlist for IPC events the renderer can listen to ────────────────────
const ALLOWED_EVENTS = [
  'nav-started',
  'nav-complete',
  'nav-error',
  'inject-success',
  'inject-error',
  'watcher-started',
  'watcher-stopped',
  'watcher-file',
  'watcher-error',
];

contextBridge.exposeInMainWorld('vidsyBridge', {
  // ── Send a locally-dropped file path to main process ──
  fileDropped(filePath) {
    ipcRenderer.send('file-dropped', { filePath });
  },

  // ── Open system folder picker, returns the chosen path or null ──
  selectWatchFolder() {
    return ipcRenderer.invoke('select-watch-folder');
  },

  // ── Stop the chokidar watcher ──
  stopWatcher() {
    ipcRenderer.send('stop-watcher');
  },

  // ── Toggle always-on-top float mode ──
  setFloat(enabled) {
    ipcRenderer.send('set-float', { enabled });
  },

  // ── Navigate BrowserView to a manually entered hash ──
  navigateToHash(hash) {
    ipcRenderer.send('navigate-to-hash', { hash });
  },

  // ── Fetch initial persisted state ──
  getInitialState() {
    return ipcRenderer.invoke('get-initial-state');
  },

  // ── Subscribe to main-process events ──
  // Returns an unsubscribe function for cleanup in useEffect
  on(channel, callback) {
    if (!ALLOWED_EVENTS.includes(channel)) {
      console.warn('[preload] Blocked unknown channel:', channel);
      return () => {};
    }
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ── Utility: extract just the filename from a full path ──
  // Safe to expose — no FS access, just string ops
  basename(filePath) {
    return path.basename(filePath);
  },
});
