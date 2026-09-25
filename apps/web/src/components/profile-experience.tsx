"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Heart, Pencil, Wallet, X } from "lucide-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getLikedPosts, getUserByUsername, getUserPosts, getUserProfile, requestAvatarUpload, setFollow } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import { getSupabase } from "@/lib/supabase";
import type { FeedPost, UserProfile } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { OnboardingPicker } from "@/components/onboarding-picker";
import { ProfileAvatar } from "@/components/profile-avatar";
import { WalletSheet } from "@/components/wallet-sheet";

type ProfileTab = "videos" | "liked";
export function ProfileExperience({ own = false }: { own?: boolean }) {
  const params = useParams<{ username?: string }>();
  const username = params.username;
  const session = useSession();
  const { authorized, me } = session;
  const myId = me?.id;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("videos");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [wallet, setWallet] = useState(false);
  const [draft, setDraft] = useState({ username: "", display_name: "", bio: "" });
  const isOwn = own || Boolean(me?.id && profile?.id === me.id);

  useEffect(() => {
    if (!session.ready || (own && !session.authenticated)) { setLoading(false); return; }
    if (own && !myId) return;
    if (!own && !username) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void authorized(async (token) => {
      const user = own ? await getUserProfile(myId!, token) : await getUserByUsername(username!, token);
      const page = await getUserPosts(user.id, token);
      return { user, page };
    }).then(({ user, page }) => { if (!cancelled) { setProfile(user); setPosts(page.posts); setCursor(page.next_cursor); } })
      .catch((cause) => { if (!cancelled) setError(errorCopy(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorized, myId, own, session.authenticated, session.ready, username]);

  useEffect(() => {
    if (!isOwn || tab !== "liked" || !session.authenticated) return;
    let cancelled = false;
    setLoading(true);
    void authorized((token) => getLikedPosts(null, token)).then((page) => {
      if (!cancelled) { setPosts(page.posts); setCursor(page.next_cursor); }
    }).catch((cause) => { if (!cancelled) setError(errorCopy(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorized, isOwn, tab, session.authenticated]);

  async function switchTab(next: ProfileTab) {
    if (next === tab || !profile) return;
    setTab(next);
    setError("");
    if (next === "videos") {
      setLoading(true);
      try { const page = await authorized((token) => getUserPosts(profile.id, token)); setPosts(page.posts); setCursor(page.next_cursor); }
      catch (cause) { setError(errorCopy(cause)); }
      finally { setLoading(false); }
    }
  }
  async function loadMore() {
    if (!cursor || busy || !profile) return;
    setBusy(true);
    try {
      const page = await authorized((token) => tab === "liked" ? getLikedPosts(cursor, token) : getUserPosts(profile.id, token, cursor));
      setPosts((current) => [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))]);
      setCursor(page.next_cursor);
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(false); }
  }
  async function toggleFollow() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const result = await authorized((token) => setFollow(profile.id, !profile.is_following, token));
      setProfile({ ...profile, is_following: result.following, is_friend: result.following && profile.follows_me, follower_count: result.follower_count });
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(false); }
  }
  async function saveProfile() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await session.updateProfile({ username: draft.username.trim().toLowerCase(), display_name: draft.display_name.trim(), bio: draft.bio.trim() });
      setProfile((current) => current ? { ...current, ...updated } : current);
      setEdit(false);
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(false); }
  }
  async function uploadAvatar(file: File | undefined) {
    if (!file || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG, or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Avatar must be 2 MB or smaller."); return; }
    const supabase = getSupabase();
    if (!supabase) { setError("Avatar storage is unavailable."); return; }
    setBusy(true);
    setError("");
    try {
      const signed = await authorized((token) => requestAvatarUpload(file.type, token));
      const { error: uploadError } = await supabase.storage.from("avatars").uploadToSignedUrl(signed.path, signed.token, file);
      if (uploadError) throw uploadError;
      const updated = await session.updateProfile({ avatar_url: signed.public_url });
      setProfile((current) => current ? { ...current, ...updated } : current);
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(false); }
  }

  if (!session.authenticated) return <main className="profile-page"><header className="profile-toolbar"><Link href="/"><ArrowLeft size={19} />Feed</Link><span>Igloo</span></header><div className="profile-empty"><h1>{own ? "Your profile" : "@" + username}</h1><button className="solid-action" onClick={session.login}>Sign in</button></div></main>;
  return <main className="profile-page"><header className="profile-toolbar"><Link href="/"><ArrowLeft size={19} />Feed</Link><span><span className="logo-square" />Igloo</span>{isOwn && <button type="button" className="icon-action" onClick={() => setWallet(true)} aria-label="Wallet" title="Wallet"><Wallet size={19} /></button>}</header>
    {loading && !profile && <p className="profile-empty">Loading profile...</p>}
    {error && <p className="inline-error profile-error" role="alert">{error}</p>}
    {profile && <><section className="profile-hero"><ProfileAvatar src={profile.avatar_url} name={profile.display_name} size={88} /><div className="profile-identity"><h1>{profile.username ? "@" + profile.username : profile.display_name || "Igloo member"}</h1>{profile.username && <p className="profile-display">{profile.display_name}</p>}{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div>
      <div className="profile-counts"><span><strong>{profile.following_count}</strong> Following</span><span><strong>{profile.follower_count}</strong> Followers</span><span><strong>{profile.likes_received}</strong> Likes</span></div>
      <div className="profile-primary-actions">{isOwn ? <><button type="button" className="subtle-button" onClick={() => { setDraft({ username: profile.username || "", display_name: profile.display_name || "", bio: profile.bio || "" }); setEdit(true); }}><Pencil size={16} />Edit profile</button><button type="button" className="subtle-button" onClick={() => setWallet(true)}><Wallet size={16} />Wallet</button></> : <><button type="button" className="solid-action" disabled={busy} onClick={() => { void toggleFollow(); }}>{profile.is_following ? "Following" : "Follow"}</button>{profile.is_friend && <span className="friend-badge">Friends</span>}</>}</div></section>
      <nav className="profile-tabs" aria-label="Profile videos"><button type="button" className={tab === "videos" ? "active" : ""} onClick={() => { void switchTab("videos"); }}>Videos</button>{isOwn && <button type="button" className={tab === "liked" ? "active" : ""} onClick={() => { void switchTab("liked"); }}><Heart size={15} />Liked</button>}</nav>
      {loading ? <p className="profile-empty">Loading videos...</p> : posts.length ? <div className="profile-video-grid">{posts.map((post) => <Link key={post.id} href={"/post/" + encodeURIComponent(post.id)}><video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" /><span>{post.caption || post.market.question || "Watch video"}</span></Link>)}</div> : <p className="profile-empty">{tab === "liked" ? "No liked videos yet." : "No videos yet."}</p>}
      {cursor && <button type="button" className="subtle-button profile-more" disabled={busy} onClick={() => { void loadMore(); }}>Load more</button>}
    </>}
    {edit && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEdit(false); }}><section className="sheet edit-profile-sheet" role="dialog" aria-modal="true" aria-label="Edit profile"><div className="sheet-head"><h2>Edit profile</h2><button className="icon-action" type="button" onClick={() => setEdit(false)} aria-label="Close" title="Close"><X size={20} /></button></div><label className="avatar-edit"><ProfileAvatar src={profile?.avatar_url} name={profile?.display_name} size={68} /><span><Camera size={16} />Change photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); }} /></label><label>Username<input maxLength={20} value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") })} /></label><label>Display name<input maxLength={80} value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} /></label><label>Bio<textarea maxLength={160} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /><small>{draft.bio.length}/160</small></label>{error && <p className="inline-error">{error}</p>}<button type="button" className="solid-action" disabled={busy || !/^[a-z0-9_.]{3,20}$/.test(draft.username)} onClick={() => { void saveProfile(); }}>{busy ? "Saving..." : "Save"}</button></section></div>}
    {wallet && <WalletSheet session={session} onClose={() => setWallet(false)} notify={(message) => { setError(message); window.setTimeout(() => setError("") , 3500); }} />}
    {session.synced && me && (!me.onboarded || ("username" in me && !me.username)) && <OnboardingPicker session={session} />}
  </main>;
}
