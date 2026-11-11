import { StaffProvider } from '@/components/dashboard/staff-context';
import { Shell } from '@/components/dashboard/shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffProvider>
      <Shell>{children}</Shell>
    </StaffProvider>
  );
}
