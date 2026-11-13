'use client';
import { IntegrityCheck } from '@/components/dashboard/integrity-check';
import { InspectorLinks } from '@/components/dashboard/inspector-links';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const LABEL: Record<string, string> = {
  'cd_entry.receipt': 'Recorded receipt',
  'cd_entry.supply': 'Recorded supply',
  'cd_entry.destruction': 'Recorded destruction',
  'cd_entry.patient_return': 'Recorded patient return',
  'cd_entry.patient_return_destruction': 'Recorded patient-return destruction',
  'cd_entry.correction': 'Corrected an entry',
  'register.opened': 'Opened register',
  'register.viewed': 'Viewed register',
  'register.exported': 'Exported register',
  'staff.signed_in': 'Signed in with PIN',
  'staff.pin_failed': 'Failed PIN attempt',
  'staff.created': 'Added staff member',
  'staff.updated': 'Updated staff member',
  'scan.read': 'Scanned a document',
};

// Append-only audit trail (NFR4/NFR5): every write and sign-in, who and when.
export default function AuditPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [more, setMore] = useState(true);
  const load = async (before?: number) => {
    const d = await api(`/api/audit${before ? `?before=${before}` : ''}`);
    setEvents((e) => [...e, ...d.events]);
    setMore(d.events.length === 100);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Audit trail</h1>
      <p className="mb-4 text-sm text-muted-foreground">This log cannot be edited or deleted.</p>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <IntegrityCheck />
        <InspectorLinks />
      </div>
      <div className="card divide-y divide-border p-0">
        {events.map((e) => (
          <details key={e.id} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
              <span><b>{e.staff_name ?? 'Pharmacy account'}</b> · {LABEL[e.action] ?? e.action}{e.details?.seq ? ` (line ${e.details.seq})` : ''}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{new Date(e.occurred_at).toLocaleString('en-IE')}</span>
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(e.details, null, 2)}</pre>
          </details>
        ))}
        {!events.length && <p className="p-4 text-muted-foreground">Loading…</p>}
      </div>
      {more && events.length > 0 && <button onClick={() => load(events[events.length - 1].id)} className="btn-secondary mt-4">Load older</button>}
    </div>
  );
}
