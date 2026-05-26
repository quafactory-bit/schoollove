import { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://schoollove.kr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: SITE_URL + "/search", lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: SITE_URL + "/submit", lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  const { data: schools } = await supabaseServer
    .from("schools")
    .select("slug, created_at")
    .order("school_name");

  const schoolPages: MetadataRoute.Sitemap = (schools ?? []).map((s) => ({
    url: SITE_URL + "/school/" + s.slug,
    lastModified: new Date(s.created_at),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  const { data: yearData } = await supabaseServer
    .from("profiles")
    .select("graduation_year, school:schools(slug)")
    .eq("is_hidden", false);

  const yearSet = new Set<string>();
  const yearPages: MetadataRoute.Sitemap = [];
  for (const row of yearData ?? []) {
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

  const { data: classData } = await supabaseServer
    .from("profiles")
    .select("graduation_year, grade, class_number, school:schools(slug)")
    .eq("is_hidden", false)
    .not("grade", "is", null)
    .not("class_number", "is", null);

  const classSet = new Set<string>();
  const classPages: MetadataRoute.Sitemap = [];
  for (const row of classData ?? []) {
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