import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DemoRibbon } from '@/components/demo-provider';
import { Analytics } from '@vercel/analytics/next';
import { ErrorListener } from '@/components/error-listener';

export const metadata: Metadata = {
  title: 'PharmacyCDReg.ie — Electronic Controlled Drug Register',
  description: 'Electronic Controlled Drug Register for Irish community pharmacies.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'CD Register', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#184B21',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE">
      <body className="min-h-screen font-sans">
        <DemoRibbon />
        {children}
        <ErrorListener />
        {/* Cookie-free, anonymous page-view counts (Vercel Web Analytics); off in the demo build. */}
        {process.env.NEXT_PUBLIC_DEMO_MODE !== '1' && <Analytics />}
      </body>
    </html>
  );
}
