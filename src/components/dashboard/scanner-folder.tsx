'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, FolderOpen, X, Loader2 } from 'lucide-react';

/**
 * Desktop scanners: a web page can't drive a scanner (TWAIN/WIA) directly, but every scanner's
 * software saves each scan to a folder. The pharmacist picks that folder once; while the Scan
 * page is open we watch it and hand each NEW file (PDF / JPEG / PNG) straight in, so pressing
 * Scan on the scanner is all it takes.
 *
 * Uses the File System Access API (Chrome and Edge on Windows/Mac). The folder is remembered on
 * this computer only (IndexedDB holds the handle, never any file); files are read in the browser
 * and sent like a chosen photo. Existing files in the folder are ignored: only scans that arrive
 * after it's connected are picked up.
 */

type Perm = 'granted' | 'denied' | 'prompt';
interface DirHandle {
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }>;
  queryPermission?(o: { mode: 'read' }): Promise<Perm>;
  requestPermission?(o: { mode: 'read' }): Promise<Perm>;
}
type PickerWindow = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'read'; startIn?: string }) => Promise<DirHandle> };

const OK_EXT = /\.(pdf|jpe?g|png|webp)$/i;
const TYPE: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Tiny IndexedDB key-value store for the folder handle (handles can't go in localStorage).
function idb<T>(op: 'get' | 'put' | 'delete', value?: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('pcdr-scanner', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(undefined);
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('kv');
        const r = op === 'get' ? store.get('folder') : op === 'put' ? store.put(value, 'folder') : store.delete('folder');
        r.onsuccess = () => resolve(op === 'get' ? (r.result as T) : undefined);
        r.onerror = () => resolve(undefined);
      };
    } catch { resolve(undefined); }
  });
}

async function listFiles(dir: DirHandle) {
  const out: File[] = [];
  for await (const e of dir.values()) {
    if (e.kind !== 'file' || !OK_EXT.test(e.name) || !e.getFile) continue;
    const f = await e.getFile().catch(() => null);
    if (f) out.push(f);
  }
  return out;
}
const key = (f: File) => `${f.name}|${f.lastModified}`;

export function ScannerFolder({ onFile, active, label = 'scan' }: { onFile: (f: File) => void; active: boolean; label?: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [dir, setDir] = useState<DirHandle | null>(null);
  const [state, setState] = useState<'none' | 'needs_ok' | 'watching'>('none');
  const [busy, setBusy] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const pending = useRef<Map<string, number>>(new Map());
  // Files already in the folder when it's connected aren't picked up; ones arriving later are,
  // even if they land while a scan is being reviewed (they're read when you're back here).
  const primed = useRef(false);
  const onFileRef = useRef(onFile);
  useEffect(() => { onFileRef.current = onFile; }, [onFile]);

  // Reconnect the remembered folder (silently if the browser kept permission)
  useEffect(() => {
    const ok = typeof window !== 'undefined' && !!(window as PickerWindow).showDirectoryPicker;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only capability check after hydration
    setSupported(ok);
    if (!ok) return;
    (async () => {
      const h = await idb<DirHandle>('get');
      if (!h) return;
      setDir(h);
      const p = await h.queryPermission?.({ mode: 'read' }).catch(() => 'prompt' as Perm);
      setState(p === 'granted' ? 'watching' : 'needs_ok');
    })();
  }, []);

  // Watch: remember what's there now, then pick up each new file once its size has settled
  useEffect(() => {
    if (!dir || state !== 'watching' || !active) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      const files = await listFiles(dir).catch(() => null);
      if (!files) { setState('needs_ok'); return; }
      for (const f of files) {
        const k = key(f);
        if (seen.current.has(k)) continue;
        if (!primed.current) { seen.current.add(k); continue; }
        // Scanners write the file over a second or two: wait until the size stops changing
        if (f.size > 0 && pending.current.get(k) === f.size) {
          seen.current.add(k); pending.current.delete(k);
          const ext = f.name.split('.').pop()!.toLowerCase();
          onFileRef.current(f.type ? f : new File([f], f.name, { type: TYPE[ext] }));
        } else pending.current.set(k, f.size);
      }
      primed.current = true;
    };
    tick();
    const t = setInterval(tick, 1200);
    return () => { stop = true; clearInterval(t); };
  }, [dir, state, active]);

  const choose = useCallback(async () => {
    const w = window as PickerWindow;
    if (!w.showDirectoryPicker) return;
    setBusy(true);
    try {
      const h = await w.showDirectoryPicker({ id: 'pcdr-scanner', mode: 'read', startIn: 'documents' });
      seen.current = new Set(); pending.current = new Map(); primed.current = false;
      await idb('put', h);
      setDir(h); setState('watching');
    } catch { /* cancelled */ } finally { setBusy(false); }
  }, []);

  const allow = useCallback(async () => {
    if (!dir) return;
    const p = await dir.requestPermission?.({ mode: 'read' }).catch(() => 'denied' as Perm);
    if (p === 'granted') { seen.current = new Set(); primed.current = false; setState('watching'); }
  }, [dir]);

  const forget = useCallback(async () => {
    await idb('delete');
    setDir(null); setState('none');
  }, []);

  if (supported === null) return null;

  return (
    <div className="mt-6 w-full max-w-md rounded-xl bg-muted/50 p-4 text-left text-sm ring-1 ring-border">
      <p className="flex items-center gap-2 font-semibold"><Printer className="h-4 w-4 text-brand" /> Scanner on this computer</p>
      {!supported ? (
        <p className="mt-1 text-muted-foreground">To pick up scans automatically, open PharmacyCDReg in <b>Chrome</b> or <b>Edge</b>. Otherwise, scan as usual, then use <b>Choose photo or PDF</b> and open your scanner’s folder.</p>
      ) : state === 'watching' && dir ? (
        <div className="mt-1">
          <p className="flex items-center gap-2 text-foreground">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" /></span>
            Watching <b className="truncate">{dir.name}</b>
          </p>
          <p className="mt-1 text-muted-foreground">Press <b>Scan</b> on your scanner: each new {label} that lands in this folder is read straight away.</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <button onClick={choose} className="font-semibold text-primary underline">Change folder</button>
            <button onClick={forget} className="inline-flex items-center gap-1 text-muted-foreground underline"><X className="h-3 w-3" /> Stop using scanner</button>
          </div>
        </div>
      ) : state === 'needs_ok' && dir ? (
        <div className="mt-1">
          <p className="text-muted-foreground">Your browser needs a click to keep reading <b>{dir.name}</b>.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={allow} className="btn-primary"><Printer className="h-4 w-4" /> Use scanner folder</button>
            <button onClick={choose} className="btn-secondary"><FolderOpen className="h-4 w-4" /> Choose another</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Tip: choose <b>Allow on every visit</b> when Chrome asks, so this isn’t needed again.</p>
        </div>
      ) : (
        <div className="mt-1">
          <p className="text-muted-foreground">Choose the folder your scanner saves to, once. Then just press Scan on the scanner and it’s read here automatically.</p>
          <button onClick={choose} disabled={busy} className="btn-primary mt-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />} Connect scanner folder</button>
        </div>
      )}
      {supported && (
        <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          <button onClick={() => setHowOpen((o) => !o)} className="font-semibold underline">{howOpen ? 'Hide' : 'Which folder?'}</button>
          {howOpen && (
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Your scanner app chooses it: <b>Windows Scan</b> and <b>Windows Fax and Scan</b> use <i>Pictures › Scans</i> or <i>Documents › Scanned Documents</i>; HP Smart, Epson ScanSmart, Canon IJ Scan Utility and Brother iPrint&amp;Scan show it in their settings.</li>
              <li>Set the scanner to save as <b>PDF</b> or <b>JPEG</b> at 200–300 dpi, colour or greyscale.</li>
              <li>Best: a folder used only for CD scans, e.g. <i>Documents › CD scans</i>.</li>
              <li>Files stay on your computer; only the scan you’re reading is sent, the same as choosing a photo. Nothing is deleted from the folder.</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
