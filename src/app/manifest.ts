import type { MetadataRoute } from 'next';

// "Add to Home Screen": opens like an app on the dispensary phone or tablet.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PharmacyCDReg.ie — Controlled Drug Register',
    short_name: 'CD Register',
    description: 'Electronic Controlled Drug Register for Irish community pharmacies.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#F4F7F3',
    theme_color: '#184B21',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
