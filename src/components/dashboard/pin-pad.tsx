'use client';

import { useEffect, useState } from 'react';
import { Delete, Loader2, LogOut } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { LogoMark } from '@/components/logo';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useStaff } from './staff-context';

/**
 * The "sign-in number" screen. Same idea as PharmacyConsultation.ie's staff PIN
 * gate, but full-screen with a big keypad so it works one-handed on a phone.
 */
export function PinPad() {
  const { pharmacy, setStaff } = useStaff();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  async function submit(value = pin) {
    if (value.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api('/api/staff/unlock', { method: 'POST', json: { pin: value } });
      setStaff(d.staff);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check PIN');
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setBusy(false);
    }
  }

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length >= 6 ? p : p + d));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function signOut() {
    await fetch('/api/staff/lock', { method: 'POST' });
    await getSupabaseClient().auth.signOut().catch(() => {});
    window.location.href = '/';
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-brand-dark to-brand-deep px-6 text-white">
      <div className="flex flex-col items-center">
        <LogoMark size={44} />
        <p className="mt-3 text-sm text-white/70">{pharmacy?.name}</p>
        <h1 className="mt-1 text-2xl font-bold">Enter your PIN</h1>
        <p className="mt-1 text-center text-sm text-white/60">Every register entry is signed with your name and PSI number.</p>
      </div>

      <div className={`my-8 flex gap-3 ${shake ? 'animate-[shake_.4s]' : ''}`} style={shake ? { animation: 'shake .4s' } : undefined} aria-live="polite">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-white/70 transition ${i < pin.length ? 'bg-white scale-110' : ''}`} />
        ))}
      </div>
      <p className="h-5 text-sm text-red-200">{error}</p>

      <div className="mt-4 grid w-full max-w-xs grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-white/10 text-2xl font-semibold backdrop-blur transition active:scale-95 active:bg-white/25 hover:bg-white/15">
            {d}
          </button>
        ))}
        <button onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-16 items-center justify-center rounded-2xl text-white/80 active:scale-95" aria-label="Delete">
          <Delete className="h-6 w-6" />
        </button>
        <button onClick={() => press('0')} className="h-16 rounded-2xl bg-white/10 text-2xl font-semibold active:scale-95 active:bg-white/25 hover:bg-white/15">0</button>
        <button onClick={() => submit()} disabled={pin.length < 4 || busy} className="h-16 rounded-2xl bg-brand text-lg font-semibold text-white transition disabled:opacity-40 active:scale-95">
          {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : 'OK'}
        </button>
      </div>

      <button onClick={signOut} className="mt-10 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
        <LogOut className="h-4 w-4" /> Sign out of pharmacy
      </button>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}
