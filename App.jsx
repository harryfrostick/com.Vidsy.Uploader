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
const bridge = window.vidsyBridge;

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

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = [...(e.dataTransfer?.files || [])];
    files.forEach((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'mp4' || ext === 'mov') onFile(f.path, f.name);
    });
  };

  return (
    <div
      ref={ref}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-3
        rounded-xl border-2 border-dashed transition-all duration-200 cursor-default select-none
        py-8 px-4
        ${dragging
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
    bridge.getInitialState().then(({ watchFolder: wf, floatOnTop }) => {
      if (wf) setWatchFolder(wf);
      setFloatOn(floatOnTop);
    });
  }, []);

  // ── IPC subscriptions ──
  useEffect(() => {
    const unsubs = [
      bridge.on('nav-started', ({ file, url, hash }) => {
        setIsNavigating(true);
        setNavStatus({ hash, url });
        addLog('nav', file ? `Navigating for ${file}` : `Navigating to ${hash}`, url);
      }),
      bridge.on('nav-complete', ({ url }) => {
        setIsNavigating(false);
        addLog('info', 'Page loaded — running Vibe-Check…', url);
      }),
      bridge.on('nav-error', ({ file, reason }) => {
        setIsNavigating(false);
        addLog('warn', `Skipped: ${file}`, reason);
      }),
      bridge.on('inject-success', ({ method, file }) => {
        addLog('success', `Upload injected (${method})`, file);
      }),
      bridge.on('inject-error', ({ reason }) => {
        addLog('error', 'Auto-upload failed', reason);
      }),
      bridge.on('watcher-started', ({ folderPath }) => {
        addLog('info', 'Watcher active', clamp(folderPath, 40));
      }),
      bridge.on('watcher-stopped', () => {
        addLog('neutral', 'Watcher stopped');
      }),
      bridge.on('watcher-file', ({ filePath }) => {
        addLog('nav', `New file detected`, bridge.basename(filePath));
      }),
      bridge.on('watcher-error', ({ reason }) => {
        addLog('error', 'Watcher error', reason);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [addLog]);

  // ── Handlers ──
  const handleFileDrop = (filePath, name) => {
    addLog('nav', `File dropped: ${name}`);
    bridge.fileDropped(filePath);
  };

  const handleSelectFolder = async () => {
    const folder = await bridge.selectWatchFolder();
    if (folder) {
      setWatchFolder(folder);
      addLog('info', 'Watch folder set', clamp(folder, 40));
    }
  };

  const handleStopWatcher = () => {
    bridge.stopWatcher();
    setWatchFolder(null);
  };

  const handleToggleFloat = () => {
    const next = !floatOn;
    setFloatOn(next);
    bridge.setFloat(next);
    addLog('info', `Float ${next ? 'ON' : 'OFF'}`);
  };

  const handleManualNav = () => {
    const h = manualHash.trim().toUpperCase();
    if (!h.match(/^[A-Z]+_\d+$/)) {
      addLog('warn', 'Invalid hash format', 'Expected: BRAND_XXXX (e.g. MIEZ_8368)');
      return;
    }
    bridge.navigateToHash(h);
    setManualHash('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-screen text-white overflow-hidden"
      style={{
        width: 300,
        background: 'linear-gradient(160deg, #0f0f12 0%, #0c0c0f 100%)',
        fontFamily: "'DM Mono', 'Fira Code', monospace",
      }}
    >
      {/* ── Drag region / title bar ── */}
      <div
        className="flex items-center justify-between px-4 pt-4 pb-3"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* Traffic light spacer */}
        <div className="w-16" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_8px_#8b5cf6]" />
          <span className="text-[11px] font-semibold tracking-widest text-white/70 uppercase">
            Vidsy Bridge
          </span>
        </div>
        <button
          onClick={handleToggleFloat}
          style={{ WebkitAppRegion: 'no-drag' }}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          title={floatOn ? 'Disable float' : 'Float on top'}
        >
          {floatOn ? (
            <Pin size={13} className="text-violet-400" />
          ) : (
            <PinOff size={13} className="text-white/30" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10">

        {/* ── Nav Status ── */}
        {navStatus && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/35 uppercase tracking-wider">Active</span>
              {isNavigating ? (
                <Loader2 size={12} className="text-violet-400 animate-spin" />
              ) : (
                <Wifi size={12} className="text-emerald-400" />
              )}
            </div>
            <Badge type={isNavigating ? 'info' : 'success'}>
              {navStatus.hash}
            </Badge>
            <p className="text-[9px] text-white/25 font-mono truncate">{navStatus.url}</p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        <section>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5 px-0.5">
            Drop a File
          </p>
          <DropZone onFile={handleFileDrop} />
        </section>

        {/* ── Manual Hash ── */}
        <section>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5 px-0.5">
            Jump to Hash
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25"
              />
              <input
                type="text"
                value={manualHash}
                onChange={(e) => setManualHash(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleManualNav()}
                placeholder="MIEZ_8368"
                className="
                  w-full bg-white/5 border border-white/10 rounded-lg
                  pl-7 pr-3 py-2 text-[11px] text-white/80 placeholder-white/20
                  focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.07]
                  transition-all font-mono
                "
              />
            </div>
            <button
              onClick={handleManualNav}
              className="
                px-3 py-2 rounded-lg text-[11px] font-semibold
                bg-violet-600 hover:bg-violet-500 active:scale-95
                transition-all duration-150
              "
            >
              Go
            </button>
          </div>
        </section>

        {/* ── Watch Folder ── */}
        <section>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5 px-0.5">
            Finder Watch
          </p>
          {watchFolder ? (
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <FolderOpen size={14} className="text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-emerald-400 font-semibold">Watching</p>
                  <p className="text-[9px] text-white/40 font-mono truncate">
                    {clamp(watchFolder, 30)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleStopWatcher}
                className="
                  w-full flex items-center justify-center gap-1.5
                  py-1.5 rounded-lg text-[10px] text-red-400
                  bg-red-500/10 hover:bg-red-500/20 border border-red-500/20
                  transition-all duration-150
                "
              >
                <FolderX size={12} />
                Stop Watching
              </button>
            </div>
          ) : (
            <button
              onClick={handleSelectFolder}
              className="
                w-full flex items-center justify-center gap-2
                py-3 rounded-xl text-[11px] font-medium text-white/50
                bg-white/[0.03] border border-white/[0.08]
                hover:bg-white/[0.06] hover:text-white/70 hover:border-white/15
                transition-all duration-150
              "
            >
              <FolderOpen size={14} />
              Select Watch Folder…
            </button>
          )}
        </section>

        {/* ── Activity Log ── */}
        <section className="flex-1">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Activity</p>
            {log.length > 0 && (
              <span className="text-[9px] text-white/20 font-mono">{log.length} entries</span>
            )}
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-2 max-h-64 overflow-y-auto">
            {log.length === 0 ? (
              <p className="text-[10px] text-white/20 text-center py-6">
                Activity will appear here
              </p>
            ) : (
              log.map((entry) => <LogEntry key={entry.id} entry={entry} />)
            )}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
        <span className="text-[9px] text-white/15 font-mono">Vidsy Bridge v1.0</span>
        <span className="text-[9px] text-white/15">
          {floatOn && <span className="text-violet-400/60">● FLOATING</span>}
        </span>
      </div>
    </div>
  );
}
