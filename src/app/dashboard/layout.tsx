import type { Metadata } from 'next';
import { StaffProvider } from '@/components/dashboard/staff-context';
import { Shell } from '@/components/dashboard/shell';
import { ThemeProvider } from '@/components/dashboard/theme';
import { THEME_BOOT } from '@/lib/theme';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <StaffProvider>
        <Shell>{children}</Shell>
      </StaffProvider>
    </ThemeProvider>
  );
}
