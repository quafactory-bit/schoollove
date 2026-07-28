import type { Metadata } from 'next'
import type { School } from '@/types/school'
import { PRIVATE_ROUTE_ROBOTS } from '@/lib/policy/privacySafety'

const SITE_NAME = '스쿨러브아이'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.schoollove.kr'
const DESC = '학교 기본 정보를 안전하게 검색하고 확인할 수 있는 스쿨러브아이입니다.'

export function getBaseMetadata(): Metadata {
  return {
    title: { default: `${SITE_NAME} - 학교 정보 찾기`, template: `%s | ${SITE_NAME}` },
    description: DESC,
    metadataBase: new URL(SITE_URL),
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'ko_KR' },
    twitter: { card: 'summary' },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export function buildSchoolPath(slug: string): string {
  return `/school/${slug}`
}

export function buildYearPath(slug: string, year: number): string {
  return `${buildSchoolPath(slug)}/${year}`
}

export function buildClassPath(slug: string, year: number, grade: number, classNum: number): string {
  return `${buildYearPath(slug, year)}/${grade}-${classNum}`
}

export function getSchoolPageMetadata(school: School): Metadata {
  const title = `${school.school_name} 학교 정보`
  const description = `${school.sido} ${school.sigungu} ${school.school_name}의 기본 정보를 확인하세요.`
  const url = SITE_URL + buildSchoolPath(school.slug)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, type: 'website' },
  }
}

export function getYearPageMetadata(school: School, year: number): Metadata {
  const title = `${school.school_name} 개인 명단 비공개 안내`
  const description = '졸업연도별 개인 명단은 개인정보 안전 전환에 따라 공개하지 않습니다.'
  const url = SITE_URL + buildYearPath(school.slug, year)

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: PRIVATE_ROUTE_ROBOTS,
  }
}

export function getClassPageMetadata(school: School, year: number, grade: number, classNum: number): Metadata {
  const title = `${school.school_name} 개인 명단 비공개 안내`
  const description = '학년·반별 개인 명단은 개인정보 안전 전환에 따라 공개하지 않습니다.'
  const url = SITE_URL + buildClassPath(school.slug, year, grade, classNum)

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: PRIVATE_ROUTE_ROBOTS,
  }
}
