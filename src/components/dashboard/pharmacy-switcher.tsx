'use client';
import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

/**
 * For a superintendent whose login can open several pharmacies. Switching locks the screen;
 * they sign in with their PIN for the pharmacy they switched to.
 */
export function PharmacySwitcher({ current, pharmacies, dark }: { current?: string; pharmacies?: { id: string; name: string }[]; dark?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!pharmacies || pharmacies.length < 2) return null;
  async function go(id: string) {
    if (id === current) return;
    setBusy(true);
    try { await api('/api/pharmacies/switch', { method: 'POST', json: { pharmacy_id: id } }); window.location.assign('/dashboard'); }
    catch (e) { alert(e instanceof ApiError ? e.message : 'Could not switch pharmacy'); setBusy(false); }
  }
  return (
    <label className={`flex items-center gap-2 text-xs ${dark ? 'text-white/80' : 'text-muted-foreground'}`}>
      {busy ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" /> : <Building2 className="h-4 w-4 flex-shrink-0" />}
      <span className="sr-only">Pharmacy</span>
      <select value={current} onChange={(e) => go(e.target.value)} disabled={busy}
        className={`min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-sm font-medium ${dark ? 'border-white/30 bg-white/10 text-white' : 'border-border bg-card text-foreground'}`}>
        {pharmacies.map((p) => <option key={p.id} value={p.id} className="text-black">{p.name}</option>)}
      </select>
    </label>
  );
}
