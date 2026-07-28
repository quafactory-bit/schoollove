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

describe('safe School/Year/Class paths and metadata', () => {
  it('keeps the existing route hierarchy', () => {
    expect(buildSchoolPath('daechi-high')).toBe('/school/daechi-high')
    expect(buildYearPath('daechi-high', 2020)).toBe('/school/daechi-high/2020')
    expect(buildClassPath('daechi-high', 2020, 3, 2)).toBe('/school/daechi-high/2020/3-2')
  })

  it('keeps School basic information indexable without personal discovery copy', () => {
    const metadata = getSchoolPageMetadata(school)
    expect(metadata.title).toBe('대치고등학교 학교 정보')
    expect(metadata.description).not.toMatch(/Instagram|인스타|동창/)
    expect(metadata.alternates?.canonical).toContain(buildSchoolPath(school.slug))
  })

  it('marks Year and Class destinations private and noarchive', () => {
    for (const metadata of [getYearPageMetadata(school, 2020), getClassPageMetadata(school, 2020, 3, 2)]) {
      expect(metadata.title).toBe('대치고등학교 개인 명단 비공개 안내')
      expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true })
    }
  })
})
