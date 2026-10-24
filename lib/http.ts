import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { PublicUser } from "./types";
import { roleRank } from "./db";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function apiError(message: string, status = 400, code = "BAD_REQUEST") {
  return json({ error: message, code }, status);
}

export async function readJson(request: NextRequest): Promise<Record<string, any>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new HttpError("请求必须使用 JSON。", 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 512_000) throw new HttpError("请求内容过大。", 413);
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("object expected");
    }
    return value as Record<string, any>;
  } catch {
    throw new HttpError("JSON 格式无效。", 400);
  }
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const allowed = new Set<string>([requestUrl.origin]);
  let configuredUrl: URL | null = null;
  if (process.env.BASE_URL) {
    try {
      configuredUrl = new URL(process.env.BASE_URL);
      allowed.add(configuredUrl.origin);
    } catch {
      // Ignore a malformed optional deployment URL.
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    allowed.add(`${forwardedProto || requestUrl.protocol.replace(":", "")}://${forwardedHost}`);
  }

  const originUrl = new URL(origin);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const originIsLoopback = loopbackHosts.has(originUrl.hostname);
  const requestIsLoopback = loopbackHosts.has(requestUrl.hostname);
  const configuredIsLoopback = configuredUrl ? loopbackHosts.has(configuredUrl.hostname) : false;
  if (originIsLoopback && (requestIsLoopback || configuredIsLoopback)) return;
  if (allowed.has(originUrl.origin)) return;

  throw new HttpError("跨站请求已被拒绝。", 403);
}

export function requireUser(viewer: PublicUser | null): PublicUser {
  if (!viewer) throw new HttpError("请先登录。", 401);
  return viewer;
}

export function requireRole(viewer: PublicUser | null, minimum: "editor" | "admin"): PublicUser {
  const user = requireUser(viewer);
  if (roleRank(user.role) < roleRank(minimum)) throw new HttpError("权限不足。", 403);
  return user;
}

export function handleApiError(error: unknown) {
  if (error instanceof HttpError) return apiError(error.message, error.status, error.code);
  const candidate = error as { status?: unknown; message?: unknown; code?: unknown } | null;
  if (candidate && typeof candidate.status === "number") {
    return apiError(
      typeof candidate.message === "string" ? candidate.message : "请求无法处理。",
      candidate.status,
      typeof candidate.code === "string" ? candidate.code : "BAD_REQUEST",
    );
  }
  console.error(error);
  return apiError("服务器暂时无法处理该请求。", 500, "INTERNAL_ERROR");
}

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
