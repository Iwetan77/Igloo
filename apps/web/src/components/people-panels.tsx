"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { ApiError, getUserPosts, getUserProfile, searchUsers, setFollow } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import type { FeedPost, UserProfile } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";

export function ProfilePanel({ id, session, onClose, onOpenPost, onProfile }: {
  id: string;
  session: Session;
  onClose: () => void;
  onOpenPost: (id: string) => void;
  onProfile: (profile: UserProfile) => void;
}) {
  const authorized = session.authorized;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void authorized(async (token) => {
      const [user, page] = await Promise.all([getUserProfile(id, token), getUserPosts(id, token)]);
      return { user, page };
    }).then(({ user, page }) => {
      if (cancelled) return;
      setProfile(user);
      setPosts(page.posts);
      onProfile(user);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof ApiError && cause.status === 404 ? "Profiles is coming online. Try again shortly." : errorCopy(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, authorized, onProfile]);

  async function toggleFollow() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const result = await authorized((token) => setFollow(id, !profile.is_following, token));
      const updated = { ...profile, is_following: result.following, follower_count: result.follower_count, is_friend: result.following && profile.follows_me };
      setProfile(updated);
      onProfile(updated);
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(false); }
  }

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet profile-sheet" role="dialog" aria-modal="true" aria-label="Profile">
    <div className="sheet-head"><div><span className="eyebrow">Profile</span><h2>{profile ? authorName(profile) : "Igloo member"}</h2></div><button type="button" className="icon-action" onClick={onClose} aria-label="Close profile" title="Close"><X size={20} /></button></div>
    {loading && <p className="empty-note">Loading profile...</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {profile && <><div className="profile-stats"><span><strong>{profile.post_count}</strong> posts</span><span><strong>{profile.follower_count}</strong> followers</span><span><strong>{profile.following_count}</strong> following</span></div><div className="profile-actions">{profile.is_friend && <span className="friend-badge">Friends</span>}{session.me?.id !== profile.id && <button type="button" className="subtle-button" disabled={busy} onClick={() => { void toggleFollow(); }}>{profile.is_following ? "Following" : "Follow"}</button>}</div><h3>Videos</h3><div className="profile-posts">{posts.map((post) => <button type="button" key={post.id} onClick={() => onOpenPost(post.id)}><video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" /><span>{post.caption || post.market.question || "Watch video"}</span></button>)}</div>{posts.length === 0 && <p className="empty-note">No posts yet.</p>}</>}
  </section></div>;
}

export function PeopleSearch({ session, onClose, onOpenProfile }: {
  session: Session;
  onClose: () => void;
  onOpenProfile: (user: UserProfile) => void;
}) {
  const authorized = session.authorized;
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void authorized((token) => searchUsers(query.trim(), token)).then((result) => {
        if (!cancelled) setUsers(result.users);
      }).catch((cause) => { if (!cancelled) setError(cause instanceof ApiError && cause.status === 404 ? "People search is coming online. Try again shortly." : errorCopy(cause)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, authorized]);

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet people-sheet" role="dialog" aria-modal="true" aria-label="Find people">
    <div className="sheet-head"><div><span className="eyebrow">Community</span><h2>Find people</h2></div><button type="button" className="icon-action" onClick={onClose} aria-label="Close people search" title="Close"><X size={20} /></button></div>
    <label className="market-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setUsers([]); }} placeholder="Search people" autoFocus /></label>
    {query.trim().length === 1 && <p className="empty-note">Enter at least two characters.</p>}
    {loading && <p className="empty-note">Searching...</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {!loading && !error && query.trim().length >= 2 && users.length === 0 && <p className="empty-note">No people found.</p>}
    <div className="people-results">{users.map((user) => <button type="button" key={user.id} onClick={() => onOpenProfile(user)}><ProfileAvatar src={user.avatar_url} name={user.display_name} size={32} /><span><strong>{authorName(user)}</strong><small>{user.follower_count ?? 0} followers</small></span>{user.is_friend && <span className="friend-badge">Friends</span>}</button>)}</div>
    <button type="button" className="back-command" onClick={onClose}><ArrowLeft size={16} />Back to feed</button>
  </section></div>;
}
