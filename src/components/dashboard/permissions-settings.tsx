'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/roles';
import { PERMISSIONS, isConfigurable, permits, type Permission, type PermissionOverrides } from '@/lib/permissions';
import { useStaff } from './staff-context';

/** Settings → Roles & permissions: what each role may do in this pharmacy. */
export function PermissionsSettings() {
  const { refresh } = useStaff();
  const [perm, setPerm] = useState<PermissionOverrides | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api('/api/settings/permissions').then((d) => setPerm(d.permissions ?? {})).catch(() => setPerm({})); }, []);
  if (!perm) return <p className="text-muted-foreground">Loading…</p>;

  const roles = STAFF_ROLES;
  const toggle = (role: string, key: Permission, v: boolean) => setPerm((p) => ({ ...p, [role]: { ...(p as any)?.[role], [key]: v } }));
  async function save() {
    setBusy(true); setMsg(null);
    try { const d = await api('/api/settings/permissions', { method: 'PUT', json: { permissions: perm } }); setPerm(d.permissions); setMsg({ ok: true, text: 'Saved. It takes effect straight away and is recorded in the audit trail.' }); refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save' }); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary/60 p-3 text-sm">
        <p><b>Signing register entries is always for pharmacists.</b> Technicians can <b>draft</b> entries; a pharmacist checks and signs them in <b>To confirm</b>. Drafts don’t change a balance until signed.</p>
        <p className="mt-1 text-muted-foreground">Superintendent and supervising pharmacists can always do everything, so nobody is locked out. Greyed boxes can’t be changed.</p>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-xs">
            <tr><th className="p-2.5 text-left font-semibold">Permission</th>{roles.map((r) => <th key={r} className="w-[84px] p-2 text-center font-semibold leading-tight">{ROLE_LABELS[r].replace(' (e.g. inspector view)', '').replace(' pharmacist', '')}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="bg-muted/30">
              <td className="p-2.5"><p className="font-medium">Sign register entries</p><p className="text-xs text-muted-foreground">Record and correct lines with their PIN.</p></td>
              {roles.map((r) => <td key={r} className="p-2 text-center">{['technician', 'read_only'].includes(r) ? <span className="text-muted-foreground">–</span> : <Lock className="mx-auto h-4 w-4 text-brand" aria-label="Always" />}</td>)}
            </tr>
            {PERMISSIONS.map((p) => (
              <tr key={p.key}>
                <td className="p-2.5"><p className="font-medium">{p.label}</p><p className="text-xs text-muted-foreground">{p.text}</p></td>
                {roles.map((r) => {
                  const on = permits(r, p.key, perm);
                  const fixed = !isConfigurable(r, p.key);
                  return (
                    <td key={r} className="p-2 text-center">
                      <input type="checkbox" className="h-4 w-4 accent-[#54BD50] disabled:opacity-40" checked={on} disabled={fixed}
                        aria-label={`${p.label}: ${ROLE_LABELS[r]}`} onChange={(e) => toggle(r, p.key, e.target.checked)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save permissions</button>
        {msg && <p className={`text-sm ${msg.ok ? 'text-brand-dark' : 'text-destructive'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
