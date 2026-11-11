import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DemoRibbon } from '@/components/demo-provider';

export const metadata: Metadata = {
  title: 'PharmacyCDReg.ie — Electronic Controlled Drug Register',
  description: 'Electronic Controlled Drug Register for Irish community pharmacies.',
  robots: { index: false, follow: false },
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
      </body>
    </html>
  );
}
