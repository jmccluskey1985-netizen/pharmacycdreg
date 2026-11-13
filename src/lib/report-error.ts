/** Send a browser error to /api/client-error (best effort, never throws). */
export function reportError(err: unknown, extra: { digest?: string } = {}) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const body = JSON.stringify({ message: e.message, stack: e.stack, digest: extra.digest, path: window.location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
    else fetch('/api/client-error', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}
