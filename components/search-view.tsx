"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PageHero } from "./page-hero";
import { SearchIcon } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { Article, Match, MediaItem, Post } from "@/lib/types";

type Results = { query: string; media: MediaItem[]; articles: Article[]; matches: Match[]; posts: Post[] };

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      api<Results>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((payload) => {
          setResults(payload);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const count = results ? results.media.length + results.articles.length + results.matches.length + results.posts.length : 0;

  return (
    <>
      <PageHero number="?" eyebrow="Unified index" title="Find the thread." description="Search photographs, videos, reading-room records, fixtures and community notes." />
      <section className="page-wrap py-10">
        <div className="relative mx-auto max-w-3xl">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#394b60]" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field h-16 !pl-12 text-lg"
            placeholder="Search the whole archive…"
            aria-label="Search the whole archive"
          />
        </div>
        {error ? <div className="error-box mx-auto mt-5 max-w-3xl">{error}</div> : null}
        {loading ? <p className="mt-8 text-center text-xs text-[#756e64]">Searching…</p> : null}
        {results ? (
          <div className="mt-10">
            <p className="border-b border-[#dcd2c3] pb-3 text-[9px] font-bold uppercase tracking-[.14em] text-[#756e64]">{count} records for “{results.query}”</p>
            <ResultSection title="Photographs & video" href="/photos" items={results.media.map((item) => ({ id: item.id, href: `/${item.kind === "video" ? "videos" : "photos"}/${item.id}`, meta: `${item.kind} · ${item.sourceType}`, title: item.title, text: item.description }))} />
            <ResultSection title="Reading room" href="/interviews" items={results.articles.map((item) => ({ id: item.id, href: `/interviews/${item.id}`, meta: item.type, title: item.title, text: item.dek }))} />
            <ResultSection title="Match register" href="/matches" items={results.matches.map((item) => ({ id: item.id, href: `/matches/${item.id}`, meta: item.competition, title: `${item.trackedTeam} vs ${item.opponent}`, text: `${formatDate(item.matchDate)} · ${item.status}` }))} />
            <ResultSection title="Community notes" href="/community" items={results.posts.map((item) => ({ id: item.id, href: "/community", meta: `@${item.author.username}`, title: item.title, text: item.body }))} />
            {!count ? <div className="paper-panel mt-8 p-10 text-center"><h2 className="serif text-3xl">No matching records.</h2><p className="mt-2 text-sm text-[#756e64]">Try a player, opponent, season, category or phrase.</p></div> : null}
          </div>
        ) : !loading ? (
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {["midfield", "Champions League", "interview", "matchday"].map((term) => <button key={term} type="button" className="border border-[#dcd2c3] bg-[#fffdf8] p-4 text-xs hover:border-[#394b60]" onClick={(event) => { event.preventDefault(); setQuery(term); }}>{term}</button>)}
          </div>
        ) : null}
      </section>
    </>
  );
}

function ResultSection({ title, href, items }: { title: string; href: string; items: Array<{ id: string; href: string; meta: string; title: string; text: string }> }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between"><h2 className="serif text-3xl">{title}</h2><Link href={href} className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">Collection</Link></div>
      <div className="mt-3 divide-y divide-[#dcd2c3] border-y border-[#dcd2c3]">
        {items.map((item) => <Link key={item.id} href={item.href} className="grid gap-2 py-4 sm:grid-cols-[110px_1fr]"><span className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">{item.meta}</span><div><h3 className="serif text-xl">{item.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-6 text-[#756e64]">{item.text}</p></div></Link>)}
      </div>
    </section>
  );
}
