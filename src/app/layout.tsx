import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DemoRibbon } from '@/components/demo-provider';
import { Analytics } from '@vercel/analytics/next';
import { ErrorListener } from '@/components/error-listener';

export const metadata: Metadata = {
  title: 'PharmacyCDReg.ie: Electronic Controlled Drug Register',
  description: 'Electronic Controlled Drug Register for Irish community pharmacies.',
  metadataBase: new URL('https://pharmacycdreg.ie'),
  // Public pages are indexable; the app and private routes set noindex (and robots.txt disallows them).
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'en_IE', siteName: 'PharmacyCDReg.ie', title: 'PharmacyCDReg.ie: your digital Controlled Drugs Register', description: 'Save time on CD record-keeping. Running balances, a tamper-evident audit trail and inspection-ready reports for Irish community pharmacies.', images: ['/previews/register-cover.webp'] },
  appleWebApp: { capable: true, title: 'CD Register', statusBarStyle: 'default' },
  // Tab icon: the green pin with the white cross (same mark as the logo).
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }, { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' }], apple: '/apple-touch-icon.png' },
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
