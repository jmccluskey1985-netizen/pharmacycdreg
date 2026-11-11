'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ScanLine, Search, History, Users, Lock, Flame, CreditCard, Inbox, Plug } from 'lucide-react';
import { BillingBanner } from './billing-banner';
import { Logo } from '@/components/logo';
import { ROLE_LABELS, can } from '@/lib/roles';
import { useStaff } from './staff-context';
import { PinPad } from './pin-pad';
import { FirstRun } from './first-run';

const NAV = [
  { href: '/dashboard', label: 'Registers', icon: BookOpen, show: () => true },
  { href: '/dashboard/scan', label: 'Scan', icon: ScanLine, show: can.scan, primary: true },
  { href: '/dashboard/inbox', label: 'To confirm', icon: Inbox, show: can.record, badge: true },
  { href: '/dashboard/search', label: 'Search', icon: Search, show: () => true },
  { href: '/dashboard/destructions', label: 'Destructions', icon: Flame, show: () => true },
  { href: '/dashboard/audit', label: 'Audit trail', icon: History, show: can.viewAudit },
  { href: '/dashboard/team', label: 'Team', icon: Users, show: can.manageStaff },
  { href: '/dashboard/integrations', label: 'Halo connection', icon: Plug, show: can.manageStaff },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard, show: can.manageStaff },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { loading, staff, locked, hasPins, pharmacy, lock, inboxCount } = useStaff();
  const path = usePathname();

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!hasPins) return <FirstRun />;
  if (locked || !staff) return <PinPad />;

  const items = NAV.filter((n) => n.show(staff.role));
  const active = (href: string) => (href === '/dashboard' ? path === href || path.startsWith('/dashboard/register') : path.startsWith(href));

  return (
    <div className="min-h-screen pb-24 lg:pb-0 lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="px-5 py-5"><Logo size="sm" /></div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active(n.href) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <n.icon className="h-5 w-5" /> {n.label}
              {(n as any).badge && inboxCount > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{inboxCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <p className="text-xs text-muted-foreground">{pharmacy?.name}</p>
          <p className="mt-2 text-sm font-semibold">{staff.full_name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[staff.role]}{staff.psi_number ? ` · PSI ${staff.psi_number}` : ''}</p>
          <button onClick={lock} className="btn-secondary mt-3 w-full text-sm"><Lock className="h-4 w-4" /> Lock / switch user</button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo size="sm" tagline={false} />
        <button onClick={lock} className="flex items-center gap-2 rounded-full bg-secondary py-1.5 pl-3 pr-2 text-sm font-medium text-secondary-foreground">
          {staff.full_name.split(' ')[0]} <Lock className="h-4 w-4" />
        </button>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-8">
        <BillingBanner />
        {children}
      </main>

      {/* Mobile bottom nav with a raised Scan button */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` }}>
        {items.slice(0, 5).map((n) =>
          n.primary ? (
            <Link key={n.href} href={n.href} className="flex flex-col items-center justify-end pb-2 text-xs font-medium">
              <span className="-mt-6 mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-4 ring-background"><n.icon className="h-7 w-7" /></span>
              {n.label}
            </Link>
          ) : (
            <Link key={n.href} href={n.href} className={`relative flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${active(n.href) ? 'text-primary' : 'text-muted-foreground'}`}>
              <n.icon className="h-5 w-5" /> {n.label}
              {(n as any).badge && inboxCount > 0 && <span className="absolute right-[22%] top-1.5 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{inboxCount}</span>}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
