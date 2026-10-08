"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ApiError, getUserPosts, getUserProfile, setFollow } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import type { FeedPost, UserProfile } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import "@/styles/profile.css";
import "@/styles/people.css";

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
    }).catch((cause) => { if (!cancelled) setError(cause instanceof ApiError && cause.status === 404 ? "Profiles are coming online. Try again shortly." : errorCopy(cause)); })
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
    <div className="sheet-head"><span className="label">Profile</span><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close profile" title="Close"><X size={17} strokeWidth={1.5} /></button></div>
    {loading && <p className="loading-line">Loading profile</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {profile && <>
      <div className="profile-hero"><span className="avatar-ring"><ProfileAvatar src={profile.avatar_url} name={profile.display_name} size={76} /></span><h2>{authorName(profile)}</h2>{profile.is_friend && <span className="tag tag-yes">Friends</span>}
        <div className="profile-counts"><span><strong>{profile.post_count}</strong><span className="label">Posts</span></span><span><strong>{profile.follower_count}</strong><span className="label">Followers</span></span><span><strong>{profile.following_count}</strong><span className="label">Following</span></span></div>
        {session.me?.id !== profile.id && <div className="profile-actions"><button type="button" className={"btn " + (profile.is_following ? "" : "btn-primary")} disabled={busy} onClick={() => { void toggleFollow(); }}>{profile.is_following ? "Following" : "Follow"}</button></div>}
      </div>
      <h3 className="label">Videos</h3>
      <div className="profile-posts">{posts.map((post) => <button type="button" key={post.id} onClick={() => onOpenPost(post.id)}><video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" /><span><span>{post.caption || post.market.question || "Watch video"}</span></span></button>)}</div>
      {posts.length === 0 && <p className="empty-note">No posts yet.</p>}
    </>}
  </section></div>;
}
