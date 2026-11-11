'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function ResetPassword() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await getSupabaseClient().auth.updateUser({ password: pw });
    if (error) return setMsg(error.message);
    router.push('/dashboard');
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      <form onSubmit={save} className="card w-full max-w-sm space-y-4">
        <h1 className="text-lg font-bold">Choose a new password</h1>
        <input className="input" type="password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <button className="btn-primary w-full">Save password</button>
      </form>
    </main>
  );
}
