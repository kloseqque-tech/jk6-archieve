"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MediaCard } from "@/components/media-card";
import { ArrowUpRight, MessageIcon, UploadIcon } from "@/components/icons";
import { api, formatDate } from "@/lib/client";
import type { BootstrapPayload } from "@/lib/types";

export default function HomePage() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<BootstrapPayload>("/api/bootstrap")
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <section className="relative overflow-hidden border-b border-[#dcd2c3]">
        <div className="page-wrap grid min-h-[660px] items-stretch gap-10 py-10 md:grid-cols-[1.02fr_.98fr] md:py-16">
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-3">
              <span className="source-badge demo">Independent · Living archive</span>
              <span className="text-[9px] font-bold tracking-[.18em] text-[#756e64]">VOL. 01 / 2026</span>
            </div>
            <h1 className="display mt-8 max-w-[730px] text-[clamp(4.2rem,9.5vw,8.5rem)]">
              The game,
              <br />
              <span className="italic text-[#394b60]">remembered</span>
              <br />
              in detail.
            </h1>
            <p className="mt-7 max-w-lg text-[15px] leading-8 text-[#756e64]">
              A living archive of matches, words and moments around Joshua Kimmich — assembled by the people who
              watch closely.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/photos" className="button-primary">
                Enter the archive <ArrowUpRight width={16} height={16} />
              </Link>
              <Link href="/community" className="button-secondary">
                Add a memory
              </Link>
            </div>
            <div className="mt-11 grid max-w-lg grid-cols-3 border-y border-[#dcd2c3] py-4">
              {[
                [data?.stats.photos ?? "—", "Photographs"],
                [data?.stats.videos ?? "—", "Video records"],
                [data?.stats.members ?? "—", "Contributors"],
              ].map(([value, label]) => (
                <div key={label} className="border-r border-[#dcd2c3] px-4 first:pl-0 last:border-r-0">
                  <p className="serif text-3xl">{value}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-[.15em] text-[#756e64]">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[520px]">
            <div className="paper-panel absolute inset-x-4 inset-y-3 rotate-[2.2deg] bg-[#dce8f3] md:inset-x-9" />
            <div className="paper-panel relative ml-auto mr-2 mt-4 w-[92%] overflow-hidden md:mr-5 md:mt-7 md:w-[88%]">
              <div className="flex items-center justify-between border-b border-[#dcd2c3] px-4 py-3 text-[9px] font-bold uppercase tracking-[.17em] text-[#756e64]">
                <span>Featured study / 001</span>
                <span>FCB · DFB</span>
              </div>
              <div className="relative aspect-[4/5] overflow-hidden bg-[#faf6ed]">
                <img
                  src="/assets/matchday.svg"
                  alt="Original editorial illustration of a football pitch, stadium geometry and Kimmich's number six"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-4 left-4 bg-[#fffdf8]/92 px-3 py-2 text-[8px] font-bold uppercase tracking-[.17em] text-[#756e64]">
                  Original archive illustration · not a photograph
                </span>
              </div>
              <div className="bg-[#fffdf8] p-5">
                <p className="eyebrow">Reading the six</p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <h2 className="serif text-3xl leading-none">The space between the lines</h2>
                  <span className="serif text-4xl leading-none text-[#d7bfc0]">06</span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-2 left-0 w-[145px] border border-[#394b60] bg-[#394b60] p-4 text-[#fffdf8] shadow-xl md:left-7">
              <p className="text-[8px] font-bold uppercase tracking-[.18em] text-[#dce8f3]">Recent record</p>
              <p className="serif mt-2 text-xl leading-tight">Browse by season, source and story.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-wrap py-16 md:py-24">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Selected archive cards</p>
            <h2 className="display mt-4 text-5xl md:text-6xl">Open a drawer.</h2>
          </div>
          <p className="max-w-sm text-sm leading-7 text-[#756e64]">
            Every card is backed by a database record. User media enters a review queue before it becomes public.
          </p>
        </div>
        {error ? <div className="error-box mt-8">{error}</div> : null}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {!data
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="aspect-[4/5] skeleton border border-[#dcd2c3]" />
              ))
            : data.featuredMedia.slice(0, 3).map((item, index) => (
                <MediaCard key={item.id} item={item} index={index + 1} />
              ))}
        </div>
      </section>

      <section className="border-y border-[#dcd2c3] bg-[#fffdf8]">
        <div className="page-wrap grid gap-10 py-14 lg:grid-cols-[.82fr_1.18fr]">
          <div className="flex flex-col justify-between border-[#dcd2c3] pr-0 lg:border-r lg:pr-12">
            <div>
              <p className="eyebrow">Match register</p>
              <h2 className="display mt-4 text-5xl">By the whistle.</h2>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[#756e64]">
                A durable record of fixtures, scores and context. API-synced fixtures, manual entries and sample
                records are labelled separately.
              </p>
            </div>
            <Link href="/matches" className="mt-8 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#394b60]">
              Open match centre <ArrowUpRight width={14} height={14} />
            </Link>
          </div>
          <div>
            {data?.recentMatches.slice(0, 2).map((match, index) => (
              <Link
                href={`/matches/${match.id}`}
                key={match.id}
                className="grid grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-[#dcd2c3] py-5 first:pt-0"
              >
                <span className="font-serif text-2xl text-[#394b60]/35">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#756e64]">
                    {match.competition} · {match.sourceType}
                  </p>
                  <p className="serif mt-1 text-xl">{match.trackedTeam} <span className="text-[#756e64]">vs</span> {match.opponent}</p>
                  <p className="mt-1 text-[10px] text-[#756e64]">{formatDate(match.matchDate)} · {match.venue || "Venue TBC"}</p>
                </div>
                <div className="border border-[#dcd2c3] bg-[#faf6ed] px-3 py-2 text-center">
                  <p className="serif text-xl">{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</p>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-[#756e64]">Full time</p>
                  {match.playerRating?.rating != null ? (
                    <p className="mt-1 text-[8px] font-bold text-[#394b60]">Kimmich {match.playerRating.rating.toFixed(1)}</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="page-wrap py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Reading room</p>
                <h2 className="display mt-4 text-5xl">Words that stay.</h2>
              </div>
              <Link href="/interviews" className="text-[9px] font-bold uppercase tracking-[.13em] text-[#394b60]">
                All stories
              </Link>
            </div>
            <div className="mt-8">
              {data?.latestArticles.slice(0, 2).map((article, index) => (
                <Link
                  key={article.id}
                  href={`/interviews/${article.id}`}
                  className="group grid gap-4 border-t border-[#dcd2c3] py-7 sm:grid-cols-[90px_1fr_auto]"
                >
                  <span className="serif text-5xl text-[#394b60]/18">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="source-badge">{article.type}</span>
                      {article.isDemo ? <span className="source-badge demo">Demo record</span> : null}
                    </div>
                    <h3 className="serif mt-3 max-w-2xl text-2xl transition group-hover:text-[#394b60]">{article.title}</h3>
                    <p className="mt-2 max-w-xl text-xs leading-6 text-[#756e64]">{article.dek}</p>
                  </div>
                  <ArrowUpRight className="mt-2" />
                </Link>
              ))}
            </div>
          </div>
          <aside className="paper-panel self-start p-6">
            <p className="eyebrow">From the terraces</p>
            <div className="mt-5 space-y-6">
              {data?.recentPosts.slice(0, 2).map((post) => (
                <article key={post.id} className="border-b border-[#dcd2c3] pb-5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-[.13em] text-[#394b60]">@{post.author.username}</span>
                    {post.isDemo ? <span className="source-badge demo">Demo</span> : null}
                  </div>
                  <h3 className="serif mt-2 text-xl">{post.title}</h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-6 text-[#756e64]">{post.body}</p>
                  <p className="mt-3 flex items-center gap-1 text-[9px] text-[#756e64]"><MessageIcon width={12} height={12} /> {post.commentCount} replies</p>
                </article>
              ))}
            </div>
            <Link href="/community" className="mt-5 inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.14em]">
              Join the conversation <ArrowUpRight width={13} height={13} />
            </Link>
          </aside>
        </div>
      </section>

      <section className="border-y border-[#394b60] bg-[#394b60] text-[#fffdf8]">
        <div className="page-wrap grid items-center gap-8 py-12 md:grid-cols-[1fr_auto]">
          <div>
            <p className="eyebrow !text-[#b8c9d8]">Your archive needs you</p>
            <h2 className="display mt-4 max-w-2xl text-4xl md:text-5xl">Bring a photograph. Add the story around it.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#dce8f3]">
              Upload a photo or video, add rights information, and send it for review. Your files never become public
              until an editor approves them.
            </p>
          </div>
          <Link href="/photos?upload=1" className="button-secondary !border-[#fffdf8] !text-[#fffdf8] hover:!bg-[#fffdf8] hover:!text-[#394b60]">
            <UploadIcon width={16} height={16} /> Upload media
          </Link>
        </div>
      </section>
    </>
  );
}
