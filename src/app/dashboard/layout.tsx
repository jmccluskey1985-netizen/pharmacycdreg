import type { Metadata } from 'next';
import { StaffProvider } from '@/components/dashboard/staff-context';
import { Shell } from '@/components/dashboard/shell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffProvider>
      <Shell>{children}</Shell>
    </StaffProvider>
  );
}
