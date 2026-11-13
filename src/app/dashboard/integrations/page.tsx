'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plug, Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Key { id: string; name: string; key_prefix: string; auto_post: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null }

const EXAMPLE = `{
  "external_id": "HALO-ITEM-102938",
  "dispensed_at": "2026-11-12T14:05:00+00:00",
  "drug": { "name": "Oxycodone hydrochloride", "strength": "5mg", "form": "capsule" },
  "quantity": 28,
  "patient": { "name": "Mary Kelly", "address": "14 Main St, Ennis" },
  "prescriber": { "name": "Dr A. Walsh", "address": "Ennis Medical Centre", "registration": "012345" },
  "prescription_ref": "GMS 88213",
  "pharmacist": { "psi_number": "12345", "name": "Aoife Byrne" }
}`;

// Connect Halo (or any dispensing system): create a key, paste it into Halo.
export default function IntegrationsPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState('Halo – dispensary PC');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/dispensings` : '/api/integrations/dispensings';

  const load = useCallback(() => api('/api/integrations/keys').then((d) => setKeys(d.keys)), []);
  useEffect(() => { load(); }, [load]);

  const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); };

  async function create() {
    setError(null);
    try {
      const d = await api('/api/integrations/keys', { method: 'POST', json: { name } });
      setNewKey(d.key);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create key');
    }
  }
  const update = async (id: string, patch: Record<string, unknown>) => { await api('/api/integrations/keys', { method: 'POST', json: { id, ...patch } }); load(); };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Plug className="h-6 w-6 text-brand" /> Halo connection</h1>
        <p className="text-sm text-muted-foreground">When a controlled drug is dispensed in Halo (Add patient / label printed), Halo sends it here. It appears under <b>To confirm</b> for a pharmacist to sign: or goes straight into the register if you turn on auto-post.</p>
      </div>

      <div className="card space-y-3">
        <p className="font-semibold">1. Create a connection key</p>
        <div className="flex gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={create} className="btn-primary whitespace-nowrap"><KeyRound className="h-4 w-4" /> Create key</button>
        </div>
        {newKey && (
          <div className="rounded-lg border border-brand/40 bg-brand/10 p-3">
            <p className="text-sm font-semibold">Copy this key into Halo now: it won&apos;t be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-card px-2 py-1.5 font-mono text-xs">{newKey}</code>
              <button onClick={() => copy(newKey, 'key')} className="btn-secondary py-1.5 text-sm">{copied === 'key' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="card space-y-3">
        <p className="font-semibold">2. Set Halo to send CD dispensings</p>
        <p className="text-sm text-muted-foreground">On each CD dispensed, Halo sends a <code>POST</code> to:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-xs">{endpoint}</code>
          <button onClick={() => copy(endpoint, 'url')} className="btn-secondary py-1.5 text-sm">{copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
        </div>
        <p className="text-sm text-muted-foreground">Header <code>Authorization: Bearer &lt;key&gt;</code>, body as JSON:</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{EXAMPLE}</pre>
        <p className="text-xs text-muted-foreground">Resending the same <code>external_id</code> is safe: it&apos;s only recorded once. To undo a dispensing, send the same item with <code>&quot;action&quot;: &quot;reverse&quot;</code>; it appears under To confirm for a correction.</p>
      </div>

      <div className="card">
        <p className="mb-3 font-semibold">Connections</p>
        {keys.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        <div className="divide-y divide-border">
          {keys.map((k) => (
            <div key={k.id} className={`flex flex-wrap items-center gap-3 py-3 ${k.revoked_at ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{k.name}</p>
                <p className="text-xs text-muted-foreground"><code>{k.key_prefix}…</code> · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString('en-IE')}` : 'not used yet'}{k.revoked_at ? ' · revoked' : ''}</p>
              </div>
              {!k.revoked_at && (
                <>
                  <label className="flex items-center gap-2 text-sm" title="Post straight into the register when the drug, stock and pharmacist (by PSI number) all match">
                    <input type="checkbox" className="h-5 w-5" checked={k.auto_post} onChange={(e) => update(k.id, { auto_post: e.target.checked })} /> Auto-post
                  </label>
                  <button onClick={() => confirm('Revoke this key? Halo will stop being able to send.') && update(k.id, { revoke: true })} className="btn-ghost text-sm text-destructive">Revoke</button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Auto-post only happens when the drug matches an open register, the stock won&apos;t go below zero and the pharmacist&apos;s PSI number sent by Halo matches someone on the Team page. Anything else waits under To confirm. Start with auto-post off until you&apos;re happy it reads Halo correctly.</p>
      </div>
    </div>
  );
}
