import { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";
import { buildIndexableSitemapEntries, type SitemapProfileRow } from "@/lib/policy/seoIndexing";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.schoollove.kr";

// PHASE 8 COMPLETION PATCH — SITEMAP FRESHNESS
// next.config.ts에 experimental.cacheComponents가 켜져 있지 않은 일반 App Router
// 구조이므로, 이 특수 파일이 지원하는 공식 route segment config인 `dynamic =
// 'force-dynamic'`으로 빌드 시점 캐시를 끈다. 이게 없으면 `/sitemap.xml`이 빌드 시점의
// profile 스냅샷으로 정적 생성(prerender)돼, 배포 이후의 등록/hidden(신고 3회 자동 hidden
// DB trigger 포함, 애플리케이션이 그 시점을 항상 알 수 없음)/삭제로 count가 3명 경계를
// 넘나들어도 다음 배포 전까지 sitemap이 과거 상태를 그대로 반환한다 — PHASE 8이 고친
// noindex/sitemap 불일치가 시간이 지나면 다시 발생하는 근본 원인이었다.
export const dynamic = 'force-dynamic'

// PHASE 8 — School/Year/Class 여부 판단은 lib/policy/seoIndexing.ts의 단일 정책 함수만
// 쓴다(이전에는 School만 SCHOOL_THRESHOLD=1을, Year/Class는 임계값 자체 없이 무조건
// 포함해 noindex 페이지가 sitemap에 실리는 P1이 있었다). 우선순위/갱신주기는 sitemap
// 고유의 표시 정책이라 이 파일에 그대로 둔다.
const PRIORITY_BY_KIND = { school: 0.9, year: 0.7, class: 0.8 } as const;
const CHANGE_FREQUENCY_BY_KIND = { school: "weekly", year: "weekly", class: "weekly" } as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // PHASE 8 — docs/design-package-v1.0/10-seo.md §6 "Sitemap은 index 가능한 School/Year/
  // Class URL만 포함한다"와 §10 "하지 않는 것: Search 결과 색인"에 따라 /search(현재
  // noindex 페이지)와 /submit을 더 이상 정적 페이지로 포함하지 않는다. 홈(SITE_URL)만
  // 예외로 유지한다 — 일반적인 사이트 루트 관례이며 School/Year/Class 발견 진입점 역할도
  // 겸하므로 canon의 "School/Year/Class만" 문구를 문자 그대로 적용해 제거하지 않았다(§20에
  // 판단 근거 기록).
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
  ];

  // 집계에 필요한 필드만 select한다 — 닉네임/Instagram ID 등 개인 식별자는 포함하지 않음.
  // is_hidden=false로 숨김 프로필은 애초에 count·sitemap 어디에도 반영되지 않는다.
  const { data: profileData, error } = await supabaseServer
    .from("profiles")
    .select("graduation_year, grade, class_number, created_at, school:schools(slug)")
    .eq("is_hidden", false);

  if (error) {
    // DB 오류 시에도 sitemap 자체는 500으로 깨지지 않고 정적 페이지만 담아 반환한다.
    console.error("sitemap profile fetch error:", error);
  }

  const rows: SitemapProfileRow[] = (profileData ?? []).map((row) => ({
    schoolSlug: (row.school as { slug?: string } | null)?.slug,
    graduationYear: row.graduation_year,
    grade: row.grade,
    classNumber: row.class_number,
    createdAt: row.created_at,
  }));

  const entries = buildIndexableSitemapEntries(rows);

  const dynamicPages: MetadataRoute.Sitemap = entries.map((entry) => ({
    url: SITE_URL + entry.path,
    lastModified: entry.lastModified,
    changeFrequency: CHANGE_FREQUENCY_BY_KIND[entry.kind],
    priority: PRIORITY_BY_KIND[entry.kind],
  }));

  return [...staticPages, ...dynamicPages];
}
