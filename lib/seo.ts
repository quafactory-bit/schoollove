import type { Metadata } from 'next'
import type { School } from '@/types/school'

const SITE_NAME = '스쿨러브아이'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://schoollove.kr'
const DEFAULT_DESCRIPTION = '전국 초·중·고·대학교 동창들의 인스타그램을 학교별로 찾아보세요.'

export function getBaseMetadata(): Metadata {
  return {
    title: {
      default: `${SITE_NAME} — 우리 학교 동창 인스타 찾기`,
      template: `%s | ${SITE_NAME}`,
    },
    description: DEFAULT_DESCRIPTION,
    metadataBase: new URL(SITE_URL),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  }
}

export function getSchoolPageMetadata(school: School): Metadata {
  const title = `${school.school_name} 인스타 모음`
  const description = `${school.sido} ${school.sigungu} ${school.school_name} 동창들의 인스타그램 계정을 찾아보세요.`
  const url = `${SITE_URL}/school/${school.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
  }
}

export function getYearPageMetadata(school: School, year: number): Metadata {
  const title = `${school.school_name} ${year}년 졸업 인스타 모음`
  const description = `${school.school_name} ${year}년 졸업(예정) 동창들의 인스타그램을 확인하세요.`
  const url = `${SITE_URL}/school/${school.slug}/${year}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, type: 'website' },
  }
}

export function getClassPageMetadata(
  school: School,
  year: number,
  grade: number,
  classNum: number
): Metadata {
  const title = `${school.school_name} ${year}년 ${grade}학년 ${classNum}반 인스타 모음`
  const description = `${school.school_name} ${year}년 ${grade}학년 ${classNum}반 동창들의 인스타그램을 확인하세요.`
  const url = `${SITE_URL}/school/${school.slug}/${year}/${grade}-${classNum}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, type: 'website' },
  }
}
