"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { CommentSection, FavoriteButton } from "./comment-section";
import { ArrowUpRight, FlagIcon, PlayIcon, TrashIcon } from "./icons";
import { api, formatBytes, formatDate } from "@/lib/client";
import type { MediaItem } from "@/lib/types";

export function MediaDetail({ id }: { id: string }) {
  const { user, showToast } = useAuth();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [error, setError] = useState("");
  const [playExternal, setPlayExternal] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    api<{ item: MediaItem }>(`/api/media/${id}`)
      .then((payload) => setItem(payload.item))
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="page-wrap py-20">
        <div className="paper-panel p-10 text-center">
          <h1 className="serif text-4xl">Record unavailable</h1>
          <p className="mt-3 text-sm text-[#756e64]">{error}</p>
          <Link href="/photos" className="button-primary mt-6">Return to the archive</Link>
        </div>
      </div>
    );
  }
  if (!item) return <div className="page-wrap py-16"><div className="skeleton min-h-[70vh] border border-[#dcd2c3]" /></div>;

  const sourceLabel = item.isDemo
    ? "Bundled demonstration artwork"
    : item.sourceType === "upload"
      ? "Original file uploaded to this archive"
      : "External media link";

  const report = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      showToast("登录后可以提交版权或社区举报。");
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType: "media",
          targetId: item.id,
          reason: form.get("reason"),
          details: form.get("details"),
        }),
      });
      setReporting(false);
      showToast("举报已提交，编辑会进行核查。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "举报提交失败。");
    }
  };

  const remove = async () => {
    if (!window.confirm("永久删除这条媒体记录及文件？此操作不能撤销。")) return;
    try {
      await api(`/api/media/${id}`, { method: "DELETE" });
      window.location.href = item.kind === "video" ? "/videos" : "/photos";
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    }
  };

  return (
    <article>
      <div className="border-b border-[#dcd2c3]">
        <div className="page-wrap flex flex-wrap items-center justify-between gap-3 py-3 text-[9px] font-bold uppercase tracking-[.15em] text-[#756e64]">
          <div className="flex items-center gap-3">
            <Link href={item.kind === "video" ? "/videos" : "/photos"} className="hover:text-[#394b60]">
              ← {item.kind === "video" ? "Video archive" : "Photo archive"}
            </Link>
            <span>/</span>
            <span>{item.category}</span>
          </div>
          <span>{item.sourceType === "upload" ? `File · ${formatBytes(item.fileSize)}` : sourceLabel}</span>
        </div>
      </div>
      <div className="page-wrap grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-12">
        <div>
          <div className="paper-panel overflow-hidden">
            {item.kind === "image" ? (
              <div className="grid min-h-[360px] max-h-[78vh] place-items-center bg-[#f7f3ea] p-3 sm:p-6">
                <img src={item.previewUrl || ""} alt={item.title} className="max-h-[72vh] w-auto max-w-full object-contain" />
              </div>
            ) : item.sourceType === "upload" ? (
              <div className="bg-[#2e2b27]">
                <video
                  key={item.id}
                  controls
                  preload="metadata"
                  playsInline
                  poster={item.thumbnailUrl || undefined}
                  className="mx-auto aspect-video max-h-[78vh] w-full bg-black object-contain"
                >
                  <source src={item.previewUrl || ""} type={item.mimeType || undefined} />
                  你的浏览器不支持 HTML5 视频播放。
                </video>
              </div>
            ) : item.sourceType === "external" && !playExternal ? (
              <button
                type="button"
                className="relative grid aspect-video w-full place-items-center overflow-hidden bg-[#eaf1f7]"
                onClick={() => setPlayExternal(true)}
              >
                <span className="grid h-20 w-20 place-items-center rounded-full bg-[#394b60] text-[#fffdf8]"><PlayIcon width={28} height={28} /></span>
                <span className="absolute bottom-4 left-4 border border-[#dcd2c3] bg-[#fffdf8]/90 px-3 py-2 text-[9px] font-bold uppercase tracking-[.14em]">
                  Load external video
                </span>
              </button>
            ) : (
              <div className="p-8 text-center">
                <p className="serif text-3xl">This film is hosted externally.</p>
                <p className="mt-3 text-sm text-[#756e64]">The archive does not proxy or redistribute third-party video.</p>
                <a href={item.previewUrl || "#"} target="_blank" rel="noreferrer noopener" className="button-primary mt-6">
                  Open original source <ArrowUpRight width={15} height={15} />
                </a>
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[9px] font-semibold uppercase tracking-[.12em] text-[#756e64]">
            <span className={`source-badge ${item.sourceType}`}>{sourceLabel}</span>
            {item.isDemo ? <span className="source-badge demo">Demo · not historical material</span> : null}
            {item.mimeType ? <span>{item.mimeType}</span> : null}
            {item.fileSize ? <span>{formatBytes(item.fileSize)}</span> : null}
          </div>
        </div>

        <aside className="lg:pt-2">
          <p className="eyebrow">Archive record · {item.category}</p>
          <h1 className="serif mt-4 text-[clamp(2.6rem,5vw,4.8rem)] leading-[.98] tracking-[-.04em]">{item.title}</h1>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-[#756e64]">{item.description}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <FavoriteButton targetType="media" targetId={item.id} />
            <button type="button" className="button-quiet" onClick={() => setReporting((value) => !value)}>
              <FlagIcon width={14} height={14} /> Report rights issue
            </button>
            {user && (user.id === item.uploader?.id || user.role === "admin") ? (
              <button type="button" className="button-quiet !text-[#843f45]" onClick={remove}>
                <TrashIcon width={14} height={14} /> Delete
              </button>
            ) : null}
          </div>
          {reporting ? (
            <form onSubmit={report} className="mt-4 border border-[#dcd2c3] bg-[#fffdf8] p-4">
              <label className="field-label" htmlFor="report-reason">Reason</label>
              <select id="report-reason" name="reason" className="field">
                <option>Copyright or permission concern</option>
                <option>Misleading attribution or date</option>
                <option>Privacy concern</option>
                <option>Community guideline issue</option>
              </select>
              <label className="field-label mt-3" htmlFor="report-details">Details</label>
              <textarea id="report-details" name="details" className="field min-h-20" required />
              <button type="submit" className="button-primary mt-3 w-full">Submit report</button>
            </form>
          ) : null}
          <dl className="mt-7 divide-y divide-[#dcd2c3] border-y border-[#dcd2c3] text-xs">
            {[
              ["Added", formatDate(item.createdAt)],
              ["Published", formatDate(item.publishedAt)],
              ["Contributor", item.uploader ? `@${item.uploader.username}` : "Archive team"],
              ["Credit", item.credit || "Not supplied"],
              ["Tags", item.tags.length ? item.tags.join(", ") : "None"],
            ].map(([term, value]) => (
              <div key={term} className="grid grid-cols-[92px_1fr] gap-3 py-3">
                <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#756e64]">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            {item.sourceType === "external" ? (
              <div className="grid grid-cols-[92px_1fr] gap-3 py-3">
                <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#756e64]">Source</dt>
                <dd><a href={item.previewUrl || "#"} target="_blank" rel="noreferrer noopener" className="line-link text-[#394b60]">External link</a></dd>
              </div>
            ) : null}
            {item.sourceUrl ? (
              <div className="grid grid-cols-[92px_1fr] gap-3 py-3">
                <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#756e64]">Canonical</dt>
                <dd><a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="break-all underline">Source reference</a></dd>
              </div>
            ) : null}
          </dl>
          <details className="mt-5 border border-[#dcd2c3] bg-[#f7f3ea] p-4">
            <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-[.12em] text-[#756e64]">Rights declaration</summary>
            <p className="mt-3 text-xs leading-6 text-[#756e64]">{item.rightsDeclaration || "No rights declaration was supplied."}</p>
          </details>
        </aside>
      </div>
      <div className="page-wrap">
        <CommentSection targetType="media" targetId={item.id} allowComments={item.allowComments} />
      </div>
    </article>
  );
}
