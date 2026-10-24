"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { CommentSection } from "./comment-section";
import { PageHero } from "./page-hero";
import { FlagIcon, HeartIcon, MessageIcon, TrashIcon, UploadIcon } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { MediaItem, Post } from "@/lib/types";

export function CommunityView() {
  const { user, showToast } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openDiscussion, setOpenDiscussion] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [postPayload, mediaPayload] = await Promise.all([
        api<{ items: Post[] }>("/api/posts"),
        api<{ items: MediaItem[] }>("/api/media?limit=60"),
      ]);
      setPosts(postPayload.items);
      setMedia(mediaPayload.items.filter((item) => item.allowComments));
    } catch (err) {
      setError(err instanceof Error ? err.message : "社区内容载入失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/posts", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      event.currentTarget.reset();
      setComposing(false);
      showToast("帖子已发布。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const favorite = async (post: Post) => {
    if (!user) {
      showToast("登录后可以收藏帖子。");
      return;
    }
    try {
      await api(post.isFavorited ? `/api/favorites/post/${post.id}` : "/api/favorites", {
        method: post.isFavorited ? "DELETE" : "POST",
        body: post.isFavorited ? undefined : JSON.stringify({ targetType: "post", targetId: post.id }),
      });
      setPosts((items) =>
        items.map((item) =>
          item.id === post.id
            ? { ...item, isFavorited: !item.isFavorited, favoriteCount: item.favoriteCount + (item.isFavorited ? -1 : 1) }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "收藏失败。");
    }
  };

  const remove = async (post: Post) => {
    if (!window.confirm("永久删除这条帖子？")) return;
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE" });
      await load();
      showToast("帖子已删除。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
    }
  };

  const report = async (post: Post) => {
    if (!user) {
      showToast("登录后可以举报帖子。");
      return;
    }
    const details = window.prompt("请简要说明举报原因：");
    if (!details) return;
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({ targetType: "post", targetId: post.id, reason: "Community report", details }),
      });
      showToast("举报已提交。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "举报失败。");
    }
  };

  return (
    <>
      <PageHero
        number="06"
        eyebrow="The community stand"
        title="Leave a note in the margin."
        description="Publish fan observations, link reviewed archive media, and discuss records with context. Posts and replies are attributable to signed-in members."
      >
        {user ? (
          <button type="button" className="button-primary" onClick={() => setComposing((value) => !value)}>
            {composing ? "Close composer" : "Start a post"}
          </button>
        ) : (
          <Link href="/register" className="button-primary">Join the community</Link>
        )}
      </PageHero>
      <section className="page-wrap grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {composing && user ? (
            <form onSubmit={publish} className="paper-panel mb-7 p-5 sm:p-6">
              <p className="eyebrow">New community note</p>
              <div className="mt-4 grid gap-4">
                <div>
                  <label className="field-label" htmlFor="post-title">Heading</label>
                  <input id="post-title" name="title" className="field" required minLength={3} maxLength={120} placeholder="A short observation" />
                </div>
                <div>
                  <label className="field-label" htmlFor="post-body">Note</label>
                  <textarea id="post-body" name="body" className="field min-h-36" required minLength={3} maxLength={5000} placeholder="Share a thought, memory or correction…" />
                </div>
                <div>
                  <label className="field-label" htmlFor="post-media">Attach reviewed media · optional</label>
                  <select id="post-media" name="mediaId" className="field">
                    <option value="">No attachment</option>
                    {media.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.kind}</option>)}
                  </select>
                  <p className="mt-2 text-[10px] text-[#756e64]">Only approved archive media can be linked. <Link href="/photos?upload=1" className="underline">Upload a new file</Link>.</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t border-[#dcd2c3] pt-4">
                <button type="button" className="button-quiet" onClick={() => setComposing(false)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={submitting}>{submitting ? "Publishing…" : "Publish post"}</button>
              </div>
            </form>
          ) : null}
          {error ? <div className="error-box mb-5">{error}</div> : null}
          <div className="space-y-6">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-64" />)
              : posts.map((post, index) => (
                  <article key={post.id} className="archive-card p-5 sm:p-7">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dce8f3] text-xs font-bold text-[#394b60]">
                        {post.author.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/users/${post.author.username}`} className="text-xs font-bold">@{post.author.username}</Link>
                            <span className="text-[9px] text-[#756e64]">{formatDate(post.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            {post.isDemo ? <span className="source-badge demo">Demo post</span> : <span className="source-badge upload">Community</span>}
                          </div>
                          <span className="serif text-2xl text-[#394b60]/18">{String(index + 1).padStart(2, "0")}</span>
                        </div>
                        <h2 className="serif mt-4 text-3xl leading-tight">{post.title}</h2>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#5d564d]">{post.body}</p>
                        {post.media.length ? (
                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            {post.media.map((item) => (
                              <Link href={`/${item.kind === "video" ? "videos" : "photos"}/${item.id}`} key={item.id} className="group flex items-center gap-3 border border-[#dcd2c3] bg-[#f7f3ea] p-2">
                                <img src={item.thumbnailUrl || item.previewUrl || ""} alt="" className="h-16 w-20 object-cover" />
                                <span>
                                  <span className="block text-[8px] font-bold uppercase tracking-widest text-[#756e64]">Linked {item.kind}</span>
                                  <span className="serif mt-1 block text-sm group-hover:text-[#394b60]">{item.title}</span>
                                </span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#dcd2c3] pt-4">
                          <button type="button" onClick={() => void favorite(post)} className={`button-quiet ${post.isFavorited ? "!border-[#394b60] !text-[#394b60]" : ""}`}>
                            <HeartIcon width={13} height={13} /> {post.favoriteCount}
                          </button>
                          <button type="button" onClick={() => setOpenDiscussion(openDiscussion === post.id ? null : post.id)} className="button-quiet">
                            <MessageIcon width={13} height={13} /> {post.commentCount} replies
                          </button>
                          <button type="button" onClick={() => void report(post)} className="button-quiet">
                            <FlagIcon width={13} height={13} /> Report
                          </button>
                          {user && (user.id === post.author.id || user.role === "admin") ? (
                            <button type="button" onClick={() => void remove(post)} className="button-quiet !text-[#843f45]">
                              <TrashIcon width={13} height={13} /> Delete
                            </button>
                          ) : null}
                        </div>
                        {openDiscussion === post.id ? <div className="mt-6"><CommentSection targetType="post" targetId={post.id} /></div> : null}
                      </div>
                    </div>
                  </article>
                ))}
          </div>
        </div>
        <aside className="space-y-5 self-start lg:sticky lg:top-28">
          <div className="paper-panel p-5">
            <p className="eyebrow">House notes</p>
            <h2 className="serif mt-3 text-2xl">Watch closely. Cite carefully.</h2>
            <ul className="mt-4 space-y-3 text-xs leading-6 text-[#756e64]">
              <li>Name the match, season or publication when you can.</li>
              <li>Label speculation as speculation.</li>
              <li>Do not repost full broadcast footage.</li>
              <li>Use the report control for rights or conduct concerns.</li>
            </ul>
          </div>
          <div className="border border-[#394b60] bg-[#394b60] p-5 text-[#fffdf8]">
            <UploadIcon width={20} height={20} />
            <h2 className="serif mt-3 text-2xl">Have a file?</h2>
            <p className="mt-2 text-xs leading-6 text-[#dce8f3]">Upload photographs or video to the review queue. Approved media can then be linked to a community note.</p>
            <Link href="/photos?upload=1" className="button-secondary mt-4 !border-[#fffdf8] !text-[#fffdf8]">Submit media</Link>
          </div>
        </aside>
      </section>
    </>
  );
}
