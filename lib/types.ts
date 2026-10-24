export type Role = "member" | "editor" | "admin";
export type MediaKind = "image" | "video";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type SourceType = "upload" | "external" | "demo";

export interface PublicUser {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  role: Role;
  bio: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  description: string;
  category: string;
  status: ReviewStatus;
  sourceType: SourceType;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  fileSize: number;
  mimeType: string | null;
  durationSeconds: number | null;
  credit: string | null;
  rightsDeclaration: string;
  allowComments: boolean;
  tags: string[];
  reviewNote: string | null;
  uploader: PublicUser | null;
  matchId: string | null;
  articleId: string | null;
  isDemo: boolean;
  publishedAt: string | null;
  createdAt: string;
  favoriteCount?: number;
  commentCount?: number;
}

export interface Article {
  id: string;
  type: "interview" | "news" | "original" | "translation";
  title: string;
  dek: string;
  body: string;
  originalLanguage: string;
  translationLanguage: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  isDemo: boolean;
  author: PublicUser | null;
  tags: string[];
  relatedMatchId: string | null;
  commentCount?: number;
}

export interface Match {
  id: string;
  externalId: string | null;
  provider: string;
  competition: string;
  trackedTeam: string;
  opponent: string;
  homeAway: "home" | "away" | "neutral";
  matchDate: string;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  sourceType: "api" | "manual" | "demo";
  lastSyncedAt: string | null;
  playerRating: PlayerMatchRating | null;
}

export interface PlayerMatchRating {
  playerName: string;
  teamName: string | null;
  rating: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  provider: string;
  updatedAt: string;
}

export interface RatingSummary {
  average: number | null;
  appearances: number;
  best: number | null;
  matchesRated: number;
  latestRatingAt: string | null;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  status: "published" | "hidden" | "removed";
  isDemo: boolean;
  author: PublicUser;
  createdAt: string;
  media: MediaItem[];
  favoriteCount: number;
  commentCount: number;
  isFavorited?: boolean;
}

export interface Comment {
  id: string;
  targetType: "media" | "article" | "post" | "match";
  targetId: string;
  parentId: string | null;
  body: string;
  status: "visible" | "hidden";
  author: PublicUser;
  createdAt: string;
  replies: Comment[];
}

export interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  reporter: PublicUser | null;
  createdAt: string;
}

export interface SiteStats {
  media: number;
  photos: number;
  videos: number;
  articles: number;
  matches: number;
  members: number;
  pending: number;
  storageBytes: number;
}

export interface BootstrapPayload {
  featuredMedia: MediaItem[];
  latestArticles: Article[];
  recentMatches: Match[];
  recentPosts: Post[];
  stats: SiteStats;
  footballApiEnabled: boolean;
  footballProvider: string;
  storageProvider: string;
}
