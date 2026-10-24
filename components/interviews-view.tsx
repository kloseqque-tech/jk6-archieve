"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHero } from "./page-hero";
import { SearchIcon } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { Article } from "@/lib/types";

const types = [
  ["all", "All records"],
  ["interview", "Interviews"],
  ["news", "News"],
  ["original", "Original"],
  ["translation", "Translations"],
] as const;

export function InterviewsView() {
  const [items, setItems] = useState<Article[]>([]);
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (query.trim()) params.set("q", query.trim());
    const timer = window.setTimeout(() => {
      api<{ items: Article[] }>(`/api/articles?${params.toString()}`)
        .then((payload) => {
          setItems(payload.items);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, type]);

  return (
    <>
      <PageHero
        number="03"
        eyebrow="Interviews, news & translations"
        title="The reading room."
        description="Words with their source, language and context intact. Demo entries are marked and never presented as editorially verified quotations."
      />
      <section className="page-wrap py-10">
        <div className="grid items-end gap-5 border-b border-[#dcd2c3] pb-5 md:grid-cols-[1fr_360px]">
          <div className="flex flex-wrap gap-2">
            {types.map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setType(value)}
                className={`px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] ${
                  type === value ? "bg-[#394b60] text-[#fffdf8]" : "border border-[#dcd2c3] text-[#756e64]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#756e64]" width={15} height={15} />
            <input
              type="search"
              className="field !pl-9"
              placeholder="Search the reading room…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {error ? <div className="error-box mt-6">{error}</div> : null}
        <div className="divide-y divide-[#dcd2c3]">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton my-5 h-40" />)
            : items.map((article, index) => (
                <Link
                  href={`/interviews/${article.id}`}
                  key={article.id}
                  className="group grid gap-5 py-8 sm:grid-cols-[100px_1fr_auto] sm:items-start"
                >
                  <span className="serif text-6xl leading-none text-[#394b60]/18">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="source-badge">{article.type}</span>
                      <span className="source-badge">{article.originalLanguage}{article.translationLanguage ? ` → ${article.translationLanguage}` : ""}</span>
                      {article.isDemo ? <span className="source-badge demo">Demo record</span> : null}
                    </div>
                    <h2 className="serif mt-3 text-3xl leading-tight transition group-hover:text-[#394b60]">{article.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-[#756e64]">{article.dek}</p>
                    <p className="mt-4 text-[9px] font-bold uppercase tracking-[.13em] text-[#756e64]">
                      {formatDate(article.publishedAt)} · {article.sourceName || "Archive editorial"}
                    </p>
                  </div>
                  <span className="hidden border border-[#dcd2c3] px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] md:block">
                    Read record
                  </span>
                </Link>
              ))}
        </div>
        {!loading && !error && !items.length ? (
          <div className="paper-panel mt-8 p-12 text-center">
            <h2 className="serif text-3xl">No records in this folder.</h2>
            <p className="mt-2 text-sm text-[#756e64]">Try another type or a shorter search.</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
