'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ScanLine, Search, History, Users, Lock, Flame, CreditCard, Inbox, Plug, BookUser, Settings, UserRound, ListOrdered, Menu, BellRing, StickyNote, MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NewEntryButton } from './new-entry';
import { Modal } from '@/components/modal';
import { TrainingBar, TrainingButton, useTraining } from './training';
import { BillingBanner } from './billing-banner';
import { Logo, LogoMark } from '@/components/logo';
import { ROLE_LABELS, can } from '@/lib/roles';
import { useStaff } from './staff-context';
import { PinPad } from './pin-pad';
import { FirstRun } from './first-run';

const NAV = [
  { href: '/dashboard', label: 'Registers', icon: BookOpen, show: () => true },
  { href: '/dashboard/scan?type=prescription', label: 'Scan Rx', icon: ScanLine, show: can.scan, primary: true },
  { href: '/dashboard/inbox', label: 'To confirm', icon: Inbox, show: can.record, badge: 'inbox', halo: true },
  { href: '/dashboard/search', label: 'Search', icon: Search, show: () => true },
  { href: '/dashboard/patients', label: 'Patients', icon: UserRound, show: can.record },
  { href: '/dashboard/reminders', label: 'Reminders', icon: BellRing, show: can.record, badge: 'reminders' },
  { href: '/dashboard/destructions', label: 'Destructions', icon: Flame, show: () => true },
  { href: '/dashboard/notes', label: 'Notes', icon: StickyNote, show: () => true },
  { href: '/dashboard/audit', label: 'Audit trail', icon: History, show: can.viewAudit },
  { href: '/dashboard/contacts', label: 'Doctors & suppliers', icon: BookUser, show: can.record },
  { href: '/dashboard/team', label: 'Team', icon: Users, show: can.manageStaff },
  { href: '/dashboard/integrations', label: 'Halo connection', icon: Plug, show: can.manageStaff, halo: true },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard, show: can.manageStaff },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, show: can.manageStaff },
  { href: '/dashboard/feedback', label: 'Feedback & ideas', icon: MessageSquarePlus, show: () => true },
  { href: '/dashboard/waitlist', label: 'Waitlist', icon: ListOrdered, show: () => true, admin: true },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { loading, staff, locked, hasPins, pharmacy, lock, inboxCount, remindersDue, refresh } = useStaff();
  const badgeOf = (n: any) => (n.badge === 'inbox' ? inboxCount : n.badge === 'reminders' ? remindersDue : 0);
  const training = useTraining();
  const path = usePathname();
  const [hidden, setHidden] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem('cdreg-sidebar') === 'hidden'); } catch {} }, []);
  const toggle = () => setHidden((h) => { try { localStorage.setItem('cdreg-sidebar', h ? 'shown' : 'hidden'); } catch {} return !h; });

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!hasPins) return <FirstRun />;
  if (locked || !staff) return <PinPad />;

  const items = NAV.filter((n) => n.show(staff.role) && (!(n as any).halo || pharmacy?.halo_enabled) && (!(n as any).admin || pharmacy?.is_site_admin));
  const active = (href: string) => { const h = href.split('?')[0]; return h === '/dashboard' ? path === h || path.startsWith('/dashboard/register') : path.startsWith(h); };

  return (
    <div className={`min-h-screen pb-24 transition-[padding] duration-200 lg:pb-0 ${hidden ? 'lg:pl-16' : 'lg:pl-64'} ${training ? 'pt-9' : ''}`}>
      <TrainingBar />
      {/* Desktop sidebar: full, or collapsed to an icon rail (remembered on this device) */}
      <aside className={`no-print fixed bottom-0 left-0 ${training ? 'top-9' : 'top-0'} hidden flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex ${hidden ? 'w-16' : 'w-64'}`}>
        {hidden ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Link href="/dashboard" aria-label="Registers"><LogoMark className="h-8 w-8" /></Link>
            <button onClick={toggle} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Expand sidebar" title="Expand sidebar"><PanelLeftOpen className="h-5 w-5" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-5 py-5">
            <Logo size="sm" />
            <button onClick={toggle} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Collapse sidebar" title="Collapse sidebar"><PanelLeftClose className="h-5 w-5" /></button>
          </div>
        )}
        <nav className={`flex-1 space-y-1 overflow-y-auto ${hidden ? 'px-2' : 'px-3'}`}>
          {items.map((n) => (
            <Link key={n.href} href={n.href} title={hidden ? n.label : undefined} aria-label={n.label}
              className={`relative flex items-center rounded-lg py-2.5 text-sm font-medium transition ${hidden ? 'justify-center px-0' : 'gap-3 px-3'} ${active(n.href) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <n.icon className="h-5 w-5 flex-shrink-0" /> {!hidden && n.label}
              {badgeOf(n) > 0 && (hidden
                ? <span className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${n.badge === 'reminders' ? 'bg-amber-500' : 'bg-brand'}`} />
                : <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white ${n.badge === 'reminders' ? 'bg-amber-500' : 'bg-brand'}`}>{badgeOf(n)}</span>)}
            </Link>
          ))}
        </nav>
        {hidden ? (
          <div className="flex flex-col items-center gap-2 border-t border-border py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground" title={`${staff.full_name} · ${ROLE_LABELS[staff.role]}`}>{staff.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
            <button onClick={lock} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Lock / switch user" aria-label="Lock / switch user"><Lock className="h-5 w-5" /></button>
            <TrainingButton pharmacy={pharmacy} onStarted={refresh} compact className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        ) : <div className="border-t border-border p-4">
          <p className="text-xs text-muted-foreground">{pharmacy?.name}</p>
          <p className="mt-2 text-sm font-semibold">{staff.full_name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[staff.role]}{staff.psi_number ? ` · PSI ${staff.psi_number}` : ''}</p>
          <button onClick={lock} className="btn-secondary mt-3 w-full text-sm"><Lock className="h-4 w-4" /> Lock / switch user</button>
          <TrainingButton pharmacy={pharmacy} onStarted={refresh} className="btn-ghost mt-1 w-full text-sm" />
        </div>}
      </aside>

      {/* Mobile top bar */}
      <header className={`no-print sticky ${training ? 'top-9' : 'top-0'} z-30 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur lg:hidden`}>
        <Logo size="sm" tagline={false} />
        <button onClick={lock} className="flex items-center gap-2 rounded-full bg-secondary py-1.5 pl-3 pr-2 text-sm font-medium text-secondary-foreground">
          {staff.full_name.split(' ')[0]} <Lock className="h-4 w-4" />
        </button>
      </header>

      <main key={training ? 'training' : 'live'} className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-6">
        {/* Top-left: show sidebar + New entry */}
        {!path.startsWith('/dashboard/scan') && !path.startsWith('/dashboard/register/') && <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          {can.scan(staff.role) && <Link href="/dashboard/scan?type=prescription" className="btn-brand"><ScanLine className="h-4 w-4" /> Scan Rx</Link>}
          {can.record(staff.role) && <NewEntryButton />}
        </div>}
        <BillingBanner />
        {remindersDue > 0 && can.record(staff.role) && !path.startsWith('/dashboard/reminders') && (
          <Link href="/dashboard/reminders" className="no-print mb-4 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <BellRing className="h-5 w-5 flex-shrink-0" /> <span className="flex-1"><b>{remindersDue} dispensing reminder{remindersDue === 1 ? '' : 's'} due</b> — record {remindersDue === 1 ? 'it' : 'them'} in the registers in one click</span><span className="font-semibold underline">Open</span>
          </Link>
        )}
        {children}
      </main>

      {/* Mobile bottom nav: 4 main items + raised Scan Rx, everything else under More */}
      {(() => {
        const main = items.filter((n) => ['/dashboard', '/dashboard/scan', '/dashboard/inbox', '/dashboard/search', '/dashboard/patients'].includes(n.href.split('?')[0]));
        const bar = [...main.slice(0, 4)];
        const rest = items.filter((n) => !bar.includes(n));
        const cols = bar.length + (rest.length ? 1 : 0);
        return (
          <>
            <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {bar.map((n) =>
                n.primary ? (
                  <Link key={n.href} href={n.href} className="flex min-w-0 flex-col items-center justify-end pb-2 text-xs font-medium">
                    <span className="-mt-6 mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-4 ring-background"><n.icon className="h-7 w-7" /></span>
                    <span className="truncate">{n.label}</span>
                  </Link>
                ) : (
                  <Link key={n.href} href={n.href} className={`relative flex min-w-0 flex-col items-center gap-1 py-2.5 text-xs font-medium ${active(n.href) ? 'text-primary' : 'text-muted-foreground'}`}>
                    <n.icon className="h-5 w-5" /> <span className="max-w-full truncate px-1">{n.label}</span>
                    {badgeOf(n) > 0 && <span className="absolute right-[22%] top-1.5 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{badgeOf(n)}</span>}
                  </Link>
                ),
              )}
              {rest.length > 0 && (
                <button onClick={() => setMore(true)} className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-xs font-medium ${rest.some((n) => active(n.href)) ? 'text-primary' : 'text-muted-foreground'}`}>
                  <Menu className="h-5 w-5" /> More
                </button>
              )}
            </nav>
            <Modal open={more} onClose={() => setMore(false)} title="Menu">
              <div className="grid grid-cols-2 gap-2">
                {rest.map((n) => (
                  <Link key={n.href} href={n.href} onClick={() => setMore(false)} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium ${active(n.href) ? 'border-brand bg-brand/10' : 'border-border'}`}>
                    <n.icon className="h-5 w-5 flex-shrink-0 text-brand" /> <span className="truncate">{n.label}</span>
                    {badgeOf(n) > 0 && <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{badgeOf(n)}</span>}
                  </Link>
                ))}
              </div>
              <button onClick={() => { setMore(false); lock(); }} className="btn-secondary mt-3 w-full"><Lock className="h-4 w-4" /> Lock / switch user</button>
              <TrainingButton pharmacy={pharmacy} onStarted={() => { setMore(false); refresh(); }} className="btn-ghost mt-1 w-full" />
            </Modal>
          </>
        );
      })()}
    </div>
  );
}
