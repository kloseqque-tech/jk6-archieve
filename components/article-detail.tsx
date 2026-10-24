"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommentSection, FavoriteButton } from "./comment-section";
import { ArrowUpRight } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { Article } from "@/lib/types";

export function ArticleDetail({ id }: { id: string }) {
  const [item, setItem] = useState<Article | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ item: Article }>(`/api/articles/${id}`)
      .then((payload) => setItem(payload.item))
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return <div className="page-wrap py-20"><div className="paper-panel p-10 text-center"><h1 className="serif text-4xl">Reading record unavailable</h1><p className="mt-3 text-sm text-[#756e64]">{error}</p><Link href="/interviews" className="button-primary mt-6">Back to reading room</Link></div></div>;
  }
  if (!item) return <div className="page-wrap py-16"><div className="skeleton h-[70vh]" /></div>;

  return (
    <article>
      <header className="border-b border-[#dcd2c3]">
        <div className="page-wrap grid gap-8 py-10 md:grid-cols-[1fr_300px] md:py-16">
          <div>
            <Link href="/interviews" className="text-[9px] font-bold uppercase tracking-[.14em] text-[#756e64]">← Reading room</Link>
            <div className="mt-8 flex flex-wrap gap-2">
              <span className="source-badge">{item.type}</span>
              <span className="source-badge">{item.originalLanguage}{item.translationLanguage ? ` → ${item.translationLanguage}` : ""}</span>
              {item.isDemo ? <span className="source-badge demo">Demonstration record</span> : null}
            </div>
            <h1 className="display mt-6 max-w-4xl text-[clamp(3.2rem,8vw,7rem)]">{item.title}</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#756e64]">{item.dek}</p>
          </div>
          <aside className="self-end border-l border-[#dcd2c3] pl-5 text-xs leading-7 text-[#756e64]">
            <p className="text-[9px] font-bold uppercase tracking-[.14em]">Publication record</p>
            <p className="mt-3">{formatDate(item.publishedAt)}</p>
            <p>{item.author ? `By @${item.author.username}` : "Archive editorial"}</p>
            <p>{item.sourceName || "Original archive content"}</p>
            {item.sourceUrl ? (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-3 flex items-center gap-1 font-semibold text-[#394b60]">
                Canonical source <ArrowUpRight width={12} height={12} />
              </a>
            ) : null}
          </aside>
        </div>
      </header>
      <div className="page-wrap grid gap-10 py-10 md:grid-cols-[180px_minmax(0,720px)] md:justify-center md:py-14">
        <aside className="md:sticky md:top-28 md:self-start">
          <div className="flex flex-wrap gap-2 md:grid">
            <FavoriteButton targetType="article" targetId={item.id} />
          </div>
          {item.tags.length ? (
            <div className="mt-5 border-t border-[#dcd2c3] pt-4">
              <p className="text-[9px] font-bold uppercase tracking-[.13em] text-[#756e64]">Filed under</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {item.tags.map((tag) => <span key={tag} className="border border-[#dcd2c3] px-2 py-1 text-[9px]">{tag}</span>)}
              </div>
            </div>
          ) : null}
        </aside>
        <div>
          {item.coverUrl ? <img src={item.coverUrl} alt="" className="mb-10 max-h-[540px] w-full border border-[#dcd2c3] object-cover" /> : null}
          {item.isDemo ? (
            <div className="notice mb-8">
              <strong>演示内容：</strong> This entry demonstrates the article format and is not a verified interview or historical quotation.
            </div>
          ) : null}
          <div className="prose-archive">
            {item.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          {item.translationLanguage ? (
            <div className="mt-9 border border-[#dcd2c3] bg-[#f7f3ea] p-4 text-xs leading-6 text-[#756e64]">
              Language record: original {item.originalLanguage.toUpperCase()}, presented in {item.translationLanguage.toUpperCase()}. Translation credit and source information should remain attached to this record.
            </div>
          ) : null}
        </div>
      </div>
      <div className="page-wrap max-w-5xl">
        <CommentSection targetType="article" targetId={item.id} />
      </div>
    </article>
  );
}
