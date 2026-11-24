'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Share, SquarePlus, MoreVertical, X, Smartphone, Loader2 } from 'lucide-react';

/* ───────── Shared helpers ───────── */

type Platform = 'ios' | 'android' | 'desktop';
type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Chrome/Edge fire this once, early; keep it for whichever install button is on the page.
let deferred: BeforeInstall | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstall; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch { return null; }
}

function urlB64(key: string) {
  const pad = '='.repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/* ───────── Install ───────── */

function useInstall() {
  const [state, setState] = useState<{ ready: boolean; platform: Platform; installed: boolean; canPrompt: boolean }>({ ready: false, platform: 'desktop', installed: false, canPrompt: false });
  useEffect(() => {
    const update = () => setState({ ready: true, platform: platform(), installed: installed(), canPrompt: !!deferred });
    update();
    registerServiceWorker();
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  const prompt = async () => { if (!deferred) return; await deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; setState((s) => ({ ...s, canPrompt: false, installed: installed() })); };
  return { ...state, prompt };
}

/** The two steps for the phone in the person's hand (or both, on a computer). */
function Steps({ p }: { p: Platform }) {
  const ios = <li className="flex gap-2"><Share className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /><span><b>iPhone / iPad (Safari):</b> tap <b>Share</b>, then <b>Add to Home Screen</b> <SquarePlus className="inline h-3.5 w-3.5" />.</span></li>;
  const android = <li className="flex gap-2"><MoreVertical className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /><span><b>Android (Chrome):</b> tap the <b>⋮</b> menu, then <b>Install app</b> or <b>Add to Home screen</b>.</span></li>;
  return <ul className="mt-2 space-y-1.5 text-sm">{p === 'ios' ? ios : p === 'android' ? android : <>{ios}{android}</>}</ul>;
}

/** Landing page: install button where the browser offers it, otherwise the two steps. */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const i = useInstall();
  if (!i.ready || i.installed) return null;
  return (
    <div className={className}>
      {i.canPrompt
        ? <button type="button" onClick={i.prompt} className="btn-brand"><Download className="h-4 w-4" /> Install the app</button>
        : <><p className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 text-brand" /> Add it to your home screen</p><Steps p={i.platform} /></>}
      <p className="mt-2 text-xs text-muted-foreground">It opens full screen like any app, with nothing to download from an app store.</p>
    </div>
  );
}

/* ───────── Notifications ───────── */

type PushState = 'loading' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'unavailable';

function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (platform() === 'ios' && !installed()) return setState('needs-install');
      if (!pushSupported()) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await registerServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      const r = await fetch(`/api/push${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ''}`).then((x) => x.json()).catch(() => null);
      if (!r?.available) return setState('unavailable');
      setState(sub && r.subscribed ? 'on' : 'off');
    })();
  }, []);
  const turnOn = async () => {
    setBusy(true); setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await registerServiceWorker();
      if (!reg) throw new Error('This browser can’t show notifications.');
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetch('/api/push').then((x) => x.json());
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) }));
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Couldn’t turn notifications on');
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t turn notifications on');
    } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setState('off');
    } finally { setBusy(false); }
  };
  return { state, busy, error, turnOn, turnOff };
}

/** Settings: turn reminder notifications on or off for this device. With onDismiss it's the
 *  dashboard prompt: shown only while they're off, gone once turned on or hidden. */
export function ReminderNotifications({ className = '', onDismiss }: { className?: string; onDismiss?: () => void }) {
  const n = usePush();
  if (n.state === 'loading' || n.state === 'unavailable') return null;
  if (onDismiss && n.state !== 'off') return null;
  return (
    <div className={`card relative flex flex-wrap items-center gap-3 ${onDismiss ? 'pr-10' : ''} ${className}`}>
      {onDismiss && <button onClick={onDismiss} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Hide"><X className="h-4 w-4" /></button>}
      {n.state === 'on' ? <Bell className="h-5 w-5 text-brand" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Phone notifications</p>
        <p className="text-sm text-muted-foreground">
          {n.state === 'on' && 'On for this device. You’ll get a notification each morning when reminders are due. No patient details are shown.'}
          {n.state === 'off' && 'Get a notification on this device each morning when dispensing reminders are due. No patient details are shown.'}
          {n.state === 'needs-install' && 'On iPhone, add the app to your home screen first (Share, then Add to Home Screen), open it from there, then turn notifications on.'}
          {n.state === 'blocked' && 'Notifications are blocked for this site. Allow them in your phone or browser settings, then come back here.'}
          {n.state === 'unsupported' && 'This browser can’t show notifications. Try Chrome, Edge or Safari, or add the app to your home screen.'}
        </p>
        {n.error && <p className="mt-1 text-sm text-destructive">{n.error}</p>}
      </div>
      {n.state === 'off' && <button onClick={n.turnOn} disabled={n.busy} className="btn-brand">{n.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Turn on</button>}
      {n.state === 'on' && <button onClick={n.turnOff} disabled={n.busy} className="btn-secondary">Turn off</button>}
    </div>
  );
}

/* ───────── Dashboard card ───────── */

/** Dashboard: on phones and tablets that haven't installed it yet, how to add it; once it's
 *  installed, a prompt to turn notifications on. Gone once they're on, or when hidden (it stays
 *  hidden on this device). Both stay available in Settings → General. */
export function AppCard() {
  const i = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage, URL, fetched data) read after hydration
    try { setHidden(localStorage.getItem('cdreg-app-card') === 'hidden'); } catch { setHidden(false); }
  }, []);
  const hide = () => { setHidden(true); try { localStorage.setItem('cdreg-app-card', 'hidden'); } catch {} };
  if (!i.ready || hidden) return null;
  if (i.installed) return <ReminderNotifications className="no-print mb-4" onDismiss={hide} />;
  if (i.platform === 'desktop' && !i.canPrompt) return null;
  return (
    <div className="no-print card relative mb-4 border-brand/30 bg-brand/5">
      <button onClick={hide} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Hide"><X className="h-4 w-4" /></button>
      <p className="flex items-center gap-2 pr-8 font-semibold"><Smartphone className="h-5 w-5 text-brand" /> Use it like an app</p>
      <p className="mt-1 text-sm text-muted-foreground">Add the register to your home screen: it opens full screen with its own icon, and can notify you when reminders are due.</p>
      {i.canPrompt ? <button onClick={i.prompt} className="btn-brand mt-3"><Download className="h-4 w-4" /> Install the app</button> : <Steps p={i.platform} />}
    </div>
  );
}
