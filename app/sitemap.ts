import type { MetadataRoute } from 'next'
import { getAllSchoolSlugs } from '@/lib/api/schools'
import { buildSchoolPath } from '@/lib/seo'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.schoollove.kr'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  let slugs: string[] = []
  try {
    slugs = await getAllSchoolSlugs()
  } catch {
    // Keep the sitemap available without leaking database error details.
    slugs = []
  }
  const uniqueSlugs = [...new Set(slugs.filter(Boolean))]

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...uniqueSlugs.map((slug) => ({
      url: SITE_URL + buildSchoolPath(slug),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
