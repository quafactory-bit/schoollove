import { supabase } from '@/lib/supabase'
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: schools } = await supabase.from('schools').select('slug, created_at')
  const schoolUrls = schools?.map(s => ({
    url: 'https://schoollove.kr/school/' + s.slug,
    lastModified: new Date(s.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  })) || []
  return [
    { url: 'https://schoollove.kr', lastModified: new Date(), changeFrequency: 'daily' as const, priority: 1 },
    { url: 'https://schoollove.kr/search', lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.9 },
    { url: 'https://schoollove.kr/submit', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.7 },
    ...schoolUrls,
  ]
}