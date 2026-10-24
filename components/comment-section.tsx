"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { FlagIcon, HeartIcon, MessageIcon, TrashIcon } from "./icons";
import { api, formatDate } from "@/lib/client";
import type { Comment } from "@/lib/types";

export function CommentSection({
  targetType,
  targetId,
  allowComments = true,
}: {
  targetType: "media" | "article" | "post" | "match";
  targetId: string;
  allowComments?: boolean;
}) {
  const { user, showToast } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await api<{ items: Comment[] }>(
        `/api/comments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`,
      );
      setComments(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论载入失败。");
    }
  }, [targetId, targetType]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");
    try {
      await api("/api/comments", {
        method: "POST",
        body: JSON.stringify({
          targetType,
          targetId,
          parentId: replyTo?.id || null,
          body: text,
        }),
      });
      setText("");
      setReplyTo(null);
      showToast("评论已发布。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论发布失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (comment: Comment) => {
    if (!window.confirm("删除这条评论及其回复？")) return;
    try {
      await api(`/api/comments/${comment.id}`, { method: "DELETE" });
      await load();
      showToast("评论已删除。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法删除评论。");
    }
  };

  const report = async (comment: Comment) => {
    if (!user) {
      showToast("登录后可以举报评论。");
      return;
    }
    const details = window.prompt("请简要说明举报原因：");
    if (!details) return;
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType: "comment",
          targetId: comment.id,
          reason: "Community guideline report",
          details,
        }),
      });
      showToast("举报已提交给编辑。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "举报提交失败。");
    }
  };

  return (
    <section className="border-t border-[#dcd2c3] pt-8" aria-labelledby="comments-heading">
      <div className="flex items-center justify-between">
        <h2 id="comments-heading" className="serif text-3xl">Conversation</h2>
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.13em] text-[#756e64]">
          <MessageIcon width={13} height={13} /> {comments.length} threads
        </span>
      </div>
      {!allowComments ? (
        <p className="notice mt-5">该媒体的评论区已关闭。</p>
      ) : user ? (
        <form onSubmit={submit} className="mt-5 border border-[#dcd2c3] bg-[#fffdf8] p-4">
          {replyTo ? (
            <div className="mb-3 flex items-center justify-between bg-[#f7f3ea] px-3 py-2 text-[10px] text-[#756e64]">
              <span>Replying to @{replyTo.author.username}</span>
              <button type="button" className="underline" onClick={() => setReplyTo(null)}>Cancel</button>
            </div>
          ) : null}
          <label htmlFor="comment-body" className="field-label">
            {replyTo ? "Write a reply" : "Add to the conversation"}
          </label>
          <textarea
            id="comment-body"
            className="field min-h-24"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            required
            placeholder="Add context, a correction or a thoughtful response…"
          />
          <div className="mt-3 flex justify-between gap-3">
            <span className="text-[9px] text-[#756e64]">公开显示 · 请保持尊重</span>
            <button type="submit" className="button-primary !min-h-9" disabled={submitting || !text.trim()}>
              {submitting ? "Publishing…" : replyTo ? "Post reply" : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <div className="notice mt-5">
          <Link href={`/login?next=${encodeURIComponent("/")}`} className="font-semibold text-[#394b60] underline">Sign in</Link>
          {" "}or <Link href="/register" className="font-semibold text-[#394b60] underline">create an account</Link> to join the discussion.
        </div>
      )}
      {error ? <div className="error-box mt-4" role="alert">{error}</div> : null}
      <div className="mt-7 divide-y divide-[#dcd2c3]">
        {comments.map((comment) => (
          <CommentNode
            key={comment.id}
            comment={comment}
            currentUser={user}
            onReply={(value) => {
              setReplyTo(value);
              document.getElementById("comment-body")?.focus();
            }}
            onDelete={remove}
            onReport={report}
          />
        ))}
        {comments.length === 0 ? <p className="py-8 text-center text-sm text-[#756e64]">No comments yet. Start with something worth keeping.</p> : null}
      </div>
    </section>
  );
}

function CommentNode({
  comment,
  currentUser,
  onReply,
  onDelete,
  onReport,
  nested = false,
}: {
  comment: Comment;
  currentUser: ReturnType<typeof useAuth>["user"];
  onReply: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
  onReport: (comment: Comment) => void;
  nested?: boolean;
}) {
  return (
    <article className={`py-5 ${nested ? "ml-5 border-l border-[#dcd2c3] pl-5 sm:ml-10" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dce8f3] text-xs font-bold text-[#394b60]">
          {comment.author.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/users/${comment.author.username}`} className="text-xs font-bold">@{comment.author.username}</Link>
            <span className="text-[9px] text-[#756e64]">{formatDate(comment.createdAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            {comment.author.role !== "member" ? <span className="source-badge">Team</span> : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#514a40]">{comment.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] font-semibold text-[#756e64]">
            <button type="button" onClick={() => onReply(comment)} className="hover:text-[#394b60]">Reply</button>
            <button type="button" onClick={() => onReport(comment)} className="flex items-center gap-1 hover:text-[#394b60]"><FlagIcon width={11} height={11} /> Report</button>
            {currentUser && (currentUser.id === comment.author.id || currentUser.role === "admin") ? (
              <button type="button" onClick={() => onDelete(comment)} className="flex items-center gap-1 hover:text-[#843f45]"><TrashIcon width={11} height={11} /> Delete</button>
            ) : null}
          </div>
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              onReply={onReply}
              onDelete={onDelete}
              onReport={onReport}
              nested
            />
          ))}
        </div>
      </div>
    </article>
  );
}

export function FavoriteButton({ targetType, targetId }: { targetType: string; targetId: string }) {
  const { user, showToast } = useAuth();
  const [active, setActive] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ items: any[] }>("/api/favorites")
      .then((payload) => {
        const match = payload.items.find((item) => item.target_type === targetType && item.target_id === targetId);
        setActive(Boolean(match));
      })
      .catch(() => {});
  }, [targetId, targetType, user]);

  const toggle = async () => {
    if (!user) {
      showToast("登录后可以收藏档案。");
      return;
    }
    setBusy(true);
    try {
      await api(active ? `/api/favorites/${targetType}/${targetId}` : "/api/favorites", {
        method: active ? "DELETE" : "POST",
        body: active ? undefined : JSON.stringify({ targetType, targetId }),
      });
      setActive(!active);
      setCount((value) => value + (active ? -1 : 1));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "收藏操作失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={active ? "button-primary" : "button-secondary"} onClick={toggle} disabled={busy}>
      <HeartIcon width={15} height={15} /> {active ? "Saved" : "Save"} {count ? `· ${count}` : ""}
    </button>
  );
}
