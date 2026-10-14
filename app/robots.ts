import { MetadataRoute } from "next";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.schoollove.kr";
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === 'preview') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/"],
      },
    ],
    sitemap: SITE_URL + "/sitemap.xml",
  };
}
