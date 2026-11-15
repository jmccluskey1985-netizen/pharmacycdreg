import type { Metadata } from 'next';
import { StaffProvider } from '@/components/dashboard/staff-context';
import { Shell } from '@/components/dashboard/shell';
import { ThemeProvider } from '@/components/dashboard/theme';
import { THEME_BOOT } from '@/lib/theme';
import { headers } from 'next/headers';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <script nonce={(await headers()).get('x-nonce') ?? undefined} dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <StaffProvider>
        <Shell>{children}</Shell>
      </StaffProvider>
    </ThemeProvider>
  );
}
