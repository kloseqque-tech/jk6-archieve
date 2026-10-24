import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const appPort = 3221;
const mockPort = 3222;
const base = `http://127.0.0.1:${appPort}`;
const dataDir = await mkdtemp(path.join(tmpdir(), "kimmich-football-test-"));
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const adminEmail = "ratings-admin@example.com";
const adminPassword = "RatingsAdmin!2026";
const requests = [];

const mock = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${mockPort}`);
  requests.push({ pathname: url.pathname, search: url.search, apiKey: request.headers["x-apisports-key"] });
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/fixtures") {
    response.end(
      JSON.stringify({
        errors: [],
        paging: { current: 1, total: 1 },
        response: [
          {
            fixture: {
              id: 9001,
              date: "2026-10-20T18:30:00+00:00",
              status: { short: "FT", long: "Match Finished", elapsed: 90 },
              venue: { name: "Allianz Arena" },
            },
            league: { name: "Bundesliga" },
            teams: {
              home: { id: 157, name: "Bayern Munich" },
              away: { id: 165, name: "Borussia Dortmund" },
            },
            goals: { home: 3, away: 1 },
          },
        ],
      }),
    );
    return;
  }
  if (url.pathname === "/players") {
    response.end(
      JSON.stringify({
        errors: [],
        paging: { current: 1, total: 1 },
        response: [
          {
            player: { id: 555, name: "Joshua Kimmich", firstname: "Joshua", lastname: "Kimmich" },
            statistics: [],
          },
        ],
      }),
    );
    return;
  }
  if (url.pathname === "/fixtures/players") {
    response.end(
      JSON.stringify({
        errors: [],
        paging: { current: 1, total: 1 },
        response: [
          {
            team: { id: 157, name: "Bayern Munich" },
            players: [
              {
                player: { id: 555, name: "Joshua Kimmich" },
                statistics: [
                  {
                    games: { minutes: 90, rating: "8.2" },
                    goals: { total: 1, assists: 1 },
                    cards: { yellow: 0, red: 0 },
                  },
                ],
              },
            ],
          },
          {
            team: { id: 165, name: "Borussia Dortmund" },
            players: [],
          },
        ],
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not found" }));
});

await new Promise((resolve) => mock.listen(mockPort, "127.0.0.1", resolve));

const server = spawn(process.execPath, [nextBin, "start", "-p", String(appPort)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATA_DIR: dataDir,
    BASE_URL: base,
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    API_FOOTBALL_API_KEY: "integration-test-api-key",
    API_FOOTBALL_BASE_URL: `http://127.0.0.1:${mockPort}`,
    API_FOOTBALL_TEAM_IDS: "157",
    API_FOOTBALL_LOOKBACK_DAYS: "30",
    API_FOOTBALL_LOOKAHEAD_DAYS: "10",
    API_FOOTBALL_RATING_LIMIT: "4",
    PRIVATE_AUTO_LOGIN: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Server exited early:\n${output}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start:\n${output}`);
}

async function requestJson(pathname, options = {}, cookie) {
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

test("API-Football sync stores scores and Kimmich match rating", { timeout: 120_000 }, async () => {
  await waitForServer();

  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  assert.equal(loginResponse.status, 200, output);
  const cookie = (loginResponse.headers.getSetCookie?.()[0] || "").split(";")[0];
  assert.ok(cookie);

  const privateLogin = await requestJson(
    "/api/auth/private-auto-login",
    { method: "POST", body: JSON.stringify({}) },
  );
  assert.equal(privateLogin.response.status, 403, output);
  assert.match(privateLogin.payload.error, /私人自动登录未启用/);

  const sync = await requestJson(
    "/api/admin/matches/refresh",
    { method: "POST", body: JSON.stringify({}) },
    cookie,
  );
  assert.equal(sync.response.status, 200, `${output}\n${JSON.stringify(sync.payload)}`);
  assert.equal(sync.payload.provider, "api-football");
  assert.equal(sync.payload.updated, 1);
  assert.equal(sync.payload.ratingsUpdated, 1);
  assert.ok(requests.some((entry) => entry.pathname === "/fixtures" && entry.apiKey === "integration-test-api-key"));
  assert.ok(requests.some((entry) => entry.pathname === "/players"));
  assert.ok(requests.some((entry) => entry.pathname === "/fixtures/players" && entry.search.includes("fixture=9001")));

  const matches = await requestJson("/api/matches");
  assert.equal(matches.response.status, 200);
  const fixture = matches.payload.items.find((item) => item.externalId === "api-football:9001");
  assert.ok(fixture, JSON.stringify(matches.payload));
  assert.equal(fixture.provider, "api-football");
  assert.equal(fixture.homeScore, 3);
  assert.equal(fixture.awayScore, 1);
  assert.equal(fixture.status, "finished");
  assert.equal(fixture.playerRating.playerName, "Joshua Kimmich");
  assert.equal(fixture.playerRating.rating, 8.2);
  assert.equal(fixture.playerRating.minutes, 90);
  assert.equal(fixture.playerRating.goals, 1);
  assert.equal(fixture.playerRating.assists, 1);
  assert.equal(matches.payload.ratingSummary.average, 8.2);
  assert.equal(matches.payload.ratingSummary.matchesRated, 1);
});

test.after(async () => {
  server.kill();
  await new Promise((resolve) => mock.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const resolvedData = path.resolve(dataDir);
  if (resolvedData.startsWith(path.resolve(tmpdir()))) {
    await rm(resolvedData, { recursive: true, force: true });
  }
});
