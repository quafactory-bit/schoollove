import { NextResponse } from 'next/server'
import { getSchoolBySlug } from '@/lib/api/schools'
import { validSchoolSlug } from '@/lib/policy/schoolJourney'

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')
  if (!validSchoolSlug(slug)) return NextResponse.json({ school: null }, { status: 400 })
  try {
    const school = await getSchoolBySlug(slug)
    // Explicit public fields only. No ownership, profile, growth or membership.
    return NextResponse.json({ school: school ? {
      id: school.id, slug: school.slug, school_name: school.school_name,
      school_type: school.school_type, sido: school.sido, sigungu: school.sigungu,
    } : null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ school: null }, { status: 503 }) }
}
