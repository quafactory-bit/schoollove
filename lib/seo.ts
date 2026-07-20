import type { Metadata } from "next";
import type { School } from "@/types/school";
const SITE_NAME = "스쿨러브아이";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.schoollove.kr";
const DESC = "학교 동창들의 인스타그램을 한눈에 찾아보세요. 전국 초중고 대학교 동창 인스타 모음.";
export function getBaseMetadata(): Metadata {
  return {
    title: { default: SITE_NAME + " - 학교 인스타 동창 찾기", template: "%s | " + SITE_NAME },
    description: DESC,
    metadataBase: new URL(SITE_URL),
    openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR" },
    twitter: { card: "summary" },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  };
}
// PHASE 8 — School/Year/Class URL 경로를 이 세 함수로만 만든다. app/sitemap.ts(정확히는
// lib/policy/seoIndexing.ts)도 이 함수들을 그대로 재사용해, sitemap URL과 canonical URL이
// 문자열 조합 로직이 두 곳에 따로 존재해 드리프트할 가능성 자체를 구조적으로 없앤다.
export function buildSchoolPath(slug: string): string {
  return "/school/" + slug;
}
export function buildYearPath(slug: string, year: number): string {
  return buildSchoolPath(slug) + "/" + year;
}
export function buildClassPath(slug: string, year: number, grade: number, classNum: number): string {
  return buildYearPath(slug, year) + "/" + grade + "-" + classNum;
}

export function getSchoolPageMetadata(school: School): Metadata {
  const title = school.school_name + " 인스타 모음";
  const description = school.sido + " " + school.sigungu + " " + school.school_name + " 동창들의 인스타그램 계정을 찾아보세요.";
  const url = SITE_URL + buildSchoolPath(school.slug);
  return { title, description, alternates: { canonical: url }, openGraph: { title: title + " | " + SITE_NAME, description, url, type: "website" } };
}
export function getYearPageMetadata(school: School, year: number): Metadata {
  const title = school.school_name + " " + year + "년 졸업 인스타 모음";
  const description = school.school_name + " " + year + "년 졸업(예정) 동창들의 인스타그램을 확인하세요.";
  const url = SITE_URL + buildYearPath(school.slug, year);
  return { title, description, alternates: { canonical: url }, openGraph: { title: title + " | " + SITE_NAME, description, url, type: "website" } };
}
export function getClassPageMetadata(school: School, year: number, grade: number, classNum: number): Metadata {
  const title = school.school_name + " " + year + "년 " + grade + "학년 " + classNum + "반 인스타 모음";
  const description = school.school_name + " " + year + "년 " + grade + "학년 " + classNum + "반 동창들의 인스타그램을 확인하세요.";
  const url = SITE_URL + buildClassPath(school.slug, year, grade, classNum);
  return { title, description, alternates: { canonical: url }, openGraph: { title: title + " | " + SITE_NAME, description, url, type: "website" } };
}
