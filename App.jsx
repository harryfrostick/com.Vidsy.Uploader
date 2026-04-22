/**
 * App.jsx — Vidsy Bridge
 * The React sidebar UI. The BrowserView (Vidsy web app) occupies the right
 * 75% of the window; this sidebar owns the left 300 px.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen,
  FolderX,
  Upload,
  Hash,
  Pin,
  PinOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Film,
  Eye,
  Wifi,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getBridge = () => {
  if (!window.vidsyBridge) {
    console.warn('[App] window.vidsyBridge is not available yet');
  }
  return window.vidsyBridge;
};

function clamp(str, max = 28) {
  if (!str) return '';
  return str.length > max ? '…' + str.slice(-(max - 1)) : str;
}

function getHashFromFilename(name) {
  const m = name.match(/^([A-Z]+)_(\d+)/i);
  return m ? `${m[1].toUpperCase()}_${m[2]}` : null;
}

// ─── Toast / activity log entry ───────────────────────────────────────────────
function useLog(max = 40) {
  const [entries, setEntries] = useState([]);
  const add = useCallback((type, message, detail = '') => {
    setEntries((prev) => [
      { id: Date.now() + Math.random(), type, message, detail, ts: new Date() },
      ...prev.slice(0, max - 1),
    ]);
  }, []);
  return [entries, add];
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function Badge({ type, children }) {
  const styles = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    error: 'bg-red-500/15 text-red-400 border-red-500/30',
    warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    neutral: 'bg-white/5 text-white/50 border-white/10',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${styles[type] || styles.neutral}`}
    >
      {children}
    </span>
  );
}

// ─── Log entry row ────────────────────────────────────────────────────────────
const LOG_ICON = {
  success: <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />,
  error: <XCircle size={12} className="text-red-400 shrink-0" />,
  warn: <AlertTriangle size={12} className="text-amber-400 shrink-0" />,
  info: <Eye size={12} className="text-sky-400 shrink-0" />,
  nav: <Film size={12} className="text-violet-400 shrink-0" />,
};

function LogEntry({ entry }) {
  const icon = LOG_ICON[entry.type] || LOG_ICON.info;
  return (
    <div className="flex gap-2 py-1.5 border-b border-white/5 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-white/80 leading-snug truncate">{entry.message}</p>
        {entry.detail && (
          <p className="text-[10px] text-white/35 font-mono truncate">{entry.detail}</p>
        )}
      </div>
      <span className="text-[9px] text-white/20 ml-auto shrink-0 mt-0.5 font-mono">
        {entry.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}

// ─── Drop Zone ───────────────────────────────────────────────────────────────
function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    console.log('[DropZone.handleDrop] Drop event received');

    // "onFile" callback is the handleFileDrop from parent component
    // which needs the actual file path
    const dataTransfer = e.dataTransfer;
    const files = Array.from(dataTransfer?.files || []);
    
    console.log('[DropZone.handleDrop] Number of files:', files.length);
    
    if (files.length === 0) {
      console.log('[DropZone.handleDrop] No files found');
      return;
    }

    files.forEach((f, idx) => {
      console.log(`[DropZone.handleDrop] File ${idx}:`, {
        name: f.name,
        type: f.type,
        size: f.size,
        hasPath: !!f.path,
        pathValue: f.path
      });
      
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'mp4' || ext === 'mov') {
        const pathToPass = f.path || f.name;
        console.log(`[DropZone.handleDrop] Calling onFile with: path="${pathToPass}", name="${f.name}"`);
        onFile(pathToPass, f.name);
      } else {
        console.log(`[DropZone.handleDrop] File ${idx} skipped - extension ${ext} not mp4/mov`);
      }
    });
  };

  const handleFileInput = (e) => {
    console.log('[DropZone.handleFileInput] File input changed');
    const files = Array.from(e.target.files || []);
    console.log('[DropZone.handleFileInput] Number of files:', files.length);
    
    files.forEach((f, idx) => {
      console.log(`[DropZone.handleFileInput] File ${idx}:`, {
        name: f.name,
        hasPath: !!f.path,
        pathValue: f.path
      });
      
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'mp4' || ext === 'mov') {
        const pathToPass = f.path || f.name;
        console.log(`[DropZone.handleFileInput] Calling onFile with: path="${pathToPass}", name="${f.name}"`);
        onFile(pathToPass, f.name);
      }
    });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".mp4,.mov"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
      <div
        ref={ref}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          console.log('[DropZone] Click handler fired');
          addLog('info', 'Drop zone clicked');
          inputRef.current?.click();
        }}
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none
          py-8 px-4
          ${
            dragging
              ? 'border-violet-400 bg-violet-500/10 scale-[1.02]'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
          }
        `}
      >
        <div
          className={`
            w-12 h-12 rounded-full flex items-center justify-center transition-all
            ${dragging ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-white/30'}
          `}
        >
        <Upload size={22} strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="text-xs text-white/60 font-medium">
          {dragging ? 'Release to process' : 'Drop .mp4 or .mov here'}
        </p>
        <p className="text-[10px] text-white/25 mt-0.5">
          Auto-navigates & injects into Vidsy
        </p>
      </div>
    </div>
    </>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  console.log('[App] ========== APP COMPONENT LOADED (v2 with enhanced logging) ==========');
  const [watchFolder, setWatchFolder] = useState(null);
  const [floatOn, setFloatOn] = useState(false);
  const [manualHash, setManualHash] = useState('');
  const [navStatus, setNavStatus] = useState(null); // { hash, url } | null
  const [isNavigating, setIsNavigating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // 0-100 | null
  const [uploadStatus, setUploadStatus] = useState('READY'); // READY, NAVIGATING, UPLOADING, COMPLETED, ERROR
  const [hasError, setHasError] = useState(false);
  const [log, addLog] = useLog();

  // ── Boot: restore persisted state ──
  useEffect(() => {
    getBridge().getInitialState().then(({ watchFolder: wf, floatOnTop }) => {
      if (wf) setWatchFolder(wf);
      setFloatOn(floatOnTop);
    });
  }, []);

  // ── IPC subscriptions ──
  useEffect(() => {
    const unsubs = [
      getBridge().on('upload-progress', ({ percent }) => {
        setUploadProgress(percent);
        setUploadStatus('UPLOADING');
      }),
      getBridge().on('upload-complete', () => {
        setUploadProgress(null);
        setUploadStatus('COMPLETED');
        addLog('success', 'Upload complete!');
        // Revert to READY after 5 seconds
        setTimeout(() => setUploadStatus('READY'), 5000);
      }),
      getBridge().on('upload-error', ({ reason }) => {
        setUploadProgress(null);
        setUploadStatus('ERROR');
        addLog('error', 'Upload failed', reason);
      }),
      getBridge().on('nav-started', ({ file, url, hash }) => {
        setIsNavigating(true);
        setHasError(false);
        setUploadStatus('NAVIGATING');
        setNavStatus({ hash, url });
        addLog('nav', file ? `Navigating for ${file}` : `Navigating to ${hash}`, url);
      }),
      getBridge().on('nav-complete', ({ url }) => {
        setIsNavigating(false);
        addLog('info', 'Page loaded — running Vibe-Check…', url);
      }),
      getBridge().on('nav-error', ({ file, reason }) => {
        setIsNavigating(false);
        setHasError(true);
        setUploadStatus('ERROR');
        addLog('warn', `Skipped: ${file}`, reason);
      }),
      getBridge().on('inject-success', ({ method, file, target }) => {
        setHasError(false);
        addLog('success', `Upload injected into ${target || 'page'}`, file);
      }),
      getBridge().on('inject-error', ({ reason }) => {
        setHasError(true);
        setUploadStatus('ERROR');
        addLog('error', 'Auto-upload failed', reason);
      }),
      getBridge().on('watcher-started', ({ folderPath }) => {
        addLog('info', 'Watcher active', clamp(folderPath, 40));
      }),
      getBridge().on('watcher-stopped', () => {
        addLog('neutral', 'Watcher stopped');
      }),
      getBridge().on('watcher-file', ({ filePath }) => {
        addLog('nav', `New file detected`, getBridge().basename(filePath));
      }),
      getBridge().on('watcher-error', ({ reason }) => {
        addLog('error', 'Watcher error', reason);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [addLog]);

  // ── Handlers ──
  const handleFileDrop = (filePath, name) => {
    console.log('[App.handleFileDrop] >>> ENTER <<<');
    console.log('[App.handleFileDrop] filePath=', filePath, 'type=', typeof filePath);
    console.log('[App.handleFileDrop] name=', name, 'type=', typeof name);
    addLog('nav', `Dropped: ${name}`, filePath || '(no path)');
    
    if (!filePath || filePath === name) {
      addLog('error', 'Invalid file path', `${name} - cannot proceed`);
      console.error('[App.handleFileDrop] EXIT: Invalid path check failed');
      console.error('[App.handleFileDrop] filePath truthy?', !!filePath);
      console.error('[App.handleFileDrop] filePath === name?', filePath === name);
      return;
    }
    
    addLog('info', 'Sending to backend...', filePath);
    console.log('[App.handleFileDrop] Bridge check...');
    
    const bridge = getBridge();
    if (!bridge) {
      console.error('[App.handleFileDrop] EXIT: Bridge is null');
      addLog('error', 'Bridge unavailable', 'Cannot communicate with backend');
      return;
    }
    
    if (!bridge.fileDropped) {
      console.error('[App.handleFileDrop] EXIT: fileDropped method not available');
      console.log('[App.handleFileDrop] Bridge methods available:', Object.keys(bridge));
      addLog('error', 'Method unavailable', 'fileDropped not found on bridge');
      return;
    }
    
    console.log('[App.handleFileDrop] Invoking bridge.fileDropped(...)');
    try {
      bridge.fileDropped(filePath);
      console.log('[App.handleFileDrop] <<< SUCCESS >>>');
      addLog('success', 'Backend notified', filePath);
    } catch (err) {
      console.error('[App.handleFileDrop] EXIT: Exception:', err.message);
      addLog('error', 'Backend error', err.message);
    }
  };

  const handleSelectFolder = async () => {
    const folder = await getBridge().selectWatchFolder();
    if (folder) {
      setWatchFolder(folder);
      addLog('info', 'Watch folder set', clamp(folder, 40));
    }
  };

  const handleStopWatcher = () => {
    getBridge().stopWatcher();
    setWatchFolder(null);
  };

  const handleToggleFloat = () => {
    const next = !floatOn;
    setFloatOn(next);
    getBridge().setFloat(next);
    addLog('info', `Float ${next ? 'ON' : 'OFF'}`);
  };

  const handleManualNav = () => {
    const h = manualHash.trim().toUpperCase();
    if (!h.match(/^[A-Z]+_\d+$/)) {
      addLog('warn', 'Invalid hash format', 'Expected: BRAND_XXXX (e.g. MIEZ_8368)');
      return;
    }
    getBridge().navigateToHash(h);
    setManualHash('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const getStatusConfig = () => {
    switch (uploadStatus) {
      case 'COMPLETED': return { text: 'COMPLETED', color: 'text-green-400' };
      case 'UPLOADING': return { text: 'UPLOADING', color: 'text-violet-400 animate-pulse' };
      case 'NAVIGATING': return { text: 'NAVIGATING', color: 'text-blue-400' };
      case 'ERROR': return { text: 'ERROR', color: 'text-red-400' };
      default: return { text: 'READY', color: 'text-white/40' };
    }
  };

  const statusCfg = getStatusConfig();

  return (
    <div className="flex flex-col h-screen text-white overflow-hidden bg-[#0d0d0f] font-sans selection:bg-violet-500/30">
      {/* ── Header ── */}
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d0d0f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Zap size={18} fill="white" />
          </div>
          <h1 className="text-sm font-bold tracking-widest text-white/90 uppercase">Vidsy Bridge</h1>
        </div>
        <div className={`text-[10px] font-black tracking-[0.2em] px-3 py-1 rounded-full bg-white/5 border border-white/5 ${statusCfg.color} transition-all duration-500`}>
          {statusCfg.text}
        </div>
      </header>

      <div className="flex-1 p-6 flex flex-col gap-6">
        {/* The Giant Drop Zone */}
        <section className="flex-1 flex flex-col">
          <DropZone onFile={handleFileDrop} />
        </section>

        {/* Upload Progress */}
        {uploadProgress !== null && (
          <div className="px-6 py-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-mono text-white/50 uppercase">Uploading...</span>
              <span className="text-[10px] font-mono text-violet-400">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-violet-500 transition-all duration-300 ease-out" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Simplified Activity Feed */}
        <section className="h-48 overflow-y-auto bg-white/5 rounded-xl p-3 border border-white/10">
          <p className="text-[10px] uppercase opacity-30 mb-2">Upload Queue</p>
          {log.length === 0 ? (
            <p className="text-xs opacity-20 text-center py-10">Drop files to begin</p>
          ) : (
            log.map((entry) => <LogEntry key={entry.id} entry={entry} />)
          )}
        </section>
      </div>
    </div>
  );
}
