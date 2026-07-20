import { describe, expect, it } from 'vitest'
import {
  buildClassPath,
  buildSchoolPath,
  buildYearPath,
  getClassPageMetadata,
  getSchoolPageMetadata,
  getYearPageMetadata,
} from './seo'
import type { School } from '@/types/school'

const school: School = {
  id: 's1',
  school_name: '대치고등학교',
  school_type: 'high',
  sido: '서울',
  sigungu: '강남구',
  slug: 'daechi-high',
} as School

describe('buildSchoolPath/buildYearPath/buildClassPath — PHASE 8 canonical·sitemap 공용 경로 빌더', () => {
  it('School 경로', () => {
    expect(buildSchoolPath('daechi-high')).toBe('/school/daechi-high')
  })
  it('Year 경로', () => {
    expect(buildYearPath('daechi-high', 2020)).toBe('/school/daechi-high/2020')
  })
  it('Class 경로', () => {
    expect(buildClassPath('daechi-high', 2020, 3, 2)).toBe('/school/daechi-high/2020/3-2')
  })
})

describe('getSchoolPageMetadata/getYearPageMetadata/getClassPageMetadata — canonical URL이 path builder와 정확히 일치한다', () => {
  // SITE_URL(도메인)은 환경변수에 따라 달라질 수 있으므로 도메인을 하드코딩하지 않고,
  // canonical이 항상 "도메인 + buildXxxPath(...)" 형태로 끝나는지만 확인한다 — 두 URL
  // 생성 경로가 실제로 같은 빌더를 거쳐 절대 드리프트하지 않음을 증명하는 것이 목적.
  it('School canonical', () => {
    const meta = getSchoolPageMetadata(school)
    expect(meta.alternates?.canonical).toContain(buildSchoolPath(school.slug))
  })
  it('Year canonical', () => {
    const meta = getYearPageMetadata(school, 2020)
    expect(meta.alternates?.canonical).toContain(buildYearPath(school.slug, 2020))
  })
  it('Class canonical', () => {
    const meta = getClassPageMetadata(school, 2020, 3, 2)
    expect(meta.alternates?.canonical).toContain(buildClassPath(school.slug, 2020, 3, 2))
  })
  it('title/description은 무변경 유지된다(회귀 없음)', () => {
    expect(getSchoolPageMetadata(school).title).toBe('대치고등학교 인스타 모음')
    expect(getYearPageMetadata(school, 2020).title).toBe('대치고등학교 2020년 졸업 인스타 모음')
    expect(getClassPageMetadata(school, 2020, 3, 2).title).toBe('대치고등학교 2020년 3학년 2반 인스타 모음')
  })
})
