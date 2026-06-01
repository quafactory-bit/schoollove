import { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://schoollove.kr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: SITE_URL + "/search", lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: SITE_URL + "/submit", lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  // 프로필(미숨김)이 있는 데이터를 먼저 모두 가져와서,
  // 학교/년도/반 페이지를 "데이터가 실제로 있는 것만" 생성한다.
  const { data: profileData } = await supabaseServer
    .from("profiles")
    .select("graduation_year, grade, class_number, school:schools(slug)")
    .eq("is_hidden", false);

  // 학교별 프로필 수 집계 → 일정 수 이상인 학교만 sitemap 포함
  // (빈 학교 1만 개를 그대로 노출하면 thin content 위험)
  const SCHOOL_THRESHOLD = 1; // 1명 이상 있는 학교만 (페이지 noindex 기준 3명과 별개)
  const schoolCount = new Map<string, number>();
  for (const row of profileData ?? []) {
    const slug = (row.school as any)?.slug;
    if (!slug) continue;
    schoolCount.set(slug, (schoolCount.get(slug) ?? 0) + 1);
  }

  const schoolPages: MetadataRoute.Sitemap = [];
  for (const [slug, cnt] of schoolCount) {
    if (cnt < SCHOOL_THRESHOLD) continue;
    schoolPages.push({
      url: SITE_URL + "/school/" + slug,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    });
  }

  // 년도 페이지 (데이터 있는 조합만)
  const yearSet = new Set<string>();
  const yearPages: MetadataRoute.Sitemap = [];
  for (const row of profileData ?? []) {
    const slug = (row.school as any)?.slug;
    if (!slug) continue;
    const key = slug + "/" + row.graduation_year;
    if (yearSet.has(key)) continue;
    yearSet.add(key);
    yearPages.push({
      url: SITE_URL + "/school/" + key,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // 반 페이지 (데이터 있는 조합만)
  const classSet = new Set<string>();
  const classPages: MetadataRoute.Sitemap = [];
  for (const row of profileData ?? []) {
    const slug = (row.school as any)?.slug;
    if (!slug || !row.grade || !row.class_number) continue;
    const key = slug + "/" + row.graduation_year + "/" + row.grade + "-" + row.class_number;
    if (classSet.has(key)) continue;
    classSet.add(key);
    classPages.push({
      url: SITE_URL + "/school/" + key,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return [...staticPages, ...schoolPages, ...yearPages, ...classPages];
}
