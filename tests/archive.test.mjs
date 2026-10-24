import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 3217;
const base = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(path.join(tmpdir(), "kimmich-archive-test-"));
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const adminEmail = "test-admin@example.com";
const adminPassword = "StrongAdmin!2026";

const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATA_DIR: dataDir,
    BASE_URL: base,
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start:\n${serverOutput}`);
}

function cookieFrom(response) {
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie");
  assert.ok(setCookie, "expected a session cookie");
  return setCookie.split(";")[0];
}

async function json(pathname, options = {}, cookie) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function register(username, email) {
  const { response, payload } = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      displayName: username.replace("_", " "),
      email,
      password: "MemberPass!2026",
    }),
  });
  assert.equal(response.status, 201, JSON.stringify(payload));
  return { cookie: cookieFrom(response), user: payload.user };
}

async function login(email, password) {
  const { response, payload } = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, JSON.stringify(payload));
  return { cookie: cookieFrom(response), user: payload.user };
}

async function upload(cookie, { kind, bytes, mime, filename, title }) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("title", title);
  form.set("description", "Integration test archive record.");
  form.set("category", "Matches");
  form.set("rightsDeclaration", "Test fixture created by the integration suite; display permission granted.");
  form.set("allowComments", "true");
  form.set("file", new File([bytes], filename, { type: mime }));
  const response = await fetch(`${base}/api/media`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const payload = await response.json();
  return { response, payload };
}

test("archive API supports authentication, review, media range, comments and permissions", { timeout: 120_000 }, async () => {
  await waitForServer();

  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Joshua Kimmich Archive/);

  const bootstrap = await json("/api/bootstrap");
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.payload.featuredMedia.length, 3);
  assert.ok(bootstrap.payload.featuredMedia.every((item) => item.sourceType === "demo"));

  const member = await register("test_member", "member@example.com");
  const second = await register("second_member", "second@example.com");
  const admin = await login(adminEmail, adminPassword);
  assert.equal(admin.user.role, "admin");

  const alternateLoopbackOrigin = await fetch(`${base}/api/posts`, {
    method: "POST",
    headers: {
      Cookie: member.cookie,
      "Content-Type": "application/json",
      Origin: "http://localhost:3217",
    },
    body: JSON.stringify({
      title: "Loopback origin compatibility",
      body: "The launcher may use localhost or 127.0.0.1 interchangeably.",
    }),
  });
  assert.equal(alternateLoopbackOrigin.status, 201);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
    "base64",
  );
  const imageUpload = await upload(member.cookie, {
    kind: "image",
    bytes: png,
    mime: "image/png",
    filename: "pixel.png",
    title: "Review-gated test photograph",
  });
  assert.equal(imageUpload.response.status, 201, JSON.stringify(imageUpload.payload));
  assert.equal(imageUpload.payload.item.status, "pending");
  const imageId = imageUpload.payload.item.id;

  const privateFile = await fetch(`${base}/api/media/${imageId}/file`);
  assert.equal(privateFile.status, 404, serverOutput);
  const ownerFile = await fetch(`${base}/api/media/${imageId}/file`, {
    headers: { Cookie: member.cookie },
  });
  assert.equal(ownerFile.status, 200);
  assert.equal(ownerFile.headers.get("content-type"), "image/png");

  const invalidFileUpload = await upload(member.cookie, {
    kind: "image",
    bytes: Buffer.from("not an image"),
    mime: "image/png",
    filename: "renamed.png",
    title: "Invalid test file",
  });
  assert.equal(invalidFileUpload.response.status, 400);

  const approveImage = await json(
    `/api/admin/media/${imageId}/review`,
    {
      method: "POST",
      body: JSON.stringify({ status: "approved", note: "Test source and rights verified." }),
    },
    admin.cookie,
  );
  assert.equal(approveImage.response.status, 200, JSON.stringify(approveImage.payload));
  assert.equal(approveImage.payload.item.status, "approved");
  const publicImage = await fetch(`${base}/api/media/${imageId}/file`);
  assert.equal(publicImage.status, 200);

  // The minimal MP4 signature is sufficient to test the streaming and authorization path;
  // a real browser playback fixture is documented in the manual acceptance checklist.
  const fallbackMp4 = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom"),
    Buffer.from([0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32]),
    Buffer.alloc(96, 0),
  ]);
  const realFixture = path.join(process.cwd(), "work", "flower.mp4");
  const videoBytes = existsSync(realFixture) ? readFileSync(realFixture) : fallbackMp4;
  const videoUpload = await upload(member.cookie, {
    kind: "video",
    bytes: videoBytes,
    mime: "video/mp4",
    filename: "match-clip.mp4",
    title: "Range streaming test video",
  });
  assert.equal(videoUpload.response.status, 201, JSON.stringify(videoUpload.payload));
  const videoId = videoUpload.payload.item.id;
  await json(
    `/api/admin/media/${videoId}/review`,
    { method: "POST", body: JSON.stringify({ status: "approved", note: "Video rights checked." }) },
    admin.cookie,
  );
  const partialVideo = await fetch(`${base}/api/media/${videoId}/file`, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(partialVideo.status, 206);
  assert.match(partialVideo.headers.get("content-range"), /^bytes 0-31\//);
  assert.equal(partialVideo.headers.get("content-type"), "video/mp4");
  assert.equal((await partialVideo.arrayBuffer()).byteLength, 32);

  const post = await json(
    "/api/posts",
    {
      method: "POST",
      body: JSON.stringify({
        title: "A community test note",
        body: "Testing real discussion persistence and nested replies.",
        mediaId: imageId,
      }),
    },
    member.cookie,
  );
  assert.equal(post.response.status, 201, JSON.stringify(post.payload));
  assert.equal(post.payload.item.media[0].id, imageId);

  const comment = await json(
    "/api/comments",
    {
      method: "POST",
      body: JSON.stringify({
        targetType: "post",
        targetId: post.payload.item.id,
        body: "A sourced and useful comment.",
      }),
    },
    member.cookie,
  );
  assert.equal(comment.response.status, 201, JSON.stringify(comment.payload));

  const reply = await json(
    "/api/comments",
    {
      method: "POST",
      body: JSON.stringify({
        targetType: "post",
        targetId: post.payload.item.id,
        parentId: comment.payload.item.id,
        body: "A nested reply.",
      }),
    },
    second.cookie,
  );
  assert.equal(reply.response.status, 201, JSON.stringify(reply.payload));

  const comments = await json(`/api/comments?targetType=post&targetId=${post.payload.item.id}`);
  assert.equal(comments.response.status, 200);
  assert.equal(comments.payload.items[0].replies[0].body, "A nested reply.");

  const forbiddenCommentDelete = await json(
    `/api/comments/${comment.payload.item.id}`,
    { method: "DELETE" },
    second.cookie,
  );
  assert.equal(forbiddenCommentDelete.response.status, 403);

  const forbiddenMediaDelete = await json(`/api/media/${imageId}`, { method: "DELETE" }, second.cookie);
  assert.equal(forbiddenMediaDelete.response.status, 403);

  const forbiddenReview = await json(
    `/api/admin/media/${videoId}/review`,
    { method: "POST", body: JSON.stringify({ status: "rejected" }) },
    member.cookie,
  );
  assert.equal(forbiddenReview.response.status, 403);

  const crossSite = await fetch(`${base}/api/posts`, {
    method: "POST",
    headers: {
      Cookie: member.cookie,
      "Content-Type": "application/json",
      Origin: "https://malicious.example",
    },
    body: JSON.stringify({ title: "Cross-site", body: "Should be rejected" }),
  });
  assert.equal(crossSite.status, 403);

  const matchSyncFallback = await json("/api/matches");
  assert.equal(matchSyncFallback.response.status, 200);
  assert.equal(matchSyncFallback.payload.apiEnabled, false);
  assert.ok(matchSyncFallback.payload.items.length >= 2);
});

test.after(async () => {
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const resolvedData = path.resolve(dataDir);
  if (resolvedData.startsWith(path.resolve(tmpdir()))) {
    await rm(resolvedData, { recursive: true, force: true });
  }
});
