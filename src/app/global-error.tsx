'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, { digest: error.digest }); }, [error]);
  return (
    <html lang="en-IE">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
        <h1>PharmacyCDReg.ie couldn’t load</h1>
        <p>Your register is safe. Please try again in a moment.</p>
        <button onClick={reset} style={{ padding: '10px 18px', borderRadius: 8, border: 0, background: '#184B21', color: '#fff' }}>Try again</button>
      </body>
    </html>
  );
}
