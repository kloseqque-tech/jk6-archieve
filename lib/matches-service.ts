import { getDb, isoNow, mapMatch } from "./db";
import { newId } from "./security";
import type { Match, RatingSummary } from "./types";

export type FootballProvider = "api-football" | "football-data.org" | "none";

export type SyncResult = {
  updated: number;
  ratingsUpdated: number;
  provider: Exclude<FootballProvider, "none">;
  message: string;
  syncedAt: string;
};

type ApiError = Error & { status?: number; code?: string };

function configurationError(message: string): ApiError {
  const error = new Error(message) as ApiError;
  error.status = 503;
  error.code = "FOOTBALL_API_NOT_CONFIGURED";
  return error;
}

function configuredApiFootballTeams(): string[] {
  return (process.env.API_FOOTBALL_TEAM_IDS || "157,25")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function configuredFootballDataTeams(): string[] {
  return (process.env.FOOTBALL_DATA_TEAM_IDS || process.env.FOOTBALL_DATA_TEAM_ID || "5,759")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function footballApiProvider(): FootballProvider {
  if (process.env.API_FOOTBALL_API_KEY) return "api-football";
  if (process.env.FOOTBALL_DATA_API_KEY) return "football-data.org";
  return "none";
}

export function footballApiEnabled(): boolean {
  return footballApiProvider() !== "none";
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  provider: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", ...headers },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        continue;
      }
      const payload = (await response.json().catch(() => null)) as T | null;
      if (!response.ok) {
        const error = new Error(
          `${provider} 请求失败：HTTP ${response.status}${extractApiMessage(payload)}`,
        ) as ApiError;
        error.status = response.status === 429 ? 503 : 502;
        throw error;
      }
      return payload as T;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && !(error instanceof Error && error.message.includes("HTTP 4"))) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      } else {
        break;
      }
    }
  }
  throw lastError || new Error(`${provider} request failed`);
}

function extractApiMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as { message?: unknown; errors?: unknown };
  const message = candidate.message || candidate.errors;
  if (!message) return "";
  return `（${typeof message === "string" ? message : JSON.stringify(message).slice(0, 240)}）`;
}

export async function syncMatches(): Promise<SyncResult> {
  const provider = footballApiProvider();
  if (provider === "api-football") return syncApiFootball();
  if (provider === "football-data.org") return syncFootballData();
  throw configurationError(
    "比赛比分与球员评分 API 尚未配置。请设置 API_FOOTBALL_API_KEY，或设置 FOOTBALL_DATA_API_KEY 作为仅比分的备用数据源。",
  );
}

async function syncApiFootball(): Promise<SyncResult> {
  const apiKey = process.env.API_FOOTBALL_API_KEY!;
  const baseUrl = (process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(
    /\/$/,
    "",
  );
  const db = getDb();
  const syncId = newId("sync_");
  const startedAt = isoNow();
  db.prepare(
    "INSERT INTO sync_logs (id,provider,status,message,records_updated,started_at) VALUES (?,?,'running',?,0,?)",
  ).run(syncId, "api-football", "正在同步赛程、比分和基米希评分", startedAt);

  let updated = 0;
  let ratingsUpdated = 0;
  const warnings: string[] = [];
  try {
    const lookbackDays = clampDays(process.env.API_FOOTBALL_LOOKBACK_DAYS, 365, 7, 730);
    const lookaheadDays = clampDays(process.env.API_FOOTBALL_LOOKAHEAD_DAYS, 180, 1, 365);
    const now = new Date();
    const from = isoDate(addDays(now, -lookbackDays));
    const to = isoDate(addDays(now, lookaheadDays));

    for (const teamId of configuredApiFootballTeams()) {
      for (let page = 1; page <= 3; page += 1) {
        const payload = await apiFootballRequest<any>(
          `${baseUrl}/fixtures?team=${encodeURIComponent(teamId)}&from=${from}&to=${to}&timezone=UTC&page=${page}`,
          apiKey,
        );
        const fixtures = payload.response || [];
        for (const raw of fixtures) {
          if (!raw?.fixture?.id) continue;
          const trackedIsHome = String(raw.teams?.home?.id) === teamId;
          const trackedTeam = trackedIsHome ? raw.teams?.home?.name : raw.teams?.away?.name;
          const opponent = trackedIsHome ? raw.teams?.away?.name : raw.teams?.home?.name;
          if (!trackedTeam || !opponent) continue;
          const externalId = `api-football:${raw.fixture.id}`;
          const existing = db.prepare("SELECT id FROM matches WHERE external_id=?").get(externalId) as
            | Record<string, any>
            | undefined;
          const matchId = existing?.id || newId("match_");
          const syncedAt = isoNow();
          db.prepare(`
            INSERT INTO matches
              (id,external_id,provider,competition,tracked_team,opponent,home_away,match_date,venue,home_score,away_score,status,source_type,last_synced_at,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'api',?,?,?)
            ON CONFLICT(external_id) DO UPDATE SET
              provider=excluded.provider, competition=excluded.competition, tracked_team=excluded.tracked_team,
              opponent=excluded.opponent, home_away=excluded.home_away, match_date=excluded.match_date,
              venue=excluded.venue, home_score=excluded.home_score, away_score=excluded.away_score,
              status=excluded.status, source_type='api', last_synced_at=excluded.last_synced_at,
              updated_at=excluded.updated_at
          `).run(
            matchId,
            externalId,
            "api-football",
            raw.league?.name || "Football",
            trackedTeam,
            opponent,
            trackedIsHome ? "home" : "away",
            raw.fixture?.date || syncedAt,
            raw.fixture?.venue?.name || null,
            numericOrNull(raw.goals?.home),
            numericOrNull(raw.goals?.away),
            normalizeApiFootballStatus(raw.fixture?.status?.short),
            syncedAt,
            syncedAt,
            syncedAt,
          );
          updated += 1;
        }
        if (!payload.paging || page >= Number(payload.paging.total || 1)) break;
      }
    }

    try {
      ratingsUpdated = await syncKimmichRatings(baseUrl, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "球员评分同步失败";
      warnings.push(message);
      console.error("API-Football rating sync failed:", error);
    }

    const message =
      warnings.length > 0
        ? `比分已更新 ${updated} 场；评分更新 ${ratingsUpdated} 场；评分警告：${warnings.join("；")}`
        : `比分已更新 ${updated} 场；基米希评分更新 ${ratingsUpdated} 场。`;
    finishSyncLog(syncId, warnings.length ? "partial" : "success", message, updated);
    return {
      updated,
      ratingsUpdated,
      provider: "api-football",
      message,
      syncedAt: isoNow(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API-Football sync error";
    finishSyncLog(syncId, "failed", message, updated);
    throw error;
  }
}

type ApiFootballResponse<T> = {
  response?: T[];
  paging?: { current?: number; total?: number };
  errors?: unknown;
};

async function apiFootballRequest<T>(
  url: string,
  apiKey: string,
): Promise<ApiFootballResponse<T>> {
  const payload = await fetchJson<ApiFootballResponse<T>>(
    url,
    { "x-apisports-key": apiKey },
    "API-Football",
  );
  const errors = payload.errors;
  if (
    errors &&
    (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors as object).length > 0)
  ) {
    throw new Error(`API-Football：${JSON.stringify(errors).slice(0, 300)}`);
  }
  return payload;
}

async function syncKimmichRatings(baseUrl: string, apiKey: string): Promise<number> {
  const db = getDb();
  const candidates = db
    .prepare(`
      SELECT m.id,m.external_id,m.status
      FROM matches m
      WHERE m.provider='api-football'
        AND m.source_type='api'
        AND m.status IN ('finished','in_play')
        AND (
          m.status='in_play'
          OR NOT EXISTS (
            SELECT 1 FROM player_match_ratings r
            WHERE r.match_id=m.id AND r.provider='api-football'
          )
        )
      ORDER BY CASE WHEN m.status='in_play' THEN 0 ELSE 1 END, m.match_date DESC
      LIMIT ?
    `)
    .all(clampDays(process.env.API_FOOTBALL_RATING_LIMIT, 8, 1, 20)) as Array<Record<string, any>>;
  if (!candidates.length) return 0;

  const knownPlayer = db
    .prepare(
      "SELECT provider_player_id,player_name FROM player_match_ratings WHERE provider='api-football' LIMIT 1",
    )
    .get() as Record<string, any> | undefined;
  let playerId = knownPlayer?.provider_player_id ? String(knownPlayer.provider_player_id) : "";
  let playerName = knownPlayer?.player_name ? String(knownPlayer.player_name) : "Joshua Kimmich";

  if (!playerId) {
    const search = await apiFootballRequest<any>(
      `${baseUrl}/players?search=${encodeURIComponent("Joshua Kimmich")}`,
      apiKey,
    );
    const found = (search.response || []).find((entry) => {
      const name = String(entry?.player?.name || "");
      const firstname = String(entry?.player?.firstname || "");
      return name.includes("Kimmich") && (!firstname || firstname.includes("Joshua"));
    });
    if (!found?.player?.id) {
      throw new Error("API-Football 未找到 Joshua Kimmich 的球员档案。");
    }
    playerId = String(found.player.id);
    playerName = String(found.player.name || "Joshua Kimmich");
  }

  let ratingsUpdated = 0;
  for (const match of candidates) {
    const fixtureId = String(match.external_id || "").replace("api-football:", "");
    if (!fixtureId) continue;
    const payload = await apiFootballRequest<any>(
      `${baseUrl}/fixtures/players?fixture=${encodeURIComponent(fixtureId)}`,
      apiKey,
    );
    let found: any = null;
    let foundTeamName: string | null = null;
    for (const teamBlock of payload.response || []) {
      const playerRow = (teamBlock?.players || []).find(
        (entry: any) => String(entry?.player?.id) === playerId,
      );
      if (playerRow) {
        found = playerRow;
        foundTeamName = teamBlock?.team?.name || null;
        break;
      }
    }
    const statistics = found?.statistics?.[0] || {};
    const rating = finiteNumber(statistics?.games?.rating);
    const updatedAt = isoNow();
    db.prepare(`
      INSERT INTO player_match_ratings
        (id,match_id,provider,provider_player_id,player_name,team_name,rating,minutes,goals,assists,yellow_cards,red_cards,raw_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(match_id,provider,provider_player_id) DO UPDATE SET
        team_name=excluded.team_name, rating=excluded.rating, minutes=excluded.minutes,
        goals=excluded.goals, assists=excluded.assists, yellow_cards=excluded.yellow_cards,
        red_cards=excluded.red_cards, raw_json=excluded.raw_json, updated_at=excluded.updated_at
    `).run(
      newId("rating_"),
      match.id,
      "api-football",
      playerId,
      playerName,
      foundTeamName,
      rating,
      integerOrNull(statistics?.games?.minutes),
      integerOrNull(statistics?.goals?.total),
      integerOrNull(statistics?.goals?.assists),
      integerOrNull(statistics?.cards?.yellow),
      integerOrNull(statistics?.cards?.red),
      JSON.stringify({ found: Boolean(found), statistics }).slice(0, 20_000),
      updatedAt,
    );
    ratingsUpdated += 1;
  }
  return ratingsUpdated;
}

async function syncFootballData(): Promise<SyncResult> {
  const key = process.env.FOOTBALL_DATA_API_KEY!;
  const db = getDb();
  const syncId = newId("sync_");
  const startedAt = isoNow();
  db.prepare(
    "INSERT INTO sync_logs (id,provider,status,message,records_updated,started_at) VALUES (?,?,'running',?,0,?)",
  ).run(syncId, "football-data.org", "正在同步比分；备用源不提供球员评分", startedAt);

  let updated = 0;
  const errors: string[] = [];
  try {
    for (const teamId of configuredFootballDataTeams()) {
      const payload = await fetchJson<{ matches?: any[] }>(
        `https://api.football-data.org/v4/teams/${encodeURIComponent(teamId)}/matches`,
        { "X-Auth-Token": key },
        "football-data.org",
      );
      for (const raw of payload.matches || []) {
        if (!raw?.id || !raw?.homeTeam?.name || !raw?.awayTeam?.name) continue;
        const trackedIsHome = String(raw.homeTeam.id) === teamId;
        const opponent = trackedIsHome ? raw.awayTeam.name : raw.homeTeam.name;
        const competition = raw.competition?.name || raw.competition?.code || raw.stage || "Football";
        const trackedTeam = trackedIsHome
          ? raw.homeTeam.name
          : raw.awayTeam.name || (teamId === "759" ? "Germany" : "Bayern München");
        const externalId = `football-data:${raw.id}`;
        const existing = db.prepare("SELECT id FROM matches WHERE external_id=?").get(externalId) as
          | Record<string, any>
          | undefined;
        const matchId = existing?.id || newId("match_");
        const fullTime = raw.score?.fullTime || {};
        const statusMap: Record<string, string> = {
          FINISHED: "finished",
          IN_PLAY: "in_play",
          PAUSED: "in_play",
          SCHEDULED: "scheduled",
          TIMED: "scheduled",
          POSTPONED: "postponed",
          SUSPENDED: "suspended",
          CANCELLED: "cancelled",
        };
        const status = statusMap[raw.status] || String(raw.status || "scheduled").toLowerCase();
        const now = isoNow();
        db.prepare(`
          INSERT INTO matches
            (id,external_id,provider,competition,tracked_team,opponent,home_away,match_date,venue,home_score,away_score,status,source_type,last_synced_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'api',?,?,?)
          ON CONFLICT(external_id) DO UPDATE SET
            provider=excluded.provider, competition=excluded.competition, tracked_team=excluded.tracked_team,
            opponent=excluded.opponent, home_away=excluded.home_away, match_date=excluded.match_date,
            venue=excluded.venue, home_score=excluded.home_score, away_score=excluded.away_score,
            status=excluded.status, source_type='api', last_synced_at=excluded.last_synced_at,
            updated_at=excluded.updated_at
        `).run(
          matchId,
          externalId,
          "football-data.org",
          competition,
          trackedTeam,
          opponent,
          trackedIsHome ? "home" : "away",
          raw.utcDate || now,
          raw.venue || null,
          numericOrNull(fullTime.home),
          numericOrNull(fullTime.away),
          status,
          now,
          now,
          now,
        );
        updated += 1;
      }
    }
    const message = errors.length
      ? `部分同步失败：${errors.join("；")}`
      : "比分同步完成；备用数据源不提供球员评分。";
    finishSyncLog(syncId, errors.length ? "partial" : "success", message, updated);
    return {
      updated,
      ratingsUpdated: 0,
      provider: "football-data.org",
      message,
      syncedAt: isoNow(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown football-data.org sync error";
    finishSyncLog(syncId, "failed", message, updated);
    throw error;
  }
}

function finishSyncLog(id: string, status: string, message: string, updated: number) {
  getDb()
    .prepare(
      "UPDATE sync_logs SET status=?,message=?,records_updated=?,finished_at=? WHERE id=?",
    )
    .run(status, message, updated, isoNow(), id);
}

function normalizeApiFootballStatus(value: unknown): string {
  const status = String(value || "NS").toUpperCase();
  if (["FT", "AET", "PEN"].includes(status)) return "finished";
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"].includes(status)) return "in_play";
  if (["NS", "TBD"].includes(status)) return "scheduled";
  if (status === "PST") return "postponed";
  if (status === "CANC") return "cancelled";
  if (["ABD", "AWD", "WO"].includes(status)) return "abandoned";
  return status.toLowerCase();
}

function clampDays(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function numericOrNull(value: unknown): number | null {
  const number = Number(value);
  return typeof value !== "undefined" && value !== null && Number.isFinite(number) ? number : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function integerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function apiMatchFallbackNotice(): string {
  const provider = footballApiProvider();
  if (provider === "api-football") {
    return "赛程、比分与基米希赛后评分来自 API-Football；评分更新时间以每条记录为准。";
  }
  if (provider === "football-data.org") {
    return "比分由 football-data.org 同步；该备用源不提供球员评分。";
  }
  return "当前展示人工录入与演示记录；配置 API-Football Key 后可同步比分和球员评分。";
}

export function ratingSummary(): RatingSummary {
  const row = getDb()
    .prepare(`
      SELECT
        AVG(CASE WHEN r.rating IS NOT NULL THEN r.rating END) AS average,
        MAX(CASE WHEN r.rating IS NOT NULL THEN r.rating END) AS best,
        COUNT(CASE WHEN r.rating IS NOT NULL THEN 1 END) AS matches_rated,
        COUNT(CASE WHEN r.minutes > 0 THEN 1 END) AS appearances,
        MAX(r.updated_at) AS latest_rating_at
      FROM player_match_ratings r
      WHERE r.provider='api-football'
    `)
    .get() as Record<string, any>;
  return {
    average: row.average == null ? null : Math.round(Number(row.average) * 10) / 10,
    appearances: Number(row.appearances || 0),
    best: row.best == null ? null : Math.round(Number(row.best) * 10) / 10,
    matchesRated: Number(row.matches_rated || 0),
    latestRatingAt: row.latest_rating_at || null,
  };
}

export function latestMatches(limit = 12): Match[] {
  return (
    getDb()
      .prepare("SELECT * FROM matches ORDER BY match_date DESC LIMIT ?")
      .all(limit) as Array<Record<string, any>>
  ).map(mapMatch);
}
