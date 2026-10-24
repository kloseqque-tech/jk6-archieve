import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const paths = ["", "/profile", "/photos", "/videos", "/interviews", "/matches", "/community", "/search"];
  return paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" || path === "/community" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
