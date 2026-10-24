import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, newId } from "./security";
import type {
  Article,
  Comment,
  Match,
  MediaItem,
  MediaKind,
  Post,
  PublicUser,
  Report,
  ReviewStatus,
  Role,
  SiteStats,
} from "./types";

type Row = Record<string, any>;
type Viewer = PublicUser | null;

const isoNow = () => new Date().toISOString();
const globalDb = globalThis as typeof globalThis & { __kimmichArchiveDb?: DatabaseSync };

export function getDataDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), ".data"));
}

export function getDb(): DatabaseSync {
  if (!globalDb.__kimmichArchiveDb) {
    globalDb.__kimmichArchiveDb = createDatabase(getDataDir());
  }
  return globalDb.__kimmichArchiveDb;
}

export function createDatabase(dataDir: string, options: { seed?: boolean } = {}): DatabaseSync {
  mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  const database = new DatabaseSync(path.join(dataDir, "archive.db"));
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(database);
  if (options.seed !== false && count(database, "users") === 0) seed(database);
  return database;
}

function count(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as Row).count);
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','editor','admin')),
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      favorite_player TEXT NOT NULL DEFAULT 'Joshua Kimmich',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK(kind IN ('image','video')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Moments',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      source_type TEXT NOT NULL DEFAULT 'upload' CHECK(source_type IN ('upload','external','demo')),
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_path TEXT,
      original_name TEXT,
      mime_type TEXT,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      duration_seconds REAL,
      thumbnail_path TEXT,
      external_url TEXT,
      source_url TEXT,
      credit TEXT,
      rights_declaration TEXT NOT NULL DEFAULT '',
      allow_comments INTEGER NOT NULL DEFAULT 1,
      tags_json TEXT NOT NULL DEFAULT '[]',
      match_id TEXT,
      article_id TEXT,
      review_note TEXT,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT,
      published_at TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
      width INTEGER,
      height INTEGER,
      exif_stripped INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
      duration_seconds REAL,
      thumbnail_path TEXT,
      embed_url TEXT,
      video_type TEXT NOT NULL DEFAULT 'other'
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('interview','news','original','translation')),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      dek TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      original_language TEXT NOT NULL DEFAULT 'en',
      translation_language TEXT,
      source_name TEXT,
      source_url TEXT,
      cover_url TEXT,
      related_match_id TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      published_at TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      external_id TEXT UNIQUE,
      provider TEXT NOT NULL DEFAULT 'archive',
      competition TEXT NOT NULL,
      tracked_team TEXT NOT NULL DEFAULT 'Bayern München',
      opponent TEXT NOT NULL,
      home_away TEXT NOT NULL DEFAULT 'home' CHECK(home_away IN ('home','away','neutral')),
      match_date TEXT NOT NULL,
      venue TEXT,
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled',
      source_type TEXT NOT NULL DEFAULT 'demo' CHECK(source_type IN ('api','manual','demo')),
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_match_ratings (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      team_name TEXT,
      rating REAL,
      minutes INTEGER,
      goals INTEGER,
      assists INTEGER,
      yellow_cards INTEGER,
      red_cards INTEGER,
      raw_json TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(match_id,provider,provider_player_id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_media (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      PRIMARY KEY(post_id, media_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('media','article','post','match')),
      target_id TEXT NOT NULL,
      parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('media','article','post')),
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,target_type,target_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(article_id,tag_id)
    );

    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(photo_id,tag_id)
    );

    CREATE TABLE IF NOT EXISTS video_tags (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(video_id,tag_id)
    );

    CREATE TABLE IF NOT EXISTS match_links (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(match_id,target_type,target_id)
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      records_updated INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_media_status ON media_items(status,published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_kind ON media_items(kind,status);
    CREATE INDEX IF NOT EXISTS idx_article_published ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
    CREATE INDEX IF NOT EXISTS idx_ratings_match ON player_match_ratings(match_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type,target_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status,created_at);
  `);
  ensureColumn(db, "matches", "provider", "TEXT NOT NULL DEFAULT 'archive'");
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seed(db: DatabaseSync) {
  const createdAt = isoNow();
  const adminId = newId("usr_");
  const fanId = newId("usr_");
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) {
    throw new Error("Production startup requires ADMIN_EMAIL and ADMIN_PASSWORD.");
  }
  const adminPassword = process.env.ADMIN_PASSWORD || "KimmichArchive!2026";
  if (process.env.NODE_ENV === "production" && adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }
  const insertUser = db.prepare(`
    INSERT INTO users (id,email,username,display_name,password_hash,role,bio,created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const insertProfile = db.prepare(`
    INSERT INTO profiles (id,username,display_name,bio,created_at,updated_at)
    VALUES (?,?,?,?,?,?)
  `);
  insertUser.run(
    adminId,
    adminEmail,
    "archive_editor",
    "Archive Editor",
    hashPassword(adminPassword),
    "admin",
    "Curating the Joshua Kimmich Archive.",
    createdAt,
  );
  insertUser.run(
    fanId,
    "fan@example.com",
    "south_stand",
    "South Stand",
    hashPassword(process.env.NODE_ENV === "production" ? newId("disabled_") : "DemoFan!2026"),
    "member",
    "Midfield rotations, late runs and the number six.",
    createdAt,
  );
  insertProfile.run(adminId, "archive_editor", "Archive Editor", "Curating the Joshua Kimmich Archive.", createdAt, createdAt);
  insertProfile.run(fanId, "south_stand", "South Stand", "Midfield rotations, late runs and the number six.", createdAt, createdAt);

  const insertPost = db.prepare(`
    INSERT INTO posts (id,author_id,title,body,status,is_demo,created_at,updated_at)
    VALUES (?,?,?,?,'published',1,?,?)
  `);
  insertPost.run(
    newId("post_"),
    fanId,
    "The pass before the pass",
    "The detail I keep returning to is how often Kimmich scans before receiving. The obvious assist gets the replay, but the body shape two touches earlier creates the whole picture.",
    createdAt,
    createdAt,
  );
  insertPost.run(
    newId("post_"),
    adminId,
    "Help us build the match index",
    "This first run contains clearly marked sample records. Add the exact fixture, publication and source link when you contribute so future visitors can verify it.",
    createdAt,
    createdAt,
  );

  const insertArticle = db.prepare(`
    INSERT INTO articles
      (id,author_id,type,slug,title,dek,body,original_language,translation_language,source_name,source_url,published_at,is_demo,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
  `);
  insertArticle.run(
    newId("article_"),
    adminId,
    "original",
    "the-architecture-of-the-number-six",
    "The architecture of the number six",
    "A reading room for the passes, gestures and words that shape Kimmich's game.",
    "This is a demonstration editorial entry.\n\nThe archive is designed to hold original analysis beside interview excerpts, source links and reader-contributed translations. Editors can publish full original text, attach the canonical source, and mark translated material with its language pair.\n\nReplace this sample with a sourced article from the admin workspace.",
    "en",
    null,
    "Joshua Kimmich Archive",
    null,
    "2026-10-12T09:00:00.000Z",
    createdAt,
    createdAt,
  );
  insertArticle.run(
    newId("article_"),
    adminId,
    "interview",
    "on-responsibility-rhythm-and-the-next-pass",
    "On responsibility, rhythm and the next pass",
    "A demonstration interview record showing how original language, translation and source provenance fit together.",
    "This sample record does not reproduce an external interview.\n\nInterview records can include a translated excerpt, a link to the canonical publisher, an optional cover image, and a clear language label. In production, add only material you have the right to publish or quote.",
    "de",
    "en",
    "External source placeholder",
    "https://fcbayern.com/en",
    "2026-10-08T14:30:00.000Z",
    createdAt,
    createdAt,
  );

  db.exec(`
    INSERT INTO matches
      (id,competition,tracked_team,opponent,home_away,match_date,venue,home_score,away_score,status,source_type,created_at,updated_at)
    VALUES
      ('match_demo_ucl_2020','UEFA Champions League','Bayern München','Paris Saint-Germain','neutral','2020-08-23T19:00:00.000Z','Estádio da Luz',1,0,'finished','demo','${createdAt}','${createdAt}'),
      ('match_demo_bundesliga_2023','Bundesliga','Bayern München','Borussia Dortmund','home','2023-04-01T16:30:00.000Z','Allianz Arena',4,2,'finished','demo','${createdAt}','${createdAt}');
    UPDATE matches SET provider='archive-demo' WHERE source_type='demo' AND provider='archive';
  `);

  const artwork = [
    ["Matchday geometry", "A study in the spaces a deep midfielder occupies.", "Matches", "/assets/matchday.svg"],
    ["The diagonal switch", "One pass, two lines broken.", "Tactics", "/assets/diagonal.svg"],
    ["Words after the whistle", "Interview notes, voices and context.", "Words", "/assets/words.svg"],
  ];
  const mediaInsert = db.prepare(`
    INSERT INTO media_items
      (id,uploader_id,kind,title,description,category,status,source_type,external_url,credit,rights_declaration,is_demo,published_at,created_at,updated_at)
    VALUES (?,?,'image',?,?,?,'approved','demo',?,?,'Original archive illustration',1,?,?,?)
  `);
  const photoInsert = db.prepare("INSERT INTO photos (id) VALUES (?)");
  artwork.forEach(([title, description, category, url], index) => {
    const id = newId("media_");
    mediaInsert.run(id, adminId, title, description, category, url, "Original archive illustration", createdAt, createdAt, createdAt);
    photoInsert.run(id);
    if (index === 0) {
      db.prepare("INSERT INTO tags (id,name,created_at) VALUES (?,?,?)").run(newId("tag_"), "matchday", createdAt);
    }
  });
}

export function mapUser(row: Row, includeEmail = false): PublicUser {
  return {
    id: row.id,
    ...(includeEmail ? { email: row.email } : {}),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    bio: row.bio || "",
    avatarUrl: row.avatar_url || null,
    createdAt: row.created_at,
  };
}

function mediaUrl(row: Row, thumbnail = false): string | null {
  if (row.source_type === "upload") {
    return thumbnail && row.thumbnail_path
      ? `/api/media/${row.id}/thumbnail`
      : `/api/media/${row.id}/file`;
  }
  return row.external_url || null;
}

export function mapMedia(row: Row, viewer: Viewer = null): MediaItem {
  const db = getDb();
  const uploader =
    row.uploader_id &&
    (db.prepare("SELECT * FROM users WHERE id = ?").get(row.uploader_id) as Row | undefined);
  const favoriteCount = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM favorites WHERE target_type='media' AND target_id=?").get(row.id) as Row).n,
  );
  const commentCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM comments WHERE target_type='media' AND target_id=? AND status='visible'")
        .get(row.id) as Row
    ).n,
  );
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    sourceType: row.source_type,
    previewUrl: mediaUrl(row),
    thumbnailUrl: mediaUrl(row, true),
    sourceUrl: row.source_url || null,
    fileSize: Number(row.file_size_bytes || 0),
    mimeType: row.mime_type || null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    credit: row.credit || null,
    rightsDeclaration: row.rights_declaration || "",
    allowComments: Boolean(row.allow_comments),
    tags: safeJson(row.tags_json, []),
    reviewNote: row.review_note || null,
    uploader: uploader ? mapUser(uploader) : null,
    matchId: row.match_id || null,
    articleId: row.article_id || null,
    isDemo: Boolean(row.is_demo),
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    favoriteCount,
    commentCount,
  };
}

export function mapArticle(row: Row): Article {
  const db = getDb();
  const author =
    row.author_id && (db.prepare("SELECT * FROM users WHERE id=?").get(row.author_id) as Row | undefined);
  const commentCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM comments WHERE target_type='article' AND target_id=? AND status='visible'")
        .get(row.id) as Row
    ).n,
  );
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    dek: row.dek,
    body: row.body,
    originalLanguage: row.original_language,
    translationLanguage: row.translation_language || null,
    sourceName: row.source_name || null,
    sourceUrl: row.source_url || null,
    coverUrl: row.cover_url || null,
    publishedAt: row.published_at || null,
    isDemo: Boolean(row.is_demo),
    author: author ? mapUser(author) : null,
    tags: safeJson(row.tags_json, []),
    relatedMatchId: row.related_match_id || null,
    commentCount,
  };
}

export function mapMatch(row: Row): Match {
  const rating = getDb()
    .prepare(
      "SELECT * FROM player_match_ratings WHERE match_id=? ORDER BY updated_at DESC LIMIT 1",
    )
    .get(row.id) as Row | undefined;
  return {
    id: row.id,
    externalId: row.external_id || null,
    provider: row.provider || deriveMatchProvider(row.external_id, row.source_type),
    competition: row.competition,
    trackedTeam: row.tracked_team || "Bayern München",
    opponent: row.opponent,
    homeAway: row.home_away,
    matchDate: row.match_date,
    venue: row.venue || null,
    homeScore: row.home_score == null ? null : Number(row.home_score),
    awayScore: row.away_score == null ? null : Number(row.away_score),
    status: row.status,
    sourceType: row.source_type,
    lastSyncedAt: row.last_synced_at || null,
    playerRating: rating
      ? {
          playerName: rating.player_name,
          teamName: rating.team_name || null,
          rating: rating.rating == null ? null : Number(rating.rating),
          minutes: rating.minutes == null ? null : Number(rating.minutes),
          goals: rating.goals == null ? null : Number(rating.goals),
          assists: rating.assists == null ? null : Number(rating.assists),
          provider: rating.provider,
          updatedAt: rating.updated_at,
        }
      : null,
  };
}

function deriveMatchProvider(externalId: string | null, sourceType: string): string {
  if (externalId?.startsWith("api-football:")) return "api-football";
  if (externalId?.startsWith("football-data:")) return "football-data.org";
  return sourceType === "demo" ? "archive-demo" : sourceType === "manual" ? "archive-editorial" : "archive";
}

export function mapPost(row: Row, viewer: Viewer = null): Post {
  const db = getDb();
  const author = db.prepare("SELECT * FROM users WHERE id=?").get(row.author_id) as Row;
  const favorites = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM favorites WHERE target_type='post' AND target_id=?").get(row.id) as Row)
      .n,
  );
  const comments = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM comments WHERE target_type='post' AND target_id=? AND status='visible'")
        .get(row.id) as Row
    ).n,
  );
  const mediaRows = db
    .prepare(
      "SELECT m.* FROM media_items m JOIN post_media pm ON pm.media_id=m.id WHERE pm.post_id=? AND m.status='approved'",
    )
    .all(row.id) as Row[];
  const isFavorited = viewer
    ? Boolean(
        db
          .prepare("SELECT 1 FROM favorites WHERE user_id=? AND target_type='post' AND target_id=?")
          .get(viewer.id, row.id),
      )
    : false;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    isDemo: Boolean(row.is_demo),
    author: mapUser(author),
    createdAt: row.created_at,
    media: mediaRows.map((media) => mapMedia(media, viewer)),
    favoriteCount: favorites,
    commentCount: comments,
    isFavorited,
  };
}

export function mapComment(row: Row): Comment {
  const author = getDb().prepare("SELECT * FROM users WHERE id=?").get(row.author_id) as Row;
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    parentId: row.parent_id || null,
    body: row.body,
    status: row.status,
    author: mapUser(author),
    createdAt: row.created_at,
    replies: [],
  };
}

export function listComments(targetType: string, targetId: string, viewer: Viewer) {
  const whereStatus = viewer?.role === "admin" ? "" : "AND c.status='visible'";
  const rows = getDb()
    .prepare(
      `SELECT c.* FROM comments c WHERE c.target_type=? AND c.target_id=? ${whereStatus} ORDER BY c.created_at ASC`,
    )
    .all(targetType, targetId) as Row[];
  const byId = new Map<string, Comment>();
  const roots: Comment[] = [];
  for (const row of rows) {
    const mapped = mapComment(row);
    byId.set(mapped.id, mapped);
  }
  for (const comment of byId.values()) {
    if (comment.parentId && byId.has(comment.parentId)) {
      byId.get(comment.parentId)!.replies.push(comment);
    } else if (!comment.parentId) {
      roots.push(comment);
    }
  }
  return roots;
}

export function getStats(): SiteStats {
  const db = getDb();
  return {
    media: countWhere(db, "media_items", "status='approved'"),
    photos: countWhere(db, "media_items", "status='approved' AND kind='image'"),
    videos: countWhere(db, "media_items", "status='approved' AND kind='video'"),
    articles: countWhere(db, "articles", "published_at IS NOT NULL"),
    matches: count(db, "matches"),
    members: count(db, "users"),
    pending: countWhere(db, "media_items", "status='pending'"),
    storageBytes: Number(
      (db.prepare("SELECT COALESCE(SUM(file_size_bytes),0) AS n FROM media_items").get() as Row).n,
    ),
  };
}

function countWhere(db: DatabaseSync, table: string, where: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as Row).n);
}

export function listReports(): Report[] {
  const rows = getDb()
    .prepare("SELECT * FROM reports ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC")
    .all() as Row[];
  return rows.map((row) => {
    const reporter =
      row.reporter_id && (getDb().prepare("SELECT * FROM users WHERE id=?").get(row.reporter_id) as Row | undefined);
    return {
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      reporter: reporter ? mapUser(reporter) : null,
      createdAt: row.created_at,
    };
  });
}

export function safeJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details = "",
) {
  getDb()
    .prepare(
      "INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(newId("audit_"), actorId, action, targetType, targetId, details, isoNow());
}

export function createMediaRecord(input: {
  id: string;
  uploaderId: string;
  kind: MediaKind;
  title: string;
  description: string;
  category: string;
  sourceType: "upload" | "external";
  storagePath?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize?: number;
  thumbnailPath?: string | null;
  externalUrl?: string | null;
  sourceUrl?: string | null;
  credit?: string | null;
  rightsDeclaration: string;
  allowComments: boolean;
  tags: string[];
  matchId?: string | null;
  articleId?: string | null;
}) {
  const db = getDb();
  const createdAt = isoNow();
  db.prepare(`
    INSERT INTO media_items
      (id,uploader_id,kind,title,description,category,status,source_type,storage_path,original_name,mime_type,file_size_bytes,thumbnail_path,external_url,source_url,credit,rights_declaration,allow_comments,tags_json,match_id,article_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    input.id,
    input.uploaderId,
    input.kind,
    input.title,
    input.description,
    input.category,
    input.sourceType,
    input.storagePath || null,
    input.originalName || null,
    input.mimeType || null,
    input.fileSize || 0,
    input.thumbnailPath || null,
    input.externalUrl || null,
    input.sourceUrl || null,
    input.credit || null,
    input.rightsDeclaration,
    input.allowComments ? 1 : 0,
    JSON.stringify(input.tags),
    input.matchId || null,
    input.articleId || null,
    createdAt,
    createdAt,
  );
  db.prepare(input.kind === "image" ? "INSERT INTO photos (id) VALUES (?)" : "INSERT INTO videos (id) VALUES (?)").run(
    input.id,
  );
  return db.prepare("SELECT * FROM media_items WHERE id=?").get(input.id) as Row;
}

export function setReviewStatus(
  mediaId: string,
  status: ReviewStatus,
  reviewerId: string,
  note: string,
) {
  const now = isoNow();
  getDb()
    .prepare(
      `UPDATE media_items
       SET status=?, review_note=?, reviewed_by=?, approved_at=CASE WHEN ?='approved' THEN ? ELSE approved_at END,
           published_at=CASE WHEN ?='approved' THEN ? ELSE published_at END, updated_at=?
       WHERE id=?`,
    )
    .run(status, note, reviewerId, status, now, status, now, now, mediaId);
}

export function publicUserById(id: string): PublicUser | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id=?").get(id) as Row | undefined;
  return row ? mapUser(row) : null;
}

export function publicUserByUsername(username: string, includeEmail = false): PublicUser | null {
  const row = getDb().prepare("SELECT * FROM users WHERE username=?").get(username) as Row | undefined;
  return row ? mapUser(row, includeEmail) : null;
}

export function roleRank(role: Role): number {
  return role === "admin" ? 3 : role === "editor" ? 2 : 1;
}

export { isoNow };
