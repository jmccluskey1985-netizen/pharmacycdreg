'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, { digest: error.digest }); }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">Something went wrong on this page</h1>
      <p className="text-sm text-muted-foreground">Nothing you’ve already recorded is affected. Every register entry is saved the moment it’s signed. We’ve been notified.</p>
      <div className="flex gap-2">
        <button onClick={reset} className="btn-primary">Try again</button>
        <a href="/dashboard" className="btn-secondary">Back to registers</a>
      </div>
    </div>
  );
}
