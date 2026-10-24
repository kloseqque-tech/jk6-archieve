"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { CheckIcon, CloseIcon, EyeIcon, ShieldIcon } from "./icons";
import { api, formatBytes, formatDate } from "@/lib/client";
import type { Article, Match, MediaItem, Post, PublicUser, Report, SiteStats } from "@/lib/types";

type Summary = {
  stats: SiteStats;
  storageProvider: string;
  footballProvider: string;
  syncLogs: any[];
  audit: any[];
};

const tabs = ["Overview", "Media queue", "Articles", "Matches", "Community", "Reports", "Members"] as const;
type Tab = (typeof tabs)[number];

export function AdminDashboard() {
  const { user, showToast, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("Overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const base = await Promise.all([
        api<Summary>("/api/admin/summary"),
        api<{ items: MediaItem[] }>("/api/admin/media"),
        api<{ items: Article[] }>("/api/admin/articles"),
        api<{ items: Match[] }>("/api/matches"),
        api<{ items: Post[] }>("/api/admin/posts"),
        api<{ items: Report[] }>("/api/admin/reports"),
      ]);
      setSummary(base[0]);
      setMedia(base[1].items);
      setArticles(base[2].items);
      setMatches(base[3].items);
      setPosts(base[4].items);
      setReports(base[5].items);
      if (user?.role === "admin") {
        const users = await api<{ items: PublicUser[] }>("/api/admin/users");
        setMembers(users.items);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "管理数据载入失败。");
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === "admin" || user?.role === "editor") void load();
  }, [load, user?.role]);

  if (authLoading) return <div className="page-wrap py-20"><div className="skeleton h-[60vh]" /></div>;
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    return (
      <div className="page-wrap py-20">
        <div className="paper-panel mx-auto max-w-xl p-10 text-center">
          <ShieldIcon className="mx-auto" width={32} height={32} />
          <h1 className="serif mt-4 text-4xl">Editor access required</h1>
          <p className="mt-3 text-sm leading-7 text-[#756e64]">This workspace is protected by the server and only accepts admin or editor sessions.</p>
          <Link href="/" className="button-primary mt-6">Return home</Link>
        </div>
      </div>
    );
  }

  const review = async (item: MediaItem, status: "approved" | "rejected") => {
    const note = window.prompt(status === "approved" ? "审核备注（可选）：" : "请说明拒绝原因：", status === "approved" ? "Source and rights checked." : "") ?? "";
    if (status === "rejected" && !note.trim()) return;
    try {
      await api(`/api/admin/media/${item.id}/review`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      showToast(status === "approved" ? "媒体已批准并公开。" : "媒体已拒绝。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败。");
    }
  };

  const deleteMedia = async (item: MediaItem) => {
    if (!window.confirm(`永久删除“${item.title}”及其文件？`)) return;
    try {
      await api(`/api/media/${item.id}`, { method: "DELETE" });
      await load();
      showToast("媒体已删除。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    }
  };

  const replaceCover = async (item: MediaItem, file: File | null) => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    try {
      await api(`/api/admin/media/${item.id}/thumbnail`, { method: "POST", body: form });
      await load();
      showToast("视频封面已更新。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "封面更新失败。");
    }
  };

  const sync = async () => {
    try {
      const result = await api<{ updated: number; ratingsUpdated: number; message: string }>("/api/admin/matches/refresh");
      showToast(`同步完成：${result.updated} 场比赛，${result.ratingsUpdated} 条评分。`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "比赛同步失败。");
    }
  };

  return (
    <>
      <section className="border-b border-[#dcd2c3] bg-[#fffdf8]">
        <div className="page-wrap py-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Editorial workspace</p>
              <h1 className="display mt-3 text-5xl md:text-6xl">Keep the archive sound.</h1>
              <p className="mt-3 text-sm text-[#756e64]">Signed in as @{user.username} · {user.role}</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => void load()}>Refresh data</button>
          </div>
        </div>
      </section>
      <section className="page-wrap py-7">
        <div className="flex gap-1 overflow-x-auto border-b border-[#dcd2c3] pb-3">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`shrink-0 px-3 py-2 text-[9px] font-bold uppercase tracking-[.11em] ${tab === item ? "bg-[#394b60] text-[#fffdf8]" : "text-[#756e64] hover:bg-[#f7f3ea]"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {error ? <div className="error-box mt-5">{error}</div> : null}
        <div className="mt-7">
          {tab === "Overview" && summary ? <Overview summary={summary} media={media} reports={reports} /> : null}
          {tab === "Media queue" ? (
            <MediaQueue
              media={media}
              review={review}
              remove={deleteMedia}
              refresh={load}
              showToast={showToast}
              isAdmin={user.role === "admin"}
              replaceCover={replaceCover}
            />
          ) : null}
          {tab === "Articles" ? (
            <ArticleManager items={articles} refresh={load} showToast={showToast} setError={setError} />
          ) : null}
          {tab === "Matches" ? (
            <MatchManager items={matches} refresh={load} showToast={showToast} setError={setError} sync={sync} />
          ) : null}
          {tab === "Community" ? (
            <CommunityManager items={posts} refresh={load} showToast={showToast} setError={setError} />
          ) : null}
          {tab === "Reports" ? (
            <ReportManager items={reports} refresh={load} showToast={showToast} setError={setError} />
          ) : null}
          {tab === "Members" && user.role === "admin" ? (
            <MemberManager items={members} currentUserId={user.id} refresh={load} showToast={showToast} setError={setError} />
          ) : null}
          {tab === "Members" && user.role !== "admin" ? <div className="notice">只有管理员可以修改成员角色。</div> : null}
        </div>
      </section>
    </>
  );
}

function Overview({ summary, media, reports }: { summary: Summary; media: MediaItem[]; reports: Report[] }) {
  const cards = [
    [summary.stats.pending, "Pending review", "/admin"],
    [summary.stats.photos, "Public photos", "/photos"],
    [summary.stats.videos, "Public videos", "/videos"],
    [formatBytes(summary.stats.storageBytes), "Media storage", null],
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([value, label, href]) => (
          <div key={String(label)} className="paper-panel p-5">
            <p className="serif text-4xl">{value}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[#756e64]">{label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="paper-panel p-5">
          <div className="flex items-center justify-between"><p className="eyebrow">Needs attention</p><span className="source-badge">{summary.stats.pending} pending</span></div>
          <div className="mt-4 divide-y divide-[#dcd2c3]">
            {media.filter((item) => item.status === "pending").slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                <span className="truncate">{item.title} <span className="text-[#756e64]">· {item.kind}</span></span>
                <span className="source-badge demo">Pending</span>
              </div>
            ))}
            {!summary.stats.pending ? <p className="py-5 text-sm text-[#756e64]">Media queue is clear.</p> : null}
          </div>
        </div>
        <div className="paper-panel p-5">
          <p className="eyebrow">Operations</p>
          <dl className="mt-4 divide-y divide-[#dcd2c3] text-xs">
            <div className="flex justify-between py-3"><dt className="text-[#756e64]">Storage adapter</dt><dd>{summary.storageProvider}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-[#756e64]">Open reports</dt><dd>{reports.filter((item) => item.status === "open").length}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-[#756e64]">Last sync</dt><dd>{summary.syncLogs[0] ? formatDate(summary.syncLogs[0].started_at, { hour: "2-digit", minute: "2-digit" }) : "Never"}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-[#756e64]">Football provider</dt><dd>{summary.footballProvider}</dd></div>
          </dl>
        </div>
      </div>
      <div className="paper-panel p-5">
        <p className="eyebrow">Recent audit trail</p>
        <div className="mt-3 divide-y divide-[#dcd2c3]">
          {summary.audit.slice(0, 8).map((entry) => (
            <div key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-[11px]">
              <span><strong>{entry.action}</strong> · {entry.target_type}/{entry.target_id.slice(0, 16)}…</span>
              <span className="text-[#756e64]">{formatDate(entry.created_at, { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MediaQueue({
  media,
  review,
  remove,
  refresh,
  showToast,
  isAdmin,
  replaceCover,
}: {
  media: MediaItem[];
  review: (item: MediaItem, status: "approved" | "rejected") => Promise<void>;
  remove: (item: MediaItem) => Promise<void>;
  refresh: () => Promise<void>;
  showToast: (message: string) => void;
  isAdmin: boolean;
  replaceCover: (item: MediaItem, file: File | null) => Promise<void>;
}) {
  const [externalForm, setExternalForm] = useState(false);
  const submitExternal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/media", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      (event.target as HTMLFormElement).reset();
      setExternalForm(false);
      showToast("外部媒体已进入待审核队列。");
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "外部媒体提交失败。");
    }
  };
  const ordered = [...media].sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">Moderation queue</p><h2 className="serif mt-2 text-3xl">Photographs & videos</h2></div>
        <button type="button" className="button-secondary" onClick={() => setExternalForm((value) => !value)}>Add external video</button>
      </div>
      {externalForm ? (
        <form onSubmit={submitExternal} className="paper-panel mt-5 grid gap-3 p-5 sm:grid-cols-2">
          <input type="hidden" name="kind" value="video" />
          <div><label className="field-label">Title</label><input name="title" className="field" required /></div>
          <div><label className="field-label">External video URL</label><input name="externalUrl" type="url" className="field" required placeholder="https://" /></div>
          <div className="sm:col-span-2"><label className="field-label">Description</label><textarea name="description" className="field min-h-20" /></div>
          <div><label className="field-label">Category</label><input name="category" className="field" defaultValue="Interviews" /></div>
          <div><label className="field-label">Credit</label><input name="credit" className="field" /></div>
          <div className="sm:col-span-2"><label className="field-label">Rights / embed authorization</label><textarea name="rightsDeclaration" className="field min-h-20" required minLength={10} /></div>
          <button type="submit" className="button-primary justify-self-start">Submit external record</button>
        </form>
      ) : null}
      <div className="mt-6 space-y-3">
        {ordered.map((item) => (
          <article key={item.id} className="paper-panel grid gap-4 p-3 sm:grid-cols-[110px_1fr_auto] sm:items-center">
            <div className="aspect-[4/3] overflow-hidden bg-[#f7f3ea]">{item.thumbnailUrl || item.previewUrl ? <img src={item.thumbnailUrl || item.previewUrl || ""} alt="" className="h-full w-full object-cover" /> : null}</div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`source-badge ${item.status === "approved" ? "upload" : item.status === "rejected" ? "demo" : "external"}`}>{item.status}</span>
                <span className="source-badge">{item.sourceType}</span>
                <span className="text-[9px] uppercase tracking-widest text-[#756e64]">{item.kind} · {formatBytes(item.fileSize)}</span>
              </div>
              <h3 className="serif mt-2 text-xl">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-[#756e64]">{item.description}</p>
              <p className="mt-1 text-[9px] text-[#756e64]">@{item.uploader?.username || "deleted-user"} · {formatDate(item.createdAt)}</p>
              <details className="mt-2 text-[10px] text-[#756e64]"><summary className="cursor-pointer">Rights declaration</summary><p className="mt-1 leading-5">{item.rightsDeclaration}</p></details>
            </div>
            <div className="flex flex-wrap gap-2 sm:max-w-[260px] sm:justify-end">
              <Link href={`/${item.kind === "video" ? "videos" : "photos"}/${item.id}`} className="button-quiet" aria-label="Preview media"><EyeIcon width={14} height={14} /></Link>
              {item.status !== "approved" ? <button type="button" onClick={() => void review(item, "approved")} className="button-primary !min-h-9"><CheckIcon width={13} height={13} /> Approve</button> : null}
              {item.status !== "rejected" ? <button type="button" onClick={() => void review(item, "rejected")} className="button-quiet !min-h-9"><CloseIcon width={13} height={13} /> Reject</button> : null}
              {item.kind === "video" ? (
                <label className="button-quiet !min-h-9 cursor-pointer">
                  Cover
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => void replaceCover(item, event.target.files?.[0] || null)}
                  />
                </label>
              ) : null}
              {isAdmin ? <button type="button" onClick={() => void remove(item)} className="button-quiet !min-h-9 !text-[#843f45]">Delete</button> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ArticleManager({ items, refresh, showToast, setError }: { items: Article[]; refresh: () => Promise<void>; showToast: (message: string) => void; setError: (value: string) => void }) {
  const [editing, setEditing] = useState<Article | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(editing ? `/api/admin/articles/${editing.id}` : "/api/admin/articles", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      (event.target as HTMLFormElement).reset();
      setEditing(null);
      showToast(editing ? "文章已更新。" : "文章已发布。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "文章保存失败。");
    }
  };
  return (
    <div className="grid gap-8 xl:grid-cols-[400px_1fr]">
      <form onSubmit={submit} className="paper-panel self-start p-5">
        <p className="eyebrow">{editing ? "Editing article" : "New editorial record"}</p>
        <h2 className="serif mt-2 text-3xl">{editing ? "Update words" : "Publish words"}</h2>
        <div className="mt-5 grid gap-3">
          <div><label className="field-label">Title</label><input name="title" className="field" required defaultValue={editing?.title} /></div>
          <div><label className="field-label">Dek / summary</label><textarea name="dek" className="field min-h-16" defaultValue={editing?.dek} /></div>
          <div><label className="field-label">Body</label><textarea name="body" className="field min-h-56" required defaultValue={editing?.body} /></div>
          <div><label className="field-label">Type</label><select name="type" className="field" defaultValue={editing?.type || "original"}><option value="original">Original</option><option value="interview">Interview</option><option value="news">News</option><option value="translation">Translation</option></select></div>
          <div className="grid grid-cols-2 gap-2"><div><label className="field-label">Original language</label><input name="originalLanguage" className="field" defaultValue={editing?.originalLanguage || "en"} /></div><div><label className="field-label">Translation language</label><input name="translationLanguage" className="field" defaultValue={editing?.translationLanguage || ""} /></div></div>
          <div><label className="field-label">Source name</label><input name="sourceName" className="field" defaultValue={editing?.sourceName || ""} /></div>
          <div><label className="field-label">Source URL</label><input name="sourceUrl" type="url" className="field" defaultValue={editing?.sourceUrl || ""} /></div>
          <div><label className="field-label">Cover URL</label><input name="coverUrl" type="url" className="field" defaultValue={editing?.coverUrl || ""} /></div>
          <div><label className="field-label">Tags</label><input name="tags" className="field" defaultValue={editing?.tags.join(", ") || ""} /></div>
        </div>
        <div className="mt-4 flex gap-2"><button type="submit" className="button-primary">{editing ? "Save changes" : "Publish"}</button>{editing ? <button type="button" className="button-quiet" onClick={() => setEditing(null)}>Cancel</button> : null}</div>
      </form>
      <div className="divide-y divide-[#dcd2c3] border-y border-[#dcd2c3]">
        {items.map((article) => (
          <div key={article.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div><div className="flex gap-2"><span className="source-badge">{article.type}</span>{article.isDemo ? <span className="source-badge demo">Demo</span> : null}</div><h3 className="serif mt-2 text-xl">{article.title}</h3><p className="text-[9px] text-[#756e64]">{formatDate(article.publishedAt)} · {article.sourceName || "No source"}</p></div>
            <div className="flex gap-2"><Link href={`/interviews/${article.id}`} className="button-quiet">View</Link><button type="button" className="button-quiet" onClick={() => setEditing(article)}>Edit</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchManager({ items, refresh, showToast, setError, sync }: { items: Match[]; refresh: () => Promise<void>; showToast: (message: string) => void; setError: (value: string) => void; sync: () => Promise<void> }) {
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/admin/matches", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      (event.target as HTMLFormElement).reset();
      showToast("比赛记录已添加。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "比赛保存失败。");
    }
  };
  return (
    <div className="grid gap-8 xl:grid-cols-[400px_1fr]">
      <div className="space-y-4 self-start">
        <form onSubmit={submit} className="paper-panel p-5">
          <p className="eyebrow">Manual fixture</p><h2 className="serif mt-2 text-3xl">Add a match</h2>
          <div className="mt-4 grid gap-3">
            <div><label className="field-label">Competition</label><input name="competition" className="field" required defaultValue="Bundesliga" /></div>
            <div><label className="field-label">Tracked team</label><input name="trackedTeam" className="field" defaultValue="Bayern München" /></div>
            <div><label className="field-label">Opponent</label><input name="opponent" className="field" required /></div>
            <div><label className="field-label">Date & time</label><input name="matchDate" type="datetime-local" className="field" required /></div>
            <div><label className="field-label">Venue</label><input name="venue" className="field" /></div>
            <div className="grid grid-cols-3 gap-2"><div><label className="field-label">Home</label><input name="homeScore" type="number" min="0" className="field" /></div><div><label className="field-label">Away</label><input name="awayScore" type="number" min="0" className="field" /></div><div><label className="field-label">Status</label><select name="status" className="field"><option value="scheduled">Scheduled</option><option value="finished">Finished</option><option value="in_play">In play</option></select></div></div>
            <div><label className="field-label">Home / away</label><select name="homeAway" className="field"><option value="home">Home</option><option value="away">Away</option><option value="neutral">Neutral</option></select></div>
          </div>
          <button type="submit" className="button-primary mt-4">Add manual record</button>
        </form>
        <div className="border border-[#dcd2c3] bg-[#f7f3ea] p-5">
          <p className="eyebrow">Automatic sync</p><p className="mt-2 text-xs leading-6 text-[#756e64]">优先使用 API-Football 同步赛程、比分与基米希评分；未配置时可用 football-data.org 同步比分，但不会有球员评分。</p>
          <button type="button" className="button-secondary mt-3 w-full" onClick={() => void sync()}>Sync scores &amp; ratings</button>
        </div>
      </div>
      <div className="divide-y divide-[#dcd2c3] border-y border-[#dcd2c3]">
        {items.map((match) => (
          <div key={match.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div><div className="flex gap-2"><span className="source-badge">{match.sourceType}</span><span className="text-[9px] uppercase tracking-widest text-[#756e64]">{match.status}</span></div><h3 className="serif mt-2 text-xl">{match.trackedTeam} vs {match.opponent}</h3><p className="text-[9px] text-[#756e64]">{match.competition} · {formatDate(match.matchDate)}</p></div>
            <div className="border border-[#dcd2c3] px-3 py-2 text-center font-serif text-xl">{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommunityManager({ items, refresh, showToast, setError }: { items: Post[]; refresh: () => Promise<void>; showToast: (message: string) => void; setError: (value: string) => void }) {
  const setStatus = async (post: Post, status: "published" | "hidden") => {
    try {
      await api(`/api/admin/posts/${post.id}`, { method: "POST", body: JSON.stringify({ status }) });
      await refresh();
      showToast(`帖子已设为 ${status}。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "帖子状态更新失败。");
    }
  };
  return (
    <div>
      <p className="eyebrow">Community moderation</p><h2 className="serif mt-2 text-3xl">Posts & comments</h2>
      <div className="mt-6 divide-y divide-[#dcd2c3] border-y border-[#dcd2c3]">
        {items.map((post) => (
          <div key={post.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div><div className="flex flex-wrap gap-2"><span className={`source-badge ${post.status === "published" ? "upload" : "demo"}`}>{post.status}</span><span className="text-[9px] text-[#756e64]">@{post.author.username} · {formatDate(post.createdAt)}</span></div><h3 className="serif mt-2 text-xl">{post.title}</h3><p className="mt-1 line-clamp-2 text-xs text-[#756e64]">{post.body}</p><p className="mt-1 text-[9px] text-[#756e64]">{post.commentCount} comments · {post.favoriteCount} favorites</p></div>
            <button type="button" className="button-quiet" onClick={() => void setStatus(post, post.status === "published" ? "hidden" : "published")}>{post.status === "published" ? "Hide post" : "Restore post"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportManager({ items, refresh, showToast, setError }: { items: Report[]; refresh: () => Promise<void>; showToast: (message: string) => void; setError: (value: string) => void }) {
  const act = async (report: Report, status: "resolved" | "dismissed") => {
    try {
      await api(`/api/admin/reports/${report.id}`, { method: "POST", body: JSON.stringify({ status }) });
      await refresh();
      showToast("举报状态已更新。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "举报处理失败。");
    }
  };
  return (
    <div>
      <p className="eyebrow">Trust & safety</p><h2 className="serif mt-2 text-3xl">Reports</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((report) => (
          <article key={report.id} className="paper-panel p-5">
            <div className="flex items-center justify-between"><span className={`source-badge ${report.status === "open" ? "demo" : "upload"}`}>{report.status}</span><span className="text-[9px] text-[#756e64]">{formatDate(report.createdAt)}</span></div>
            <h3 className="serif mt-3 text-xl">{report.reason}</h3>
            <p className="mt-2 text-xs leading-6 text-[#756e64]">{report.details}</p>
            <p className="mt-2 break-all text-[9px] text-[#756e64]">Target: {report.targetType}/{report.targetId}</p>
            {report.status === "open" ? <div className="mt-4 flex gap-2"><button type="button" className="button-primary !min-h-9" onClick={() => void act(report, "resolved")}>Resolve</button><button type="button" className="button-quiet !min-h-9" onClick={() => void act(report, "dismissed")}>Dismiss</button></div> : null}
          </article>
        ))}
        {!items.length ? <div className="notice">No reports have been submitted.</div> : null}
      </div>
    </div>
  );
}

function MemberManager({ items, currentUserId, refresh, showToast, setError }: { items: PublicUser[]; currentUserId: string; refresh: () => Promise<void>; showToast: (message: string) => void; setError: (value: string) => void }) {
  const setRole = async (member: PublicUser, role: string) => {
    try {
      await api(`/api/admin/users/${member.id}/role`, { method: "POST", body: JSON.stringify({ role }) });
      await refresh();
      showToast("成员角色已更新。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "角色更新失败。");
    }
  };
  return (
    <div>
      <p className="eyebrow">Access control</p><h2 className="serif mt-2 text-3xl">Members</h2>
      <div className="mt-6 divide-y divide-[#dcd2c3] border-y border-[#dcd2c3]">
        {items.map((member) => (
          <div key={member.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_170px] sm:items-center">
            <div><Link href={`/users/${member.username}`} className="text-sm font-bold">@{member.username}</Link><p className="text-xs text-[#756e64]">{member.displayName} · {member.email} · joined {formatDate(member.createdAt)}</p></div>
            <select className="field" value={member.role} disabled={member.id === currentUserId} onChange={(event) => void setRole(member, event.target.value)}><option value="member">Member</option><option value="editor">Editor</option><option value="admin">Admin</option></select>
          </div>
        ))}
      </div>
    </div>
  );
}
