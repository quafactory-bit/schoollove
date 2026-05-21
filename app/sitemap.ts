import type { MetadataRoute } from 'next'
import { getAllSchoolSlugs } from '@/lib/api/schools'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://schoollove.kr'
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/search`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ]

  // 학교 페이지들 (10,005개)
  const slugs = await getAllSchoolSlugs()
  const schoolPages: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${siteUrl}/school/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...schoolPages]
}
