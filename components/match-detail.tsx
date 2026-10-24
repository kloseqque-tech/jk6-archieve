"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommentSection } from "./comment-section";
import { MediaCard } from "./media-card";
import { ClockIcon } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { Match, MediaItem } from "@/lib/types";

export function MatchDetail({ id }: { id: string }) {
  const [match, setMatch] = useState<Match | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ item: Match; media: MediaItem[] }>(`/api/matches/${id}`)
      .then((payload) => {
        setMatch(payload.item);
        setMedia(payload.media);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return <div className="page-wrap py-20"><div className="paper-panel p-10 text-center"><h1 className="serif text-4xl">Fixture unavailable</h1><p className="mt-3 text-sm text-[#756e64]">{error}</p><Link href="/matches" className="button-primary mt-6">Back to match centre</Link></div></div>;
  }
  if (!match) return <div className="page-wrap py-16"><div className="skeleton h-[60vh]" /></div>;

  return (
    <>
      <header className="border-b border-[#dcd2c3] bg-[#fffdf8]">
        <div className="page-wrap py-10 md:py-14">
          <Link href="/matches" className="text-[9px] font-bold uppercase tracking-[.14em] text-[#756e64]">← Match register</Link>
          <div className="mt-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <div className="flex gap-2">
                <span className="source-badge">{match.competition}</span>
                <span className={`source-badge ${match.sourceType === "demo" ? "demo" : match.sourceType === "api" ? "upload" : "external"}`}>{match.sourceType}</span>
              </div>
              <h1 className="display mt-5 text-[clamp(3.2rem,8vw,7rem)]">
                {match.trackedTeam}
                <br />
                <span className="italic text-[#394b60]">vs {match.opponent}</span>
              </h1>
              <p className="mt-5 flex flex-wrap gap-4 text-xs text-[#756e64]">
                <span className="flex items-center gap-1"><ClockIcon width={13} height={13} /> {formatDate(match.matchDate, { weekday: "long", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{match.venue || "Venue not recorded"}</span>
              </p>
            </div>
            <div className="border border-[#dcd2c3] bg-[#faf6ed] px-8 py-6 text-center">
              <p className="serif text-6xl">{match.homeScore ?? "–"}<span className="mx-2 text-[#756e64]">:</span>{match.awayScore ?? "–"}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[.15em] text-[#756e64]">{match.status.replace("_", " ")}</p>
            </div>
          </div>
        </div>
      </header>
      <section className="page-wrap py-10">
        {match.sourceType === "demo" ? (
          <div className="notice mb-8">This is a demonstration fixture record. Verify dates, venues and scores against an authoritative source before citing it.</div>
        ) : null}
        <div className="mb-8 grid gap-4 md:grid-cols-[1.1fr_.9fr]">
          <div className="paper-panel grid gap-5 p-5 sm:grid-cols-[150px_1fr] sm:p-6">
            <div className="border-b border-[#dcd2c3] pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
              <p className="eyebrow">Kimmich rating</p>
              <p className="serif mt-2 text-7xl leading-none text-[#394b60]">
                {match.playerRating?.rating != null ? match.playerRating.rating.toFixed(1) : "—"}
              </p>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#756e64]">
                {match.playerRating ? match.playerRating.provider : "No rating record"}
              </p>
            </div>
            <div className="flex flex-col justify-between">
              <div>
                <h2 className="serif text-2xl">Performance register</h2>
                {match.playerRating?.rating != null ? (
                  <div className="mt-4 grid grid-cols-3 divide-x divide-[#dcd2c3] border-y border-[#dcd2c3] py-3 text-center">
                    {[
                      [match.playerRating.minutes ?? "—", "Minutes"],
                      [match.playerRating.goals ?? "—", "Goals"],
                      [match.playerRating.assists ?? "—", "Assists"],
                    ].map(([value, label]) => (
                      <div key={label} className="px-2">
                        <p className="serif text-2xl">{value}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-[#756e64]">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-7 text-[#756e64]">
                    {match.status === "scheduled"
                      ? "比赛尚未开始，暂不生成评分。"
                      : match.status === "in_play"
                        ? "比赛进行中，评分将在数据源更新后刷新。"
                        : match.provider === "api-football"
                          ? "已同步这场比赛，但数据源当前没有返回基米希的赛后评分。"
                          : "当前数据源不提供球员评分。"}
                  </p>
                )}
              </div>
              {match.playerRating?.updatedAt ? (
                <p className="mt-4 text-[9px] text-[#756e64]">Rating updated {formatDate(match.playerRating.updatedAt, { hour: "2-digit", minute: "2-digit" })}</p>
              ) : null}
            </div>
          </div>
          <div className="border border-[#dcd2c3] bg-[#f7f3ea] p-5">
            <p className="eyebrow">Data source</p>
            <p className="serif mt-2 text-2xl">
              {match.provider === "api-football" ? "API-Football" : match.provider === "football-data.org" ? "football-data.org" : "Archive editorial record"}
            </p>
            <p className="mt-2 text-xs leading-6 text-[#756e64]">
              {match.provider === "api-football"
                ? "比分、赛程和评分均来自 API-Football。评分由数据供应方提供，不是本档案馆自行计算。"
                : match.provider === "football-data.org"
                  ? "比分来自 football-data.org；该来源不提供球员评分。"
                  : "人工或演示记录，不声明为实时数据。"}
            </p>
            <span className={`source-badge mt-3 ${match.provider === "api-football" ? "upload" : match.sourceType === "demo" ? "demo" : "external"}`}>
              {match.lastSyncedAt ? `Synced ${formatDate(match.lastSyncedAt)}` : match.sourceType}
            </span>
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <h2 className="serif text-3xl">Related archive records</h2>
            {media.length ? (
              <div className="mt-6 grid gap-6 sm:grid-cols-2">{media.map((item, index) => <MediaCard key={item.id} item={item} index={index + 1} />)}</div>
            ) : (
              <div className="paper-panel mt-5 p-8 text-sm leading-7 text-[#756e64]">
                No approved photographs or videos are linked to this fixture yet. Editors can attach media records through the admin workspace.
              </div>
            )}
          </div>
          <aside className="border-l border-[#dcd2c3] pl-5">
            <p className="eyebrow">Provenance</p>
            <dl className="mt-4 divide-y divide-[#dcd2c3] text-xs">
              <div className="py-3"><dt className="text-[9px] uppercase tracking-widest text-[#756e64]">Source</dt><dd className="mt-1">{match.provider}</dd></div>
              <div className="py-3"><dt className="text-[9px] uppercase tracking-widest text-[#756e64]">External ID</dt><dd className="mt-1 break-all">{match.externalId || "Not applicable"}</dd></div>
              <div className="py-3"><dt className="text-[9px] uppercase tracking-widest text-[#756e64]">Last synced</dt><dd className="mt-1">{formatDate(match.lastSyncedAt)}</dd></div>
            </dl>
          </aside>
        </div>
        <div className="mt-12">
          <CommentSection targetType="match" targetId={match.id} />
        </div>
      </section>
    </>
  );
}
