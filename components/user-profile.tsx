"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { MediaCard } from "./media-card";
import { api, formatDate } from "@/lib/client";
import type { MediaItem, Post, PublicUser } from "@/lib/types";

export function UserProfile({ username }: { username: string }) {
  const { user: viewer, showToast, refresh } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api<{ user: PublicUser; media: MediaItem[]; posts: Post[] }>(`/api/users/${username}`)
      .then((payload) => {
        setProfile(payload.user);
        setMedia(payload.media);
        setPosts(payload.posts);
      })
      .catch((err: Error) => setError(err.message));
  }, [username]);

  const updateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api<{ user: PublicUser }>("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: form.get("displayName"), bio: form.get("bio") }),
      });
      setProfile((current) => current ? { ...current, displayName: payload.user.displayName, bio: payload.user.bio } : current);
      setEditing(false);
      await refresh();
      showToast("个人资料已更新。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "资料更新失败。");
    }
  };

  if (error && !profile) {
    return <div className="page-wrap py-20"><div className="paper-panel p-10 text-center"><h1 className="serif text-4xl">Member not found</h1><p className="mt-3 text-sm text-[#756e64]">{error}</p><Link href="/community" className="button-primary mt-6">Back to community</Link></div></div>;
  }
  if (!profile) return <div className="page-wrap py-16"><div className="skeleton h-[60vh]" /></div>;

  return (
    <>
      <header className="border-b border-[#dcd2c3] bg-[#fffdf8]">
        <div className="page-wrap grid gap-8 py-10 md:grid-cols-[1fr_auto] md:items-end md:py-14">
          <div className="flex items-start gap-5">
            <span className="grid h-24 w-24 shrink-0 place-items-center rounded-full border border-[#dcd2c3] bg-[#dce8f3] font-serif text-5xl text-[#394b60]">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="eyebrow">Community member</p>
              <h1 className="display mt-3 text-5xl md:text-6xl">{profile.displayName}</h1>
              <p className="mt-2 text-xs text-[#756e64]">@{profile.username} · Joined {formatDate(profile.createdAt)}</p>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#756e64]">{profile.bio || "This member has not added a public biography yet."}</p>
            </div>
          </div>
          {viewer?.id === profile.id ? (
            <button type="button" className="button-secondary" onClick={() => setEditing((value) => !value)}>Edit profile</button>
          ) : null}
        </div>
      </header>
      <section className="page-wrap py-10">
        {editing ? (
          <form onSubmit={updateProfile} className="paper-panel mb-9 grid gap-4 p-6 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="profile-name">Display name</label>
              <input id="profile-name" name="displayName" className="field" defaultValue={profile.displayName} required minLength={2} maxLength={60} />
            </div>
            <div className="md:row-span-2">
              <label className="field-label" htmlFor="profile-bio">Public biography</label>
              <textarea id="profile-bio" name="bio" className="field min-h-28" defaultValue={profile.bio} maxLength={500} />
            </div>
            <div className="flex items-end gap-2">
              <button type="button" className="button-quiet" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="button-primary">Save profile</button>
            </div>
          </form>
        ) : null}
        <div className="grid grid-cols-3 border-y border-[#dcd2c3] py-5">
          <div><p className="serif text-3xl">{media.length}</p><p className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">Approved media</p></div>
          <div className="border-x border-[#dcd2c3] px-5"><p className="serif text-3xl">{posts.length}</p><p className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">Public notes</p></div>
          <div className="px-5"><p className="serif text-3xl">{profile.role}</p><p className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">Archive role</p></div>
        </div>
        <div className="mt-12">
          <div className="flex items-end justify-between"><div><p className="eyebrow">Public archive</p><h2 className="serif mt-3 text-4xl">Approved media</h2></div><Link href="/photos?upload=1" className="text-[9px] font-bold uppercase tracking-widest text-[#394b60]">Upload media</Link></div>
          {media.length ? <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{media.map((item, index) => <MediaCard key={item.id} item={item} index={index + 1} />)}</div> : <div className="paper-panel mt-6 p-8 text-sm text-[#756e64]">No approved media yet.</div>}
        </div>
        <div className="mt-14">
          <p className="eyebrow">Community contributions</p>
          <h2 className="serif mt-3 text-4xl">Public notes</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {posts.map((post) => (
              <Link href="/community" key={post.id} className="paper-panel p-5 transition hover:-translate-y-0.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">{formatDate(post.createdAt)}</p>
                <h3 className="serif mt-2 text-2xl">{post.title}</h3>
                <p className="mt-2 line-clamp-3 text-xs leading-6 text-[#756e64]">{post.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
