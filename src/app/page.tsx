'use client';

import { Suspense, useEffect, useState } from 'react';
import { ShieldCheck, ScanLine, BookOpen, Search, Loader2, CheckCircle2, Lock, X, Plug } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PricingCard } from '@/components/pricing-card';
import { LoginCard } from '@/components/login-card';
import { DEMO } from '@/lib/demo/flag';

const FEATURES = [
  { icon: BookOpen, title: 'Looks like the register you know', text: 'One page per drug, same columns as the paper book — with the balance worked out for you.' },
  { icon: ScanLine, title: 'Snap the wholesaler invoice', text: 'Take a photo on your phone. CD lines and pack quantities are read for you to check and confirm.' },
  { icon: ShieldCheck, title: 'Nothing is ever overwritten', text: 'Corrections sit alongside the original with who, when and why — a full audit trail.' },
  { icon: Search, title: 'Inspection ready', text: 'Search by drug, date, supplier, patient or prescriber, then print or export in seconds.' },
];

const PREVIEWS = [
  { src: '/previews/register-book.webp', alt: 'A register page laid out like the paper Controlled Drugs Register, with a correction struck through and footnoted', title: 'The register, page by page', text: 'Same columns as the paper register: date, name and address, authority, amount obtained or supplied, running balance, pharmacist. Corrections are struck through and footnoted — never hidden.' },
  { src: '/previews/invoice-scan.webp', alt: 'Invoice scan result: 2 packs × 56 = 112 capsules matched to the oxycodone register', title: 'Invoices read for you', text: 'Photograph the wholesaler invoice. Controlled drug lines are picked out, packs × pack size worked out, matched to the right register — and Schedule 5 lines like Oramorph 10mg/5ml left out. You check and confirm each line.' },
];

function WaitlistForm() {
  const [f, setF] = useState({ name: '', pharmacy_name: '', email: '', phone: '', dispensing_system: '', consent_contact: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (DEMO) { setDone(true); return; }
      const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not join the waitlist');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the waitlist');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <CheckCircle2 className="mx-auto h-12 w-12 text-brand" />
        <h2 className="mt-3 text-xl font-bold">You&apos;re on the list</h2>
        <p className="mt-1 text-sm text-muted-foreground">We&apos;ll be in touch before launch with your first month free and the €19 launch price.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-md space-y-3.5 p-6 sm:p-8">
      <div>
        <p className="inline-flex rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">Launching soon</p>
        <h2 className="mt-2 text-xl font-bold">Join the waitlist</h2>
        <p className="mt-1 text-sm text-muted-foreground">Be first in. Waitlist pharmacies get the first month free and lock in the €19 launch price.</p>
      </div>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div><label className="label" htmlFor="wl-name">Your name</label><input id="wl-name" className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></div>
        <div><label className="label" htmlFor="wl-ph">Phone <span className="font-normal text-muted-foreground">(optional)</span></label><input id="wl-ph" className="input" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></div>
      </div>
      <div><label className="label" htmlFor="wl-pharm">Pharmacy</label><input id="wl-pharm" className="input" required value={f.pharmacy_name} onChange={set('pharmacy_name')} placeholder="Name and town" /></div>
      <div><label className="label" htmlFor="wl-email">Email</label><input id="wl-email" className="input" required type="email" inputMode="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
      <div><label className="label" htmlFor="wl-pmr">Dispensing system <span className="font-normal text-muted-foreground">(optional)</span></label><input id="wl-pmr" className="input" value={f.dispensing_system} onChange={set('dispensing_system')} placeholder="e.g. McLernons, Touchstore" /></div>
      {/* honeypot */}
      <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={set('website')} />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" required className="mt-0.5 h-4 w-4" checked={f.consent_contact} onChange={(e) => setF({ ...f, consent_contact: e.target.checked })} />
        <span>I&apos;m happy to be contacted about PharmacyCDReg.ie. You can ask us to remove your details at any time.</span>
      </label>
      <button className="btn-brand w-full text-base" disabled={busy}>{busy && <Loader2 className="h-5 w-5 animate-spin" />} Join the waitlist</button>
    </form>
  );
}

/** Small "Pharmacy access" link → code box → reveals the sign-in card. */
function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (DEMO) { onUnlock(); return; }
      const res = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const d = await res.json().catch(() => ({}));
      if (d.ok) onUnlock();
      else setError(d.error || 'Code not recognised');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
        <Lock className="h-4 w-4" /> Pharmacy access
      </button>
    );
  }
  return (
    <form onSubmit={check} className="flex items-center gap-2">
      <input
        className="input w-28 py-1.5 text-center font-mono tracking-widest"
        type="password"
        inputMode="numeric"
        placeholder="Code"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
        aria-label="Access code"
      />
      <button className="btn-primary px-3 py-1.5 text-sm" disabled={busy || !code}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}</button>
      <button type="button" onClick={() => { setOpen(false); setCode(''); setError(null); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}

export default function LandingPage() {
  const [unlocked, setUnlocked] = useState(false);

  // Stay unlocked on this device after a correct code (and when sent back here from the dashboard).
  useEffect(() => {
    try {
      if (localStorage.getItem('cdreg-access') === '1' || new URLSearchParams(window.location.search).get('next')) setUnlocked(true);
    } catch {}
  }, []);
  const unlock = () => {
    setUnlocked(true);
    try { localStorage.setItem('cdreg-access', '1'); } catch {}
    setTimeout(() => document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/60 to-background">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo size="md" />
        {!unlocked && <AccessGate onUnlock={unlock} />}
      </header>

      <section className="mx-auto grid max-w-6xl items-start gap-8 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-10">
        <div className="order-1 flex flex-col items-center gap-6 lg:order-2 lg:items-end" id="signin">
          {unlocked ? (
            <Suspense fallback={<div className="card h-96 w-full max-w-md" />}>
              <LoginCard />
            </Suspense>
          ) : (
            <WaitlistForm />
          )}
        </div>

        <div className="order-2 lg:order-1">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-brand-dark dark:text-white sm:text-4xl">
            Your Controlled Drugs Register,<br className="hidden sm:block" /> on any device.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Record receipts, supplies and witnessed destructions of Schedule 2 controlled drugs, with running balances and a complete audit trail. Built around the IPU eCDR requirements for Irish community pharmacies.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-xl bg-card/70 p-4 ring-1 ring-border">
                <f.icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Previews */}
      <section className="border-t border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">A look inside</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-dark dark:text-white">Built for the dispensary counter</h2>
          <div className="mt-10 space-y-14">
            {PREVIEWS.map((p, i) => (
              <div key={p.src} className={`grid items-center gap-6 lg:gap-10 ${i % 2 ? 'lg:grid-cols-[1fr_1.6fr]' : 'lg:grid-cols-[1.6fr_1fr]'}`}>
                <figure className={`overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border ${i % 2 ? 'lg:order-2' : ''}`}>
                  <img src={p.src} alt={p.alt} loading="lazy" className="w-full" />
                </figure>
                <div className={i % 2 ? 'lg:order-1' : ''}>
                  <h3 className="text-2xl font-bold">{p.title}</h3>
                  <p className="mt-2 text-lg text-muted-foreground">{p.text}</p>
                </div>
              </div>
            ))}
            <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.6fr] lg:gap-10">
              <div>
                <h3 className="text-2xl font-bold">Works on your phone</h3>
                <p className="mt-2 text-lg text-muted-foreground">Check a balance or record an entry from anywhere in the pharmacy. Each person signs in with their own PIN.</p>
              </div>
              <figure className="mx-auto w-60 overflow-hidden rounded-[2.2rem] bg-black p-2 shadow-soft ring-1 ring-border sm:w-64">
                <img src="/previews/phone.webp" alt="PharmacyCDReg on a phone: registers with balances" loading="lazy" className="w-full rounded-[1.8rem]" />
              </figure>
            </div>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">Screens shown with sample data.</p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">Simple pricing</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-dark dark:text-white">One price. Everything included.</h2>
            <p className="mt-3 text-lg text-muted-foreground">No bundles, no modules you won&apos;t use — just your Controlled Drugs Register, done properly. Unlimited staff, registers and invoice scans.</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3"><BookOpen className="h-5 w-5 flex-shrink-0 text-brand" /> Bring forward balances from your paper book on day one.</li>
              <li className="flex gap-3"><Plug className="h-5 w-5 flex-shrink-0 text-brand" /> Works alongside your dispensing system.</li>
              <li className="flex gap-3"><ShieldCheck className="h-5 w-5 flex-shrink-0 text-brand" /> Cancel any time — your register stays readable and exportable.</li>
            </ul>
          </div>
          <PricingCard cta={false} />
        </div>
        <div className="pb-14 text-center">
          <a href="#signin" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-brand px-8 text-base">Join the waitlist</a>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        PharmacyCDReg.ie is an independent service. It is not affiliated with the PSI, the HSE or the IPU.
      </footer>
    </main>
  );
}
