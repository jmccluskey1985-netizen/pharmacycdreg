'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

/** Uncaught errors and promise rejections outside React render (e.g. in event handlers). */
export function ErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
