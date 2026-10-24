-- Joshua Kimmich Archive: production schema for Supabase/PostgreSQL.
-- This migration is provided for a configured Supabase project. It is intentionally
-- separate from the credential-free local adapter used by the development build.

create extension if not exists "pgcrypto";

create type public.archive_role as enum ('member', 'editor', 'admin');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.media_source as enum ('upload', 'external', 'demo');
create type public.member_status as enum ('published', 'hidden', 'removed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text,
  role public.archive_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  provider text not null default 'archive',
  competition text not null,
  tracked_team text not null default 'Bayern München',
  opponent text not null,
  home_away text not null default 'home' check (home_away in ('home','away','neutral')),
  match_date timestamptz not null,
  venue text,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  status text not null default 'scheduled',
  source_type text not null default 'manual' check (source_type in ('api','manual','demo')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_match_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  provider text not null,
  provider_player_id text not null,
  player_name text not null,
  team_name text,
  rating numeric(3,1) check (rating is null or (rating >= 0 and rating <= 10)),
  minutes integer check (minutes is null or minutes >= 0),
  goals integer check (goals is null or goals >= 0),
  assists integer check (assists is null or assists >= 0),
  yellow_cards integer check (yellow_cards is null or yellow_cards >= 0),
  red_cards integer check (red_cards is null or red_cards >= 0),
  raw_json jsonb,
  updated_at timestamptz not null default now(),
  unique (match_id, provider, provider_player_id)
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('interview','news','original','translation')),
  slug text not null unique,
  title text not null check (char_length(title) between 3 and 180),
  dek text not null default '',
  body text not null default '',
  original_language text not null default 'en',
  translation_language text,
  source_name text,
  source_url text,
  cover_url text,
  related_match_id uuid references public.matches(id) on delete set null,
  published_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '',
  category text not null default 'Moments',
  storage_provider text not null default 'supabase',
  storage_path text,
  external_url text,
  source_url text,
  mime_type text check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  width integer,
  height integer,
  thumbnail_path text,
  source_type public.media_source not null default 'upload',
  review_status public.review_status not null default 'pending',
  visibility text not null default 'public' check (visibility in ('public','private','hidden')),
  rights_declaration text not null check (char_length(rights_declaration) >= 10),
  credit text,
  allow_comments boolean not null default true,
  is_demo boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_source_check check (
    (source_type = 'upload' and storage_path is not null) or
    (source_type in ('external','demo') and external_url is not null)
  )
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '',
  video_type text not null default 'other' check (video_type in ('interview','post_match','highlights','training','documentary','other')),
  category text not null default 'Moments',
  storage_provider text not null default 'supabase',
  storage_path text,
  external_url text,
  source_url text,
  mime_type text check (mime_type in ('video/mp4','video/webm','video/quicktime','video/ogg')),
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  duration_seconds numeric(10,3),
  thumbnail_path text,
  source_type public.media_source not null default 'upload',
  review_status public.review_status not null default 'pending',
  visibility text not null default 'public' check (visibility in ('public','private','hidden')),
  rights_declaration text not null check (char_length(rights_declaration) >= 10),
  credit text,
  allow_comments boolean not null default true,
  is_demo boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_source_check check (
    (source_type = 'upload' and storage_path is not null) or
    (source_type = 'external' and external_url is not null)
  )
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 5000),
  status public.member_status not null default 'published',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_media (
  post_id uuid not null references public.posts(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, photo_id, video_id),
  constraint one_media_kind check (num_nonnulls(photo_id, video_id) = 1)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('photo','video','article','post','match')),
  target_id uuid not null,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'visible' check (status in ('visible','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('photo','video','article','post')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.article_tags (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table public.photo_tags (
  photo_id uuid not null references public.photos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (photo_id, tag_id)
);

create table public.video_tags (
  video_id uuid not null references public.videos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (video_id, tag_id)
);

create table public.match_links (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  target_type text not null check (target_type in ('photo','video','article')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (match_id, target_type, target_id)
);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null,
  message text not null default '',
  records_updated integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index photos_public_idx on public.photos (review_status, approved_at desc);
create index photos_kind_category_idx on public.photos (category, review_status);
create index videos_public_idx on public.videos (review_status, approved_at desc);
create index videos_type_idx on public.videos (video_type, review_status);
create index articles_public_idx on public.articles (published_at desc);
create index matches_date_idx on public.matches (match_date desc);
create index player_ratings_match_idx on public.player_match_ratings (match_id, updated_at desc);
create index comments_target_idx on public.comments (target_type, target_id, created_at);
create index reports_status_idx on public.reports (status, created_at);

create or replace function public.current_role()
returns public.archive_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('editor','admin'), false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() = 'admin', false) $$;

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.player_match_ratings enable row level security;
alter table public.articles enable row level security;
alter table public.photos enable row level security;
alter table public.videos enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.favorites enable row level security;
alter table public.reports enable row level security;
alter table public.tags enable row level security;
alter table public.article_tags enable row level security;
alter table public.photo_tags enable row level security;
alter table public.video_tags enable row level security;
alter table public.match_links enable row level security;
alter table public.sync_logs enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy matches_public_read on public.matches for select using (true);
create policy matches_editor_write on public.matches for all using (public.is_editor()) with check (public.is_editor());
create policy player_ratings_public_read on public.player_match_ratings for select using (true);
create policy player_ratings_editor_write on public.player_match_ratings for all using (public.is_editor()) with check (public.is_editor());

create policy articles_public_read on public.articles for select using (published_at is not null or public.is_editor());
create policy articles_editor_write on public.articles for all using (public.is_editor()) with check (public.is_editor());

create policy photos_public_read on public.photos for select using (
  (review_status = 'approved' and visibility = 'public') or uploaded_by = auth.uid() or public.is_editor()
);
create policy photos_authenticated_insert on public.photos for insert to authenticated
  with check (uploaded_by = auth.uid() and review_status = 'pending');
create policy photos_owner_update_pending on public.photos for update to authenticated
  using (uploaded_by = auth.uid() and review_status = 'pending')
  with check (uploaded_by = auth.uid() and review_status = 'pending');
create policy photos_owner_delete on public.photos for delete to authenticated using (uploaded_by = auth.uid());
create policy photos_editor_all on public.photos for all using (public.is_editor()) with check (public.is_editor());

create policy videos_public_read on public.videos for select using (
  (review_status = 'approved' and visibility = 'public') or uploaded_by = auth.uid() or public.is_editor()
);
create policy videos_authenticated_insert on public.videos for insert to authenticated
  with check (uploaded_by = auth.uid() and review_status = 'pending');
create policy videos_owner_update_pending on public.videos for update to authenticated
  using (uploaded_by = auth.uid() and review_status = 'pending')
  with check (uploaded_by = auth.uid() and review_status = 'pending');
create policy videos_owner_delete on public.videos for delete to authenticated using (uploaded_by = auth.uid());
create policy videos_editor_all on public.videos for all using (public.is_editor()) with check (public.is_editor());

create policy posts_public_read on public.posts for select using (status = 'published' or author_id = auth.uid() or public.is_editor());
create policy posts_authenticated_insert on public.posts for insert to authenticated with check (author_id = auth.uid() and status = 'published');
create policy posts_owner_update on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_owner_delete on public.posts for delete to authenticated using (author_id = auth.uid());
create policy posts_editor_all on public.posts for all using (public.is_editor()) with check (public.is_editor());

create policy comments_public_read on public.comments for select using (status = 'visible' or author_id = auth.uid() or public.is_editor());
create policy comments_authenticated_insert on public.comments for insert to authenticated with check (author_id = auth.uid() and status = 'visible');
create policy comments_owner_update on public.comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_owner_delete on public.comments for delete to authenticated using (author_id = auth.uid());
create policy comments_editor_all on public.comments for all using (public.is_editor()) with check (public.is_editor());

create policy favorites_owner_all on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reports_authenticated_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_owner_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_editor());
create policy reports_editor_update on public.reports for update using (public.is_editor()) with check (public.is_editor());

create policy tags_public_read on public.tags for select using (true);
create policy tags_editor_write on public.tags for all using (public.is_editor()) with check (public.is_editor());
create policy article_tags_public_read on public.article_tags for select using (true);
create policy photo_tags_public_read on public.photo_tags for select using (true);
create policy video_tags_public_read on public.video_tags for select using (true);
create policy tag_links_editor_write on public.article_tags for all using (public.is_editor()) with check (public.is_editor());
create policy photo_links_editor_write on public.photo_tags for all using (public.is_editor()) with check (public.is_editor());
create policy video_links_editor_write on public.video_tags for all using (public.is_editor()) with check (public.is_editor());
create policy match_links_public_read on public.match_links for select using (true);
create policy match_links_editor_write on public.match_links for all using (public.is_editor()) with check (public.is_editor());
create policy sync_logs_editor_read on public.sync_logs for select using (public.is_editor());

create policy post_media_public_read on public.post_media for select using (true);
create policy post_media_owner_insert on public.post_media for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
create policy post_media_editor_all on public.post_media for all using (public.is_editor()) with check (public.is_editor());

-- Create the private bucket in the dashboard or with the Supabase CLI. Uploaded files
-- are served through server-side authorization; public/private visibility is enforced
-- by API routes and the photo/video records.
insert into storage.buckets (id, name, public)
values ('archive-media', 'archive-media', false)
on conflict (id) do nothing;

create policy archive_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'archive-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy archive_media_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'archive-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy archive_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'archive-media' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'member_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'Archive member')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
