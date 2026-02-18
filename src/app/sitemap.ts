import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://getmyschoollist.com/", priority: 1.0 },
    { url: "https://getmyschoollist.com/tool", priority: 0.9 },
    { url: "https://getmyschoollist.com/privacy", priority: 0.3 },
    { url: "https://getmyschoollist.com/terms", priority: 0.3 },
  ];
}
