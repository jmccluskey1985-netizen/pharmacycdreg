import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = 'https://pharmacycdreg.ie';
  return [
    { url: site, changeFrequency: 'weekly', priority: 1 },
    { url: `${site}/security`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${site}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
