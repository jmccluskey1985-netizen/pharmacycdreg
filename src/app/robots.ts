import type { MetadataRoute } from 'next';

// Public pages may be indexed; the app, inspector links, sign-up and APIs never.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/security', '/privacy', '/terms'], disallow: ['/dashboard', '/inspect', '/api', '/start', '/reset-password', '/auth'] }],
    sitemap: 'https://pharmacycdreg.ie/sitemap.xml',
    host: 'https://pharmacycdreg.ie',
  };
}
