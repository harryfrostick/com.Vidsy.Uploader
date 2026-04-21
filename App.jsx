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
const getBridge = () => window.vidsyBridge;

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

    // In Electron, dataTransfer.files may not have .path
    // Try to get paths from the event directly
    const files = Array.from(e.dataTransfer?.files || []);
    
    files.forEach((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'mp4' || ext === 'mov') {
        // In Electron, we can try to use the webkitRelativePath or just send the name
        // The main process will handle the actual file path via native APIs
        onFile(f.path || f.name, f.name);
      }
    });
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'mp4' || ext === 'mov') {
        onFile(f.path || f.name, f.name);
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
        onClick={() => inputRef.current?.click()}
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
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [watchFolder, setWatchFolder] = useState(null);
  const [floatOn, setFloatOn] = useState(false);
  const [manualHash, setManualHash] = useState('');
  const [navStatus, setNavStatus] = useState(null); // { hash, url } | null
  const [isNavigating, setIsNavigating] = useState(false);
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
      getBridge().on('nav-started', ({ file, url, hash }) => {
        setIsNavigating(true);
        setNavStatus({ hash, url });
        addLog('nav', file ? `Navigating for ${file}` : `Navigating to ${hash}`, url);
      }),
      getBridge().on('nav-complete', ({ url }) => {
        setIsNavigating(false);
        addLog('info', 'Page loaded — running Vibe-Check…', url);
      }),
      getBridge().on('nav-error', ({ file, reason }) => {
        setIsNavigating(false);
        addLog('warn', `Skipped: ${file}`, reason);
      }),
      getBridge().on('inject-success', ({ method, file }) => {
        addLog('success', `Upload injected (${method})`, file);
      }),
      getBridge().on('inject-error', ({ reason }) => {
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
    addLog('nav', `File dropped: ${name}`);
    getBridge().fileDropped(filePath);
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
return (
  <div className="flex items-center justify-center h-screen w-full bg-[#f3f3f3] p-10 font-sans">
    <div 
      className="w-full h-full border-4 border-dashed border-gray-400 rounded-[40px] flex items-center justify-center bg-gray-300 hover:bg-gray-400 transition-colors cursor-pointer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFileDrop(file.path, file.name);
      }}
    >
      <p className="text-4xl font-bold text-gray-800 text-center">
        Drag and Drop Files to Upload
      </p>
    </div>
    
    {/* Minimal Status Badge in Corner */}
    <div className="absolute bottom-6 right-8">
       <Badge type={isNavigating ? 'info' : 'success'}>
        {isNavigating ? 'UPLOADING...' : 'SYSTEM READY'}
      </Badge>
    </div>
  </div>
);
}
