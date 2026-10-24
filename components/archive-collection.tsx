"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./auth-provider";
import { MediaCard } from "./media-card";
import { PageHero } from "./page-hero";
import { UploadDialog } from "./upload-dialog";
import { SearchIcon, UploadIcon } from "./icons";
import { api } from "@/lib/client";
import type { MediaItem } from "@/lib/types";

export function ArchiveCollection({ fixedKind }: { fixedKind?: "image" | "video" }) {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [mine, setMine] = useState(searchParams?.get("mine") === "1");
  const [uploadOpen, setUploadOpen] = useState(searchParams?.get("upload") === "1");

  const categories = useMemo(
    () => ["All", ...new Set(items.map((item) => item.category))],
    [items],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (fixedKind) params.set("kind", fixedKind);
      if (query.trim()) params.set("q", query.trim());
      if (category !== "All") params.set("category", category);
      if (mine) params.set("mine", "1");
      const payload = await api<{ items: MediaItem[] }>(`/api/media?${params.toString()}`);
      setItems(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法载入媒体档案。");
    } finally {
      setLoading(false);
    }
  }, [category, fixedKind, mine, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const hero =
    fixedKind === "video"
      ? {
          number: "04",
          eyebrow: "Film & moving image",
          title: "Watch the game again.",
          description:
            "Uploaded video files and verified external film records live here. Pending files remain private until an editor approves them.",
        }
      : fixedKind === "image"
        ? {
            number: "05",
            eyebrow: "Photographic collection",
            title: "A record in light.",
            description:
              "Photographs from the archive and its contributors, filed by category, source and review status. Uploads are private until approved.",
          }
        : {
            number: "01",
            eyebrow: "The collection",
            title: "Every record has a source.",
            description: "Photographs, moving images and community contributions in one searchable archive.",
          };

  return (
    <>
      <PageHero {...hero}>
        <button type="button" className="button-primary" onClick={() => setUploadOpen(true)}>
          <UploadIcon width={15} height={15} /> Upload {fixedKind === "video" ? "video" : "media"}
        </button>
      </PageHero>
      <section className="page-wrap py-9 md:py-12">
        <div className="paper-panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#756e64]" width={15} height={15} />
            <input
              type="search"
              className="field !pl-9"
              placeholder="Search title, description or tag…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search media"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((value) => (
              <button
                type="button"
                key={value}
                className={`px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] ${
                  category === value ? "bg-[#394b60] text-[#fffdf8]" : "border border-[#dcd2c3] text-[#756e64]"
                }`}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
            {user ? (
              <label className="ml-1 flex items-center gap-2 text-[10px] font-semibold text-[#756e64]">
                <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />
                My uploads
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-b border-[#dcd2c3] pb-3">
          <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#756e64]">
            {loading ? "Reading the archive…" : `${items.length} record${items.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-[9px] text-[#756e64]">Demo artwork and uploaded files are labelled separately.</p>
        </div>
        {error ? <div className="error-box mt-6">{error}</div> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="paper-panel mt-8 grid place-items-center px-6 py-20 text-center">
            <span className="serif text-7xl text-[#394b60]/20">06</span>
            <h2 className="serif mt-3 text-3xl">
              {mine ? "No uploads in this drawer yet." : "This drawer is waiting for its first record."}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-7 text-[#756e64]">
              {mine
                ? "Files you upload appear here immediately with their review status."
                : "Contribute the first verified photograph or video. Every submission is reviewed before publication."}
            </p>
            <button type="button" className="button-primary mt-6" onClick={() => setUploadOpen(true)}>
              <UploadIcon width={15} height={15} /> Add a record
            </button>
          </div>
        ) : (
          <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="skeleton aspect-[4/5] border border-[#dcd2c3]" />
                ))
              : items.map((item, index) => (
                  <div key={item.id}>
                    <MediaCard item={item} index={index + 1} />
                    {mine && item.status !== "approved" ? (
                      <div className="border border-t-0 border-[#dcd2c3] bg-[#f7f3ea] px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#756e64]">
                        Review status: <span className={item.status === "rejected" ? "text-[#843f45]" : "text-[#394b60]"}>{item.status}</span>
                        {item.reviewNote ? ` · ${item.reviewNote}` : ""}
                      </div>
                    ) : null}
                  </div>
                ))}
          </div>
        )}
      </section>
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialKind={fixedKind || "image"}
        onUploaded={() => void load()}
      />
    </>
  );
}
