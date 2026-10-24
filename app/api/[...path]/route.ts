import Busboy from "busboy";
import { Readable } from "node:stream";
import { stat, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  audit,
  createMediaRecord,
  getDb,
  getStats,
  isoNow,
  listComments,
  listReports,
  mapArticle,
  mapMatch,
  mapMedia,
  mapPost,
  mapUser,
  publicUserById,
  publicUserByUsername,
  safeJson,
  setReviewStatus,
} from "@/lib/db";
import {
  authenticate,
  changePassword,
  clearSessionCookie,
  createUser,
  destroySession,
  getViewer,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";
import { assertSameOrigin, handleApiError, HttpError, json, readJson, requireRole, requireUser } from "@/lib/http";
import { inspectAndSanitizeMedia, LIMITS } from "@/lib/media-validation";
import { consumeRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";
import {
  footballApiEnabled,
  footballApiProvider,
  ratingSummary,
  syncMatches,
} from "@/lib/matches-service";
import { cleanText, createSessionToken, hashPassword, hashToken, newId, parseTags } from "@/lib/security";
import type { MediaKind, ReviewStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { path: segments } = await context.params;
    const route = segments.join("/");
    const viewer = getViewer(request);
    const db = getDb();
    const url = new URL(request.url);

    if (route === "health") {
      return json({
        ok: true,
        service: "kimmich-archive",
        footballProvider: footballApiProvider(),
        time: isoNow(),
      });
    }

    if (route === "bootstrap") {
      const featured = db
        .prepare("SELECT * FROM media_items WHERE status='approved' ORDER BY is_demo ASC, published_at DESC LIMIT 3")
        .all() as any[];
      const articles = db
        .prepare("SELECT * FROM articles WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 3")
        .all() as any[];
      const matches = db
        .prepare("SELECT * FROM matches ORDER BY match_date DESC LIMIT 4")
        .all() as any[];
      const posts = db
        .prepare("SELECT * FROM posts WHERE status='published' ORDER BY created_at DESC LIMIT 3")
        .all() as any[];
      return json({
        featuredMedia: featured.map((row) => mapMedia(row, viewer)),
        latestArticles: articles.map(mapArticle),
        recentMatches: matches.map(mapMatch),
        recentPosts: posts.map((row) => mapPost(row, viewer)),
        stats: getStats(),
        footballApiEnabled: footballApiEnabled(),
        footballProvider: footballApiProvider(),
        storageProvider: getStorage().name,
      });
    }

    if (route === "auth/me") {
      return json({ user: viewer });
    }

    if (route === "media") {
      const mine = url.searchParams.get("mine") === "1";
      if (mine && !viewer) throw new HttpError("请先登录。", 401);
      const kind = url.searchParams.get("kind");
      const category = url.searchParams.get("category");
      const query = cleanText(url.searchParams.get("q"), 100);
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 24));
      const clauses: string[] = [];
      const params: any[] = [];
      if (mine) {
        clauses.push("uploader_id=?");
        params.push(viewer!.id);
      } else {
        clauses.push("status='approved'");
      }
      if (kind === "image" || kind === "video") {
        clauses.push("kind=?");
        params.push(kind);
      }
      if (category) {
        clauses.push("category=?");
        params.push(cleanText(category, 50));
      }
      if (query) {
        clauses.push("(title LIKE ? OR description LIKE ? OR tags_json LIKE ?)");
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
      }
      const where = clauses.join(" AND ");
      const rows = db
        .prepare(
          `SELECT * FROM media_items WHERE ${where} ORDER BY
           CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
           COALESCE(published_at,created_at) DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, (page - 1) * limit) as any[];
      const total = Number(
        (db.prepare(`SELECT COUNT(*) AS n FROM media_items WHERE ${where}`).get(...params) as any).n,
      );
      return json({ items: rows.map((row) => mapMedia(row, viewer)), page, limit, total });
    }

    if (segments[0] === "media" && segments[1] && (segments[2] === "file" || segments[2] === "thumbnail")) {
      return await serveMediaFile(request, segments[1], segments[2], viewer);
    }

    if (segments[0] === "media" && segments[1] && segments.length === 2) {
      const row = db.prepare("SELECT * FROM media_items WHERE id=?").get(segments[1]) as any;
      if (!row) throw new HttpError("媒体记录不存在。", 404);
      const canView =
        row.status === "approved" || (viewer && (viewer.id === row.uploader_id || viewer.role === "admin"));
      if (!canView) throw new HttpError("该媒体尚未通过审核。", 404);
      return json({ item: mapMedia(row, viewer) });
    }

    if (route === "articles") {
      const type = url.searchParams.get("type");
      const query = cleanText(url.searchParams.get("q"), 100);
      const clauses = ["published_at IS NOT NULL"];
      const params: any[] = [];
      if (["interview", "news", "original", "translation"].includes(type || "")) {
        clauses.push("type=?");
        params.push(type);
      }
      if (query) {
        clauses.push("(title LIKE ? OR deck LIKE ? OR body LIKE ? OR dek LIKE ?)");
        params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
      }
      const rows = db
        .prepare(`SELECT * FROM articles WHERE ${clauses.join(" AND ")} ORDER BY published_at DESC`)
        .all(...params) as any[];
      return json({ items: rows.map(mapArticle) });
    }

    if (segments[0] === "articles" && segments[1]) {
      const row = db.prepare("SELECT * FROM articles WHERE id=? OR slug=?").get(segments[1], segments[1]) as any;
      if (!row || (!row.published_at && viewer?.role !== "admin")) throw new HttpError("文章不存在。", 404);
      return json({ item: mapArticle(row) });
    }

    if (route === "matches") {
      const status = url.searchParams.get("status");
      const competition = url.searchParams.get("competition");
      const clauses: string[] = [];
      const params: any[] = [];
      if (status) {
        clauses.push("status=?");
        params.push(status);
      }
      if (competition) {
        clauses.push("competition=?");
        params.push(competition);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db.prepare(`SELECT * FROM matches ${where} ORDER BY match_date DESC`).all(...params) as any[];
      return json({
        items: rows.map(mapMatch),
        apiEnabled: footballApiEnabled(),
        provider: footballApiProvider(),
        ratingSummary: ratingSummary(),
      });
    }

    if (segments[0] === "matches" && segments[1]) {
      const row = db.prepare("SELECT * FROM matches WHERE id=? OR external_id=?").get(segments[1], segments[1]) as any;
      if (!row) throw new HttpError("比赛记录不存在。", 404);
      const linkedMedia = db
        .prepare("SELECT * FROM media_items WHERE match_id=? AND status='approved'")
        .all(row.id) as any[];
      return json({ item: mapMatch(row), media: linkedMedia.map((item) => mapMedia(item, viewer)) });
    }

    if (route === "posts") {
      const rows = db
        .prepare("SELECT * FROM posts WHERE status='published' ORDER BY created_at DESC LIMIT 60")
        .all() as any[];
      return json({ items: rows.map((row) => mapPost(row, viewer)) });
    }

    if (route === "comments") {
      const targetType = url.searchParams.get("targetType") || "";
      const targetId = url.searchParams.get("targetId") || "";
      if (!["media", "article", "post", "match"].includes(targetType) || !targetId) {
        throw new HttpError("缺少评论目标。", 400);
      }
      return json({ items: listComments(targetType, targetId, viewer) });
    }

    if (route === "favorites") {
      const user = requireUser(viewer);
      const rows = db
        .prepare("SELECT * FROM favorites WHERE user_id=? ORDER BY created_at DESC")
        .all(user.id) as any[];
      return json({ items: rows });
    }

    if (segments[0] === "users" && segments[1]) {
      const user = publicUserByUsername(segments[1]);
      if (!user) throw new HttpError("用户不存在。", 404);
      const mediaRows = db
        .prepare("SELECT * FROM media_items WHERE uploader_id=? AND status='approved' ORDER BY created_at DESC LIMIT 12")
        .all(user.id) as any[];
      const posts = db
        .prepare("SELECT * FROM posts WHERE author_id=? AND status='published' ORDER BY created_at DESC LIMIT 12")
        .all(user.id) as any[];
      return json({
        user,
        media: mediaRows.map((row) => mapMedia(row, viewer)),
        posts: posts.map((row) => mapPost(row, viewer)),
      });
    }

    if (route === "search") {
      return json(searchAll(cleanText(url.searchParams.get("q"), 100), viewer));
    }

    if (route === "admin/summary") {
      requireRole(viewer, "editor");
      return json({
        stats: getStats(),
        storageProvider: getStorage().name,
        footballProvider: footballApiProvider(),
        syncLogs: db.prepare("SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 10").all(),
        audit: db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20").all(),
      });
    }

    if (route === "admin/media") {
      requireRole(viewer, "editor");
      const rows = db
        .prepare(
          "SELECT * FROM media_items ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC LIMIT 200",
        )
        .all() as any[];
      return json({ items: rows.map((row) => mapMedia(row, viewer)) });
    }

    if (route === "admin/reports") {
      requireRole(viewer, "editor");
      return json({ items: listReports() });
    }

    if (route === "admin/articles") {
      requireRole(viewer, "editor");
      return json({
        items: (db.prepare("SELECT * FROM articles ORDER BY created_at DESC").all() as any[]).map(mapArticle),
      });
    }

    if (route === "admin/posts") {
      requireRole(viewer, "editor");
      return json({
        items: (db.prepare("SELECT * FROM posts ORDER BY created_at DESC LIMIT 200").all() as any[]).map((row) =>
          mapPost(row, viewer),
        ),
      });
    }

    if (route === "admin/users") {
      requireRole(viewer, "admin");
      return json({
        items: (db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as any[]).map((row) =>
          mapUser(row, true),
        ),
      });
    }

    if (route === "matches/refresh" || route === "admin/matches/refresh") {
      const authorized =
        viewer?.role === "admin" ||
        (process.env.FOOTBALL_CRON_SECRET &&
          request.headers.get("authorization") === `Bearer ${process.env.FOOTBALL_CRON_SECRET}`);
      if (!authorized) throw new HttpError("需要管理员或定时任务授权。", 403);
      return json(await syncMatches());
    }

    throw new HttpError("接口不存在。", 404, "NOT_FOUND");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { path: segments } = await context.params;
    const route = segments.join("/");
    const viewer = getViewer(request);
    const db = getDb();

    if (route === "auth/private-auto-login") {
      assertSameOrigin(request);
      const hostname = new URL(request.url).hostname;
      const forwardedFor = request.headers.get("x-forwarded-for") || "";
      const cloudflareClient = request.headers.get("cf-connecting-ip");
      const forwardedFromLoopback =
        forwardedFor
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .every((value) => ["127.0.0.1", "::1"].includes(value)) ||
        !forwardedFor;
      if (
        process.env.PRIVATE_AUTO_LOGIN !== "true" ||
        !["127.0.0.1", "localhost", "::1"].includes(hostname) ||
        Boolean(cloudflareClient) ||
        !forwardedFromLoopback
      ) {
        throw new HttpError("私人自动登录未启用。", 403);
      }
      const admin = db
        .prepare("SELECT * FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1")
        .get() as any;
      if (!admin) throw new HttpError("尚未创建管理员账号。", 404);
      const response = json({ user: mapUser(admin, true), privateSession: true });
      setSessionCookie(response, issueSession(admin.id));
      return response;
    }

    if (route === "auth/register") {
      assertSameOrigin(request);
      if (!consumeRateLimit(rateLimitKey(request, "register"), 6, 60_000)) {
        throw new HttpError("注册请求过于频繁，请稍后重试。", 429);
      }
      const body = await readJson(request);
      const result = createUser({
        email: body.email,
        password: body.password,
        username: body.username,
        displayName: body.displayName,
      });
      const response = json({ user: result.user }, 201);
      setSessionCookie(response, result.token);
      return response;
    }

    if (route === "auth/login") {
      assertSameOrigin(request);
      if (!consumeRateLimit(rateLimitKey(request, "login"), 12, 60_000)) {
        throw new HttpError("登录尝试过于频繁，请稍后重试。", 429);
      }
      const body = await readJson(request);
      const result = authenticate(body.email, body.password);
      const response = json({ user: result.user });
      setSessionCookie(response, result.token);
      return response;
    }

    if (route === "auth/forgot-password") {
      assertSameOrigin(request);
      if (!consumeRateLimit(rateLimitKey(request, "forgot"), 5, 15 * 60_000)) {
        throw new HttpError("请求过于频繁，请稍后重试。", 429);
      }
      const body = await readJson(request);
      const email = cleanText(body.email, 254).toLowerCase();
      const user = db.prepare("SELECT id FROM users WHERE email=?").get(email) as any;
      let resetUrl: string | undefined;
      if (user) {
        const token = createSessionToken();
        const expires = new Date(Date.now() + 30 * 60_000).toISOString();
        db.prepare(
          "INSERT INTO password_resets (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)",
        ).run(hashToken(token), user.id, expires, isoNow());
        if (process.env.NODE_ENV !== "production" || process.env.LOCAL_RESET_LINKS === "true") {
          const base = process.env.BASE_URL || new URL(request.url).origin;
          resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
        }
      }
      return json({
        message: "如果该邮箱已注册，密码重置说明会发送到邮箱。",
        ...(resetUrl ? { localResetUrl: resetUrl } : {}),
      });
    }

    if (route === "auth/reset-password") {
      assertSameOrigin(request);
      const body = await readJson(request);
      const token = String(body.token || "");
      const password = String(body.password || "");
      if (!token || password.length < 8 || password.length > 128) {
        throw new HttpError("重置令牌无效，或密码不符合 8–128 字符要求。", 400);
      }
      const reset = db
        .prepare("SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL")
        .get(hashToken(token)) as any;
      if (!reset || new Date(reset.expires_at).getTime() <= Date.now()) {
        throw new HttpError("重置链接已失效，请重新申请。", 410);
      }
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(password), reset.user_id);
      db.prepare("UPDATE password_resets SET used_at=? WHERE token_hash=?").run(isoNow(), reset.token_hash);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(reset.user_id);
      audit(reset.user_id, "auth.password_reset", "user", reset.user_id);
      return json({ ok: true, message: "密码已重置，请使用新密码登录。" });
    }

    if (route === "auth/logout") {
      assertSameOrigin(request);
      destroySession(request);
      const response = json({ ok: true });
      clearSessionCookie(response);
      return response;
    }

    if (route === "media") {
      assertSameOrigin(request);
      const user = requireUser(viewer);
      if (!consumeRateLimit(rateLimitKey(request, "upload", user.id), 5, 10 * 60_000)) {
        throw new HttpError("上传过于频繁，请稍后重试。", 429);
      }
      if (request.headers.get("content-type")?.includes("application/json")) {
        return await createExternalMedia(request, user);
      }
      return await createUploadedMedia(request, user);
    }

    if (route === "posts") {
      assertSameOrigin(request);
      const user = requireUser(viewer);
      if (!consumeRateLimit(rateLimitKey(request, "post", user.id), 8, 10 * 60_000)) {
        throw new HttpError("发帖过于频繁，请稍后重试。", 429);
      }
      const body = await readJson(request);
      const title = cleanText(body.title, 120);
      const text = cleanText(body.body, 5000);
      if (title.length < 3 || text.length < 3) throw new HttpError("标题和正文至少需要 3 个字符。", 400);
      const mediaId = cleanText(body.mediaId, 100);
      let media: any = null;
      if (mediaId) {
        media = db
          .prepare("SELECT * FROM media_items WHERE id=? AND status='approved' AND allow_comments=1")
          .get(mediaId);
        if (!media) throw new HttpError("只能关联已审核的公开媒体。", 400);
      }
      const id = newId("post_");
      const createdAt = isoNow();
      db.prepare(
        "INSERT INTO posts (id,author_id,title,body,status,is_demo,created_at,updated_at) VALUES (?,?,?,?,'published',0,?,?)",
      ).run(id, user.id, title, text, createdAt, createdAt);
      if (media) db.prepare("INSERT INTO post_media (post_id,media_id) VALUES (?,?)").run(id, media.id);
      audit(user.id, "post.create", "post", id);
      const row = db.prepare("SELECT * FROM posts WHERE id=?").get(id) as any;
      return json({ item: mapPost(row, user) }, 201);
    }

    if (route === "comments") {
      assertSameOrigin(request);
      const user = requireUser(viewer);
      if (!consumeRateLimit(rateLimitKey(request, "comment", user.id), 20, 10 * 60_000)) {
        throw new HttpError("评论过于频繁，请稍后重试。", 429);
      }
      const body = await readJson(request);
      const targetType = String(body.targetType || "");
      const targetId = cleanText(body.targetId, 100);
      const text = cleanText(body.body, 2000);
      if (!["media", "article", "post", "match"].includes(targetType) || !targetId || !text) {
        throw new HttpError("评论目标或内容无效。", 400);
      }
      if (!targetExists(targetType, targetId)) throw new HttpError("评论目标不存在。", 404);
      if (targetType === "media") {
        const media = db.prepare("SELECT allow_comments,status FROM media_items WHERE id=?").get(targetId) as any;
        if (!media || (media.status !== "approved" && media.uploader_id !== user.id)) {
          throw new HttpError("该媒体目前不能评论。", 403);
        }
        if (!media.allow_comments) throw new HttpError("该媒体已关闭评论。", 403);
      }
      const parentId = cleanText(body.parentId, 100) || null;
      if (parentId) {
        const parent = db.prepare("SELECT target_type,target_id FROM comments WHERE id=?").get(parentId) as any;
        if (!parent || parent.target_type !== targetType || parent.target_id !== targetId) {
          throw new HttpError("回复目标无效。", 400);
        }
      }
      const id = newId("comment_");
      const createdAt = isoNow();
      db.prepare(
        "INSERT INTO comments (id,author_id,target_type,target_id,parent_id,body,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'visible',?,?)",
      ).run(id, user.id, targetType, targetId, parentId, text, createdAt, createdAt);
      const row = db.prepare("SELECT * FROM comments WHERE id=?").get(id) as any;
      const author = db.prepare("SELECT * FROM users WHERE id=?").get(user.id) as any;
      return json(
        {
          item: {
            id,
            targetType,
            targetId,
            parentId,
            body: text,
            status: "visible",
            author: mapUser(author),
            createdAt,
            replies: [],
          },
        },
        201,
      );
    }

    if (route === "favorites") {
      assertSameOrigin(request);
      const user = requireUser(viewer);
      const body = await readJson(request);
      const targetType = String(body.targetType || "");
      const targetId = cleanText(body.targetId, 100);
      if (!["media", "article", "post"].includes(targetType) || !targetExists(targetType, targetId)) {
        throw new HttpError("收藏目标无效。", 400);
      }
      db.prepare("INSERT OR IGNORE INTO favorites (user_id,target_type,target_id,created_at) VALUES (?,?,?,?)").run(
        user.id,
        targetType,
        targetId,
        isoNow(),
      );
      return json({ favorited: true });
    }

    if (route === "reports") {
      assertSameOrigin(request);
      const user = requireUser(viewer);
      const body = await readJson(request);
      const targetType = cleanText(body.targetType, 30);
      const targetId = cleanText(body.targetId, 100);
      const reason = cleanText(body.reason, 80);
      const details = cleanText(body.details, 1500);
      if (!targetType || !targetId || !reason) throw new HttpError("请填写举报对象和原因。", 400);
      const id = newId("report_");
      db.prepare(
        "INSERT INTO reports (id,reporter_id,target_type,target_id,reason,details,status,created_at) VALUES (?,?,?,?,?,?,'open',?)",
      ).run(id, user.id, targetType, targetId, reason, details, isoNow());
      return json({ id, message: "举报已提交，编辑会尽快处理。" }, 201);
    }

    if (route === "auth/password") {
      assertSameOrigin(request);
      const user = requireUser(viewer);
      const body = await readJson(request);
      changePassword(user.id, body.currentPassword, body.newPassword);
      const response = json({ ok: true, message: "密码已更新，请重新登录。" });
      clearSessionCookie(response);
      return response;
    }

    if (route === "admin/articles") {
      assertSameOrigin(request);
      const user = requireRole(viewer, "editor");
      return await createOrUpdateArticle(request, user.id);
    }

    if (route === "admin/matches") {
      assertSameOrigin(request);
      requireRole(viewer, "editor");
      return await createManualMatch(request);
    }

    if (segments[0] === "admin" && segments[1] === "media" && segments[2] && segments[3] === "thumbnail") {
      assertSameOrigin(request);
      const editor = requireRole(viewer, "editor");
      const row = db.prepare("SELECT * FROM media_items WHERE id=?").get(segments[2]) as any;
      if (!row || row.kind !== "video") throw new HttpError("视频记录不存在。", 404);
      const length = Number(request.headers.get("content-length") || 0);
      if (length > LIMITS.thumbnailBytes + 1_000_000) throw new HttpError("封面文件过大。", 413);
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError("请选择封面图片。", 400);
      if (file.size > LIMITS.thumbnailBytes) throw new HttpError("封面不能超过 8 MB。", 413);
      const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), ".data"));
      const tempDir = path.join(dataDir, "tmp");
      await import("node:fs/promises").then((fs) => fs.mkdir(tempDir, { recursive: true }));
      const tempPath = path.join(tempDir, `${newId("cover_")}.upload`);
      const coverBytes = new Uint8Array(await file.arrayBuffer());
      await import("node:fs/promises").then((fs) => fs.writeFile(tempPath, coverBytes, { flag: "wx" }));
      try {
        const cover = await inspectAndSanitizeMedia(tempPath, file.type, "image");
        const key = `${row.id}_cover_${Date.now()}${cover.extension}`;
        await getStorage().putFile(tempPath, key, cover.mime);
        if (row.thumbnail_path) await getStorage().deleteFile(row.thumbnail_path);
        db.prepare("UPDATE media_items SET thumbnail_path=?,updated_at=? WHERE id=?").run(key, isoNow(), row.id);
        audit(editor.id, "media.thumbnail", "media", row.id);
        return json({ ok: true, thumbnailPath: key });
      } finally {
        await rm(tempPath, { force: true });
      }
    }

    if (segments[0] === "admin" && segments[1] === "media" && segments[2] && segments[3] === "review") {
      assertSameOrigin(request);
      const user = requireRole(viewer, "editor");
      const body = await readJson(request);
      const status = String(body.status) as ReviewStatus;
      if (!["pending", "approved", "rejected"].includes(status)) throw new HttpError("审核状态无效。", 400);
      const row = db.prepare("SELECT * FROM media_items WHERE id=?").get(segments[2]) as any;
      if (!row) throw new HttpError("媒体记录不存在。", 404);
      if (status === "approved" && !row.rights_declaration?.trim()) {
        throw new HttpError("缺少版权与授权说明，不能批准公开。", 409);
      }
      setReviewStatus(row.id, status, user.id, cleanText(body.note, 1000));
      audit(user.id, `media.${status}`, "media", row.id, cleanText(body.note, 1000));
      const updated = db.prepare("SELECT * FROM media_items WHERE id=?").get(row.id) as any;
      return json({ item: mapMedia(updated, viewer) });
    }

    if (segments[0] === "admin" && segments[1] === "posts" && segments[2]) {
      assertSameOrigin(request);
      const user = requireRole(viewer, "editor");
      const body = await readJson(request);
      const status = String(body.status);
      if (!["published", "hidden", "removed"].includes(status)) throw new HttpError("帖子状态无效。", 400);
      db.prepare("UPDATE posts SET status=?,updated_at=? WHERE id=?").run(status, isoNow(), segments[2]);
      audit(user.id, `post.${status}`, "post", segments[2]);
      return json({ ok: true });
    }

    if (segments[0] === "admin" && segments[1] === "reports" && segments[2]) {
      assertSameOrigin(request);
      const user = requireRole(viewer, "editor");
      const body = await readJson(request);
      const status = String(body.status);
      if (!["resolved", "dismissed", "open"].includes(status)) throw new HttpError("举报状态无效。", 400);
      db.prepare("UPDATE reports SET status=?,resolved_at=? WHERE id=?").run(
        status,
        status === "open" ? null : isoNow(),
        segments[2],
      );
      audit(user.id, `report.${status}`, "report", segments[2]);
      return json({ ok: true });
    }

    if (segments[0] === "admin" && segments[1] === "users" && segments[2] && segments[3] === "role") {
      assertSameOrigin(request);
      const user = requireRole(viewer, "admin");
      const body = await readJson(request);
      const role = String(body.role);
      if (!["member", "editor", "admin"].includes(role)) throw new HttpError("角色无效。", 400);
      if (segments[2] === user.id && role !== "admin") throw new HttpError("不能移除自己的管理员权限。", 409);
      db.prepare("UPDATE users SET role=? WHERE id=?").run(role, segments[2]);
      audit(user.id, "user.role", "user", segments[2], role);
      return json({ ok: true });
    }

    if (segments[0] === "admin" && segments[1] === "matches" && segments[2] === "refresh") {
      assertSameOrigin(request);
      requireRole(viewer, "admin");
      return json(await syncMatches());
    }

    throw new HttpError("接口不存在。", 404, "NOT_FOUND");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { path: segments } = await context.params;
    assertSameOrigin(request);
    const viewer = getViewer(request);
    const user = requireUser(viewer);
    const db = getDb();

    if (segments[0] === "media" && segments[1]) {
      const row = db.prepare("SELECT * FROM media_items WHERE id=?").get(segments[1]) as any;
      if (!row) throw new HttpError("媒体不存在。", 404);
      if (row.uploader_id !== user.id && user.role !== "admin") throw new HttpError("不能删除其他用户的媒体。", 403);
      if (row.source_type === "upload") {
        const storage = getStorage();
        if (row.storage_path) await storage.deleteFile(row.storage_path);
        if (row.thumbnail_path) await storage.deleteFile(row.thumbnail_path);
      }
      db.prepare("DELETE FROM media_items WHERE id=?").run(row.id);
      audit(user.id, "media.delete", "media", row.id);
      return json({ ok: true });
    }

    if (segments[0] === "comments" && segments[1]) {
      const row = db.prepare("SELECT * FROM comments WHERE id=?").get(segments[1]) as any;
      if (!row) throw new HttpError("评论不存在。", 404);
      if (row.author_id !== user.id && user.role !== "admin") throw new HttpError("不能删除其他用户的评论。", 403);
      db.prepare("DELETE FROM comments WHERE id=?").run(row.id);
      audit(user.id, "comment.delete", "comment", row.id);
      return json({ ok: true });
    }

    if (segments[0] === "posts" && segments[1]) {
      const row = db.prepare("SELECT * FROM posts WHERE id=?").get(segments[1]) as any;
      if (!row) throw new HttpError("帖子不存在。", 404);
      if (row.author_id !== user.id && user.role !== "admin") throw new HttpError("不能删除其他用户的帖子。", 403);
      db.prepare("DELETE FROM posts WHERE id=?").run(row.id);
      audit(user.id, "post.delete", "post", row.id);
      return json({ ok: true });
    }

    if (segments[0] === "favorites" && segments[1] && segments[2]) {
      db.prepare("DELETE FROM favorites WHERE user_id=? AND target_type=? AND target_id=?").run(
        user.id,
        segments[1],
        segments[2],
      );
      return json({ favorited: false });
    }

    throw new HttpError("接口不存在。", 404, "NOT_FOUND");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { path: segments } = await context.params;
    assertSameOrigin(request);
    const viewer = getViewer(request);
    const user = requireUser(viewer);
    const db = getDb();

    if (segments[0] === "auth" && segments[1] === "profile") {
      const body = await readJson(request);
      const displayName = cleanText(body.displayName, 60);
      const bio = cleanText(body.bio, 500);
      if (displayName.length < 2) throw new HttpError("昵称至少需要 2 个字符。", 400);
      db.prepare("UPDATE users SET display_name=?,bio=? WHERE id=?").run(displayName, bio, user.id);
      db.prepare("UPDATE profiles SET display_name=?,bio=?,updated_at=? WHERE id=?").run(
        displayName,
        bio,
        isoNow(),
        user.id,
      );
      return json({ user: publicUserById(user.id) });
    }

    if (segments[0] === "admin" && segments[1] === "articles" && segments[2]) {
      const editor = requireRole(viewer, "editor");
      const body = await readJson(request);
      const title = cleanText(body.title, 180);
      const dek = cleanText(body.dek, 400);
      const articleBody = cleanText(body.body, 50_000);
      if (!title || !articleBody) throw new HttpError("标题和正文不能为空。", 400);
      db.prepare(
        `UPDATE articles SET title=?,dek=?,body=?,type=?,source_name=?,source_url=?,cover_url=?,
         original_language=?,translation_language=?,tags_json=?,related_match_id=?,updated_at=? WHERE id=?`,
      ).run(
        title,
        dek,
        articleBody,
        allowedArticleType(body.type),
        cleanText(body.sourceName, 120) || null,
        safeUrl(body.sourceUrl),
        safeUrl(body.coverUrl),
        cleanText(body.originalLanguage, 10) || "en",
        cleanText(body.translationLanguage, 10) || null,
        JSON.stringify(parseTags(body.tags)),
        cleanText(body.relatedMatchId, 100) || null,
        isoNow(),
        segments[2],
      );
      audit(editor.id, "article.update", "article", segments[2]);
      const row = db.prepare("SELECT * FROM articles WHERE id=?").get(segments[2]) as any;
      return json({ item: mapArticle(row) });
    }

    throw new HttpError("接口不存在。", 404, "NOT_FOUND");
  } catch (error) {
    return handleApiError(error);
  }
}

async function serveMediaFile(
  request: NextRequest,
  id: string,
  variant: string,
  viewer: ReturnType<typeof getViewer>,
) {
  const row = getDb().prepare("SELECT * FROM media_items WHERE id=?").get(id) as any;
  if (!row) throw new HttpError("媒体文件不存在。", 404);
  if (row.source_type !== "upload") throw new HttpError("该记录没有本地上传文件。", 404);
  const canView =
    row.status === "approved" || (viewer && (viewer.id === row.uploader_id || viewer.role === "admin"));
  if (!canView) throw new HttpError("该媒体尚未通过审核。", 404);
  const key = variant === "thumbnail" ? row.thumbnail_path : row.storage_path;
  if (!key) throw new HttpError("媒体文件不存在。", 404);
  const contentType = variant === "thumbnail" ? imageMimeFromName(key) : row.mime_type || "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": row.status === "approved" ? "public, max-age=86400" : "private, no-store",
    "Content-Disposition": `inline; filename="${encodeURIComponent(row.original_name || key)}"`,
    "X-Content-Type-Options": "nosniff",
  });
  const storage = getStorage();
  const localPath = storage.localPath(key);
  if (localPath) {
    const info = await stat(localPath);
    const range = parseRange(request.headers.get("range"), info.size);
    if (range) {
      const stream = createReadStream(localPath, { start: range.start, end: range.end });
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
    }
    headers.set("Content-Length", String(info.size));
    const stream = createReadStream(localPath);
    return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
  }
  const object = await storage.getFile(key);
  if (!object) throw new HttpError("媒体文件不存在。", 404);
  const range = parseRange(request.headers.get("range"), object.size);
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(new Blob([object.body.slice(range.start, range.end + 1)]), { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(new Blob([object.body as unknown as BlobPart]), { headers });
}

function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (Number.isNaN(start) && !Number.isNaN(end)) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (!Number.isNaN(start) && Number.isNaN(end)) {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function imageMimeFromName(name: string) {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function createUploadedMedia(request: NextRequest, user: ReturnType<typeof requireUser>) {
  const contentType = request.headers.get("content-type") || "";
  if (!request.body || !contentType.includes("multipart/form-data")) {
    throw new HttpError("上传请求格式无效。", 415);
  }
  const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), ".data"));
  const tempDir = path.join(dataDir, "tmp");
  await import("node:fs/promises").then((fs) => fs.mkdir(tempDir, { recursive: true }));
  const requestId = newId("upload_");
  const fields: Record<string, string> = {};
  const files: Array<{ field: string; tempPath: string; mime: string; name: string; size: number }> = [];
  const fileWrites: Promise<void>[] = [];
  let requestError: Error | null = null;

  const busboy = Busboy({
    headers: Object.fromEntries(request.headers.entries()),
    limits: {
      files: 2,
      fileSize: LIMITS.videoBytes,
      fields: 30,
      fieldSize: 20_000,
      parts: 32,
    },
  });
  busboy.on("field", (name, value) => {
    fields[name] = value;
  });
  busboy.on("file", (field, stream, info) => {
    if (!["file", "thumbnail"].includes(field)) {
      stream.resume();
      return;
    }
    const tempPath = path.join(tempDir, `${requestId}_${field}_${newId("tmp_")}`);
    let size = 0;
    const writePromise = new Promise<void>((resolve, reject) => {
      void import("node:fs").then(({ createWriteStream }) => {
        const destination = createWriteStream(tempPath, { flags: "wx" });
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
        });
        stream.on("limit", () => {
          requestError = new HttpError("文件超出大小限制。", 413);
        });
        stream.pipe(destination);
        destination.on("finish", resolve);
        destination.on("error", reject);
        stream.on("error", reject);
      }, reject);
    });
    files.push({ field, tempPath, mime: info.mimeType, name: info.filename || field, size });
    fileWrites.push(
      writePromise.then(() => {
        const record = files.find((file) => file.tempPath === tempPath);
        if (record) record.size = size;
      }),
    );
  });
  busboy.on("filesLimit", () => {
    requestError = new HttpError("一次最多上传一个媒体文件和一个封面图片。", 400);
  });

  await new Promise<void>((resolve, reject) => {
    busboy.on("finish", resolve);
    busboy.on("error", reject);
    Readable.fromWeb(request.body as any).pipe(busboy);
  }).catch((error) => {
    requestError = error instanceof Error ? error : new Error("上传流读取失败。");
  });
  await Promise.allSettled(fileWrites);

  try {
    if (requestError) throw requestError;
    const mainFile = files.find((file) => file.field === "file");
    if (!mainFile) throw new HttpError("请选择要上传的图片或视频文件。", 400);
    const thumbnail = files.find((file) => file.field === "thumbnail");
    if (files.filter((file) => file.field === "file").length !== 1) {
      throw new HttpError("每次只能上传一个媒体文件。", 400);
    }
    const title = cleanText(fields.title, 140);
    const description = cleanText(fields.description, 3000);
    const rightsDeclaration = cleanText(fields.rightsDeclaration, 2000);
    if (title.length < 3) throw new HttpError("标题至少需要 3 个字符。", 400);
    if (!rightsDeclaration || rightsDeclaration.length < 10) {
      throw new HttpError("请填写至少 10 个字符的版权与授权说明。", 400);
    }
    const inspected = await inspectAndSanitizeMedia(mainFile.tempPath, mainFile.mime, fields.kind === "video" ? "video" : "image");
    const kind: MediaKind = inspected.mime.startsWith("video/") ? "video" : "image";
    if (kind !== fields.kind) throw new HttpError("所选媒体类型与文件内容不一致。", 400);
    if (kind === "image" && mainFile.size > LIMITS.imageBytes) throw new HttpError("图片不能超过 25 MB。", 413);
    if (thumbnail && kind !== "video") throw new HttpError("只有视频可以上传独立封面。", 400);
    if (thumbnail && thumbnail.size > LIMITS.thumbnailBytes) throw new HttpError("封面图片不能超过 8 MB。", 413);

    const id = newId("media_");
    const mediaKey = `${id}${inspected.extension}`;
    let thumbnailKey: string | null = null;
    if (thumbnail) {
      const cover = await inspectAndSanitizeMedia(thumbnail.tempPath, thumbnail.mime, "image");
      thumbnailKey = `${id}_cover${cover.extension}`;
      await getStorage().putFile(thumbnail.tempPath, thumbnailKey, cover.mime);
    }
    await getStorage().putFile(mainFile.tempPath, mediaKey, inspected.mime);
    try {
      const row = createMediaRecord({
        id,
        uploaderId: user.id,
        kind,
        title,
        description,
        category: cleanText(fields.category, 60) || "Moments",
        sourceType: "upload",
        storagePath: mediaKey,
        originalName: mainFile.name.slice(0, 180),
        mimeType: inspected.mime,
        fileSize: mainFile.size,
        thumbnailPath: thumbnailKey,
        sourceUrl: safeUrl(fields.sourceUrl),
        credit: cleanText(fields.credit, 180) || null,
        rightsDeclaration,
        allowComments: fields.allowComments !== "false",
        tags: parseTags(fields.tags),
        matchId: cleanText(fields.matchId, 100) || null,
        articleId: cleanText(fields.articleId, 100) || null,
      });
      audit(user.id, "media.upload", "media", id, `${kind}:${mainFile.size}`);
      return json(
        {
          item: mapMedia(row, user),
          message: "上传完成。媒体已进入待审核队列，只有管理员批准后才会公开展示。",
        },
        201,
      );
    } catch (error) {
      await getStorage().deleteFile(mediaKey);
      if (thumbnailKey) await getStorage().deleteFile(thumbnailKey);
      throw error;
    }
  } finally {
    await Promise.all(files.map((file) => rm(file.tempPath, { force: true })));
  }
}

async function createExternalMedia(request: NextRequest, user: ReturnType<typeof requireUser>) {
  requireRole(user, "editor");
  const body = await readJson(request);
  const kind = String(body.kind);
  const title = cleanText(body.title, 140);
  const externalUrl = safeUrl(body.externalUrl);
  if (!["image", "video"].includes(kind) || title.length < 3 || !externalUrl) {
    throw new HttpError("外部媒体必须填写类型、标题和有效链接。", 400);
  }
  const rightsDeclaration = cleanText(body.rightsDeclaration, 2000);
  if (rightsDeclaration.length < 10) throw new HttpError("请填写授权说明。", 400);
  const id = newId("media_");
  const row = createMediaRecord({
    id,
    uploaderId: user.id,
    kind: kind as MediaKind,
    title,
    description: cleanText(body.description, 3000),
    category: cleanText(body.category, 60) || "External",
    sourceType: "external",
    externalUrl,
    sourceUrl: safeUrl(body.sourceUrl) || externalUrl,
    credit: cleanText(body.credit, 180) || null,
    rightsDeclaration,
    allowComments: body.allowComments !== false,
    tags: parseTags(body.tags),
  });
  audit(user.id, "media.external", "media", id, externalUrl);
  return json({ item: mapMedia(row, user), message: "外部媒体已进入审核队列。" }, 201);
}

async function createOrUpdateArticle(request: NextRequest, userId: string) {
  const body = await readJson(request);
  const db = getDb();
  const title = cleanText(body.title, 180);
  const dek = cleanText(body.dek, 400);
  const articleBody = cleanText(body.body, 50_000);
  if (title.length < 3 || articleBody.length < 10) throw new HttpError("标题或正文过短。", 400);
  const id = newId("article_");
  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const slug = `${slugBase || "archive-note"}-${id.slice(-6)}`;
  const now = isoNow();
  db.prepare(`
    INSERT INTO articles
      (id,author_id,type,slug,title,dek,body,original_language,translation_language,source_name,source_url,cover_url,related_match_id,tags_json,published_at,is_demo,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
  `).run(
    id,
    userId,
    allowedArticleType(body.type),
    slug,
    title,
    dek,
    articleBody,
    cleanText(body.originalLanguage, 10) || "en",
    cleanText(body.translationLanguage, 10) || null,
    cleanText(body.sourceName, 120) || null,
    safeUrl(body.sourceUrl),
    safeUrl(body.coverUrl),
    cleanText(body.relatedMatchId, 100) || null,
    JSON.stringify(parseTags(body.tags)),
    body.publish === false ? null : now,
    now,
    now,
  );
  audit(userId, "article.create", "article", id);
  const row = db.prepare("SELECT * FROM articles WHERE id=?").get(id) as any;
  return json({ item: mapArticle(row) }, 201);
}

function allowedArticleType(value: unknown) {
  return ["interview", "news", "original", "translation"].includes(String(value)) ? String(value) : "original";
}

function safeUrl(value: unknown): string | null {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function targetExists(type: string, id: string) {
  if (type === "media") return Boolean(getDb().prepare("SELECT 1 FROM media_items WHERE id=? AND status='approved'").get(id));
  if (type === "article")
    return Boolean(getDb().prepare("SELECT 1 FROM articles WHERE id=? AND published_at IS NOT NULL").get(id));
  if (type === "post")
    return Boolean(getDb().prepare("SELECT 1 FROM posts WHERE id=? AND status='published'").get(id));
  if (type === "match") return Boolean(getDb().prepare("SELECT 1 FROM matches WHERE id=?").get(id));
  return false;
}

function searchAll(query: string, viewer: ReturnType<typeof getViewer>) {
  if (!query || query.length < 2) return { query, media: [], articles: [], matches: [], posts: [] };
  const like = `%${query}%`;
  const db = getDb();
  return {
    query,
    media: (
      db
        .prepare("SELECT * FROM media_items WHERE status='approved' AND (title LIKE ? OR description LIKE ?) LIMIT 12")
        .all(like, like) as any[]
    ).map((row) => mapMedia(row, viewer)),
    articles: (
      db
        .prepare("SELECT * FROM articles WHERE published_at IS NOT NULL AND (title LIKE ? OR dek LIKE ? OR body LIKE ?) LIMIT 12")
        .all(like, like, like) as any[]
    ).map(mapArticle),
    matches: (
      db
        .prepare("SELECT * FROM matches WHERE competition LIKE ? OR opponent LIKE ? OR venue LIKE ? ORDER BY match_date DESC LIMIT 12")
        .all(like, like, like) as any[]
    ).map(mapMatch),
    posts: (
      db.prepare("SELECT * FROM posts WHERE status='published' AND (title LIKE ? OR body LIKE ?) LIMIT 12").all(like, like) as any[]
    ).map((row) => mapPost(row, viewer)),
  };
}

async function createManualMatch(request: NextRequest) {
  const body = await readJson(request);
  const id = newId("match_");
  const now = isoNow();
  const competition = cleanText(body.competition, 100);
  const opponent = cleanText(body.opponent, 100);
  const matchDate = cleanText(body.matchDate, 50);
  if (!competition || !opponent || !matchDate) throw new HttpError("请填写赛事、对手和比赛时间。", 400);
  getDb()
    .prepare(`
      INSERT INTO matches
        (id,competition,tracked_team,opponent,home_away,match_date,venue,home_score,away_score,status,source_type,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'manual',?,?)
    `)
    .run(
      id,
      competition,
      cleanText(body.trackedTeam, 100) || "Bayern München",
      opponent,
      ["home", "away", "neutral"].includes(body.homeAway) ? body.homeAway : "home",
      matchDate,
      cleanText(body.venue, 160) || null,
      body.homeScore === "" || body.homeScore == null ? null : Number(body.homeScore),
      body.awayScore === "" || body.awayScore == null ? null : Number(body.awayScore),
      cleanText(body.status, 30) || "scheduled",
      now,
      now,
    );
  const row = getDb().prepare("SELECT * FROM matches WHERE id=?").get(id) as any;
  return json({ item: mapMatch(row) }, 201);
}
