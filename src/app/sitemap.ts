import type { MetadataRoute } from 'next';
import { GUIDES } from '@/lib/guides';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = 'https://pharmacycdreg.ie';
  return [
    { url: site, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/guides`, changeFrequency: 'weekly', priority: 0.8 },
    ...GUIDES.map((g) => ({ url: `${site}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${site}/security`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${site}/data-safety`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${site}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
