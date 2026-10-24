"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHero } from "./page-hero";
import { ArrowUpRight, ClockIcon } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { Match, RatingSummary } from "@/lib/types";

export function MatchesView() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState("all");
  const [apiEnabled, setApiEnabled] = useState(false);
  const [provider, setProvider] = useState("none");
  const [ratingStats, setRatingStats] = useState<RatingSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{
      items: Match[];
      apiEnabled: boolean;
      provider: string;
      ratingSummary: RatingSummary;
    }>("/api/matches")
      .then((payload) => {
        setMatches(payload.items);
        setApiEnabled(payload.apiEnabled);
        setProvider(payload.provider);
        setRatingStats(payload.ratingSummary);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return matches;
    if (filter === "upcoming") return matches.filter((match) => ["scheduled", "timed"].includes(match.status));
    if (filter === "live") return matches.filter((match) => ["in_play", "paused"].includes(match.status));
    if (filter === "finished") return matches.filter((match) => match.status === "finished");
    return matches.filter((match) => match.competition.toLowerCase().includes(filter));
  }, [filter, matches]);

  return (
    <>
      <PageHero
        number="02"
        eyebrow="Fixture register"
        title="By the whistle."
        description="Fixtures and results for Bayern München and Germany. API-synced, manually entered and demonstration records remain visibly distinct."
      >
        <div className={`border px-3 py-2 text-[9px] font-bold uppercase tracking-[.13em] ${apiEnabled ? "border-[#a7b59a] bg-[#edf2e9] text-[#496047]" : "border-[#dcd2c3] bg-[#f7f3ea] text-[#756e64]"}`}>
          {apiEnabled ? `${provider === "api-football" ? "Scores + ratings" : "Scores only"} · ${provider}` : "API key not configured"}
        </div>
      </PageHero>
      <section className="page-wrap py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dcd2c3] pb-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All records"],
              ["upcoming", "Upcoming"],
              ["live", "In play"],
              ["finished", "Finished"],
              ["bundesliga", "Bundesliga"],
              ["champions", "Champions League"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setFilter(value)}
                className={`px-3 py-2 text-[9px] font-bold uppercase tracking-[.11em] ${
                  filter === value ? "bg-[#394b60] text-[#fffdf8]" : "border border-[#dcd2c3] text-[#756e64]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="max-w-sm text-[10px] leading-5 text-[#756e64]">
            {apiEnabled
              ? `${provider} is active. ${provider === "api-football" ? "Scores and Kimmich ratings update from the provider." : "This fallback provider supplies scores, not player ratings."}`
              : "Demo and manual records remain available. Configure API_FOOTBALL_API_KEY for scores, fixtures and Kimmich ratings."}
          </p>
        </div>
        {ratingStats && ratingStats.matchesRated > 0 ? (
          <div className="grid grid-cols-2 gap-3 border-b border-[#dcd2c3] py-5 sm:grid-cols-4">
            {[
              [ratingStats.average?.toFixed(1) || "—", "Average rating"],
              [String(ratingStats.matchesRated), "Matches rated"],
              [String(ratingStats.appearances), "Appearances"],
              [ratingStats.best?.toFixed(1) || "—", "Best rating"],
            ].map(([value, label]) => (
              <div key={label} className="border-r border-[#dcd2c3] px-4 first:pl-0 last:border-r-0">
                <p className="serif text-2xl">{value}</p>
                <p className="text-[8px] font-bold uppercase tracking-[.12em] text-[#756e64]">{label}</p>
              </div>
            ))}
          </div>
        ) : null}
        {error ? <div className="error-box mt-6">{error}</div> : null}
        <div className="mt-7 space-y-4">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-36" />)
            : filtered.map((match, index) => (
                <Link
                  href={`/matches/${match.id}`}
                  key={match.id}
                  className="archive-card grid gap-5 p-5 sm:grid-cols-[54px_1fr_auto] sm:items-center sm:p-6"
                >
                  <span className="serif text-4xl text-[#394b60]/22">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-[.14em] text-[#756e64]">{match.competition}</span>
                      <span className={`source-badge ${match.sourceType === "demo" ? "demo" : match.sourceType === "api" ? "upload" : "external"}`}>
                        {match.sourceType === "api"
                          ? match.provider === "api-football" ? "API · scores + ratings" : "API · scores"
                          : match.sourceType === "demo" ? "Demo record" : "Manual record"}
                      </span>
                    </div>
                    <h2 className="serif mt-2 text-2xl sm:text-3xl">
                      {match.trackedTeam} <span className="text-[#756e64]">vs</span> {match.opponent}
                    </h2>
                    <p className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[#756e64]">
                      <span className="flex items-center gap-1"><ClockIcon width={12} height={12} /> {formatDate(match.matchDate, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{match.venue || "Venue not recorded"}</span>
                      <span>{match.homeAway}</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-5 border-t border-[#dcd2c3] pt-4 sm:block sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
                    <div className="border border-[#dcd2c3] bg-[#faf6ed] px-4 py-3 text-center">
                      <p className="serif text-3xl">{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</p>
                      <p className="text-[8px] font-bold uppercase tracking-[.12em] text-[#756e64]">{match.status.replace("_", " ")}</p>
                      {match.playerRating?.rating != null ? (
                        <p className="mt-1 border-t border-[#dcd2c3] pt-1 text-[9px] font-bold text-[#394b60]">
                          Kimmich {match.playerRating.rating.toFixed(1)}
                        </p>
                      ) : match.provider === "api-football" && match.status === "finished" ? (
                        <p className="mt-1 text-[8px] text-[#756e64]">Rating sync pending</p>
                      ) : null}
                    </div>
                    <ArrowUpRight className="ml-auto mt-3 hidden text-[#756e64] sm:block" width={14} height={14} />
                  </div>
                </Link>
              ))}
        </div>
        {!loading && !filtered.length ? (
          <div className="paper-panel mt-8 p-12 text-center">
            <h2 className="serif text-3xl">No fixtures in this filter.</h2>
            <p className="mt-2 text-sm text-[#756e64]">Try another competition or status.</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
