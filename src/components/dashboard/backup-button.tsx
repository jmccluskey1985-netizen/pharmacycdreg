'use client';
import { useState } from 'react';
import { Download, Loader2, Lock } from 'lucide-react';
import { Modal } from '@/components/modal';
import { encryptBackup, MIN_PASSWORD } from '@/lib/backup-crypto';

const save = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/**
 * Full backup, password protected by default. Encrypted here in the browser: the password
 * never leaves this computer and isn't stored anywhere, so it can't be recovered if forgotten.
 */
export function BackupButton() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const close = () => { setOpen(false); setPw(''); setPw2(''); setError(null); setDone(false); };

  async function download(encrypt: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/backup${encrypt ? '?encrypted=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not make the backup');
      const json = await res.text();
      const day = new Date().toISOString().slice(0, 10);
      if (encrypt) save(await encryptBackup(json, pw), `pharmacycdreg-backup-${day}-protected.json`);
      else save(json, `pharmacycdreg-backup-${day}.json`);
      setDone(true); setPw(''); setPw2('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not make the backup'); }
    finally { setBusy(false); }
  }
  const ok = pw.length >= MIN_PASSWORD && pw === pw2;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-fit" title="Everything: registers, entries, destructions, patients, notes, audit trail"><Download className="h-4 w-4" /> Full backup</button>
      <Modal open={open} onClose={close} title="Full backup">
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">Backup downloaded.</p>
            <p className="text-muted-foreground">Move it somewhere safe outside the pharmacy system, such as an encrypted USB key kept in the safe. Keep the password separately: without it the backup can&apos;t be opened.</p>
            <button type="button" onClick={close} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (ok) download(true); }} className="space-y-3 text-sm">
            <p className="text-muted-foreground">Everything in your registers, destruction book, patients, notes and audit trail. It contains patient details, so it&apos;s protected with a password you choose. The password stays on this computer and can&apos;t be recovered: <b className="text-foreground">write it down and keep it safe.</b></p>
            <div><label className="label" htmlFor="bk-pw">Backup password</label><input id="bk-pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={`At least ${MIN_PASSWORD} characters`} /></div>
            <div><label className="label" htmlFor="bk-pw2">Type it again</label><input id="bk-pw2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            {pw2 && pw !== pw2 && <p className="text-destructive">The passwords don&apos;t match.</p>}
            {error && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}
            <button type="submit" disabled={!ok || busy} className="btn-primary w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Download protected backup</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm('Download without a password? Anyone who gets the file can read the patient details in it.')) download(false); }} className="w-full text-center text-xs text-muted-foreground underline">Download without a password</button>
          </form>
        )}
      </Modal>
    </>
  );
}
