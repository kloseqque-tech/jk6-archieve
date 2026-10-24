import type { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  hashPassword,
  hashToken,
  isEmail,
  isUsername,
  newId,
  normalizeEmail,
  verifyPassword,
} from "./security";
import { getDb, isoNow, mapUser, publicUserById } from "./db";
import type { PublicUser, Role } from "./types";

export const SESSION_COOKIE = "kimmich_archive_session";
const SESSION_DAYS = 14;

type UserRow = Record<string, any>;

export function getViewer(request: NextRequest): PublicUser | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const session = db
    .prepare("SELECT user_id,expires_at FROM sessions WHERE token_hash=?")
    .get(tokenHash) as UserRow | undefined;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(session.user_id) as UserRow | undefined;
  return user ? mapUser(user, true) : null;
}

export function createUser(input: {
  email: unknown;
  password: unknown;
  username: unknown;
  displayName: unknown;
}): { user: PublicUser; token: string } {
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  const username = String(input.username ?? "").trim();
  const displayName = String(input.displayName ?? "").trim().slice(0, 60) || username;
  if (!isEmail(email)) throw new AuthError("请输入有效的邮箱地址。", 400);
  if (password.length < 8 || password.length > 128) throw new AuthError("密码必须为 8–128 个字符。", 400);
  if (!isUsername(username)) throw new AuthError("用户名需为 3–24 位字母、数字或下划线。", 400);
  if (!displayName) throw new AuthError("请输入公开昵称。", 400);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) {
    throw new AuthError("该邮箱已经注册。", 409);
  }
  if (db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) {
    throw new AuthError("该用户名已被使用。", 409);
  }
  const userId = newId("usr_");
  const createdAt = isoNow();
  const role: Role =
    Number((db.prepare("SELECT COUNT(*) AS n FROM users").get() as UserRow).n) === 0 ? "admin" : "member";
  db.prepare(`
    INSERT INTO users (id,email,username,display_name,password_hash,role,bio,created_at)
    VALUES (?,?,?,?,?,?,'',?)
  `).run(userId, email, username, displayName, hashPassword(password), role, createdAt);
  db.prepare(`
    INSERT INTO profiles (id,username,display_name,bio,created_at,updated_at)
    VALUES (?,?,?,'',?,?)
  `).run(userId, username, displayName, createdAt, createdAt);
  const token = issueSession(userId);
  return { user: publicUserById(userId)!, token };
}

export function authenticate(emailValue: unknown, passwordValue: unknown): { user: PublicUser; token: string } {
  const email = normalizeEmail(emailValue);
  const password = String(passwordValue ?? "");
  const user = getDb().prepare("SELECT * FROM users WHERE email=?").get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new AuthError("邮箱或密码不正确。", 401);
  }
  return { user: mapUser(user, true), token: issueSession(user.id) };
}

export function issueSession(userId: string): string {
  const token = createSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  getDb()
    .prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .run(hashToken(token), userId, expires.toISOString(), isoNow());
  return token;
}

export function destroySession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" &&
      (process.env.BASE_URL?.startsWith("https://") === true ||
        process.env.RENDER === "true" ||
        process.env.VERCEL === "1"),
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" &&
      (process.env.BASE_URL?.startsWith("https://") === true ||
        process.env.RENDER === "true" ||
        process.env.VERCEL === "1"),
    path: "/",
    maxAge: 0,
  });
}

export function changePassword(userId: string, currentPassword: unknown, nextPassword: unknown) {
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id=?").get(userId) as UserRow | undefined;
  if (!row || !verifyPassword(String(currentPassword ?? ""), row.password_hash)) {
    throw new AuthError("当前密码不正确。", 403);
  }
  const next = String(nextPassword ?? "");
  if (next.length < 8 || next.length > 128) throw new AuthError("新密码必须为 8–128 个字符。", 400);
  getDb().prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(next), userId);
  getDb().prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
