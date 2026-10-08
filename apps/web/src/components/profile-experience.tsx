"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Heart, Settings, VideoOff, X } from "lucide-react";
import { useParams } from "next/navigation";
import { ApiError, getLikedPosts, getUserByUsername, getUserPosts, getUserProfile, setFollow } from "@/lib/api";
import { uploadAvatar } from "@/lib/avatar";
import { errorCopy } from "@/lib/copy";
import type { FeedPost, UserProfile } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { AppShell } from "@/components/app-shell";
import { CountUp } from "@/components/count-up";
import { withTransition } from "@/lib/motion";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { ProfileAvatar } from "@/components/profile-avatar";
import { WalletSheet } from "@/components/wallet-sheet";
import { ThumbnailGrid } from "@/components/thumbnail-grid";
import { EmptyState } from "@/components/ui";
import "@/styles/profile.css";

type ProfileTab = "videos" | "liked";
const compact = (value: number) => value >= 1000 ? (value / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(value);

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
  const [toast, setToast] = useState("");
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

  useEffect(() => {
    if (!own || !profile || new URLSearchParams(window.location.search).get("edit") !== "1") return;
    window.history.replaceState(null, "", "/profile");
    setDraft({ username: profile.username || "", display_name: profile.display_name || "", bio: profile.bio || "" });
    setEdit(true);
  }, [own, profile]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }
  function openEdit(current: UserProfile) {
    setDraft({ username: current.username || "", display_name: current.display_name || "", bio: current.bio || "" });
    setError("");
    setEdit(true);
  }
  async function switchTab(next: ProfileTab) {
    if (next === tab || !profile) return;
    withTransition(() => setTab(next));
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
      notify("Profile saved.");
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(false); }
  }
  async function changeAvatar(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await uploadAvatar(session, file);
      setProfile((current) => current ? { ...current, ...updated } : current);
    } catch (cause) { setError(cause instanceof ApiError ? errorCopy(cause) : cause instanceof Error ? cause.message : errorCopy(cause)); }
    finally { setBusy(false); }
  }

  const handle = profile?.username ? "@" + profile.username : "";
  const header = isOwn || own
    ? <header className="screen-head"><h1 className="page-title">Profile</h1>{session.authenticated && <a className="icon-btn" href="/settings" aria-label="Settings"><Settings size={18} strokeWidth={1.5} /></a>}</header>
    : <header className="screen-head"><button type="button" className="icon-btn" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")} aria-label="Back"><ArrowLeft size={18} strokeWidth={1.5} /></button><h1 className="grow">{"@" + (username || "")}</h1></header>;

  return <AppShell active={own || isOwn ? "profile" : null} session={session}>
    <main className="screen profile-screen">
      {header}
      {!session.authenticated ? <EmptyState icon={<Heart size={26} strokeWidth={1.4} />} title={own ? "Your profile" : "@" + username} action={<button type="button" className="btn btn-primary" onClick={session.login}>Sign in</button>}>Sign in to see profiles, follow people, and post your takes.</EmptyState> : <>
        {loading && !profile && <p className="loading-line">Loading profile</p>}
        {error && !edit && <p className="inline-error" role="alert">{error}</p>}
        {profile && <>
          <section className="profile-hero slab">
            <div className="slab-section profile-identity">
              <span className="avatar-ring"><ProfileAvatar src={profile.avatar_url} name={profile.display_name} size={72} /></span>
              <div><h2>{profile.display_name || handle || "Igloo member"}</h2>{handle && profile.display_name && <span className="handle">{handle}</span>}</div>
            </div>
            {profile.bio && <div className="slab-section"><p className="profile-bio">{profile.bio}</p></div>}
            <div className="slab-section slab-split profile-counts" style={{ ["--cols" as string]: 3 }}><div className="stat"><span className="label">Following</span><strong><CountUp value={profile.following_count} format={(n) => compact(Math.round(n))} /></strong></div><div className="stat"><span className="label">Followers</span><strong><CountUp value={profile.follower_count} format={(n) => compact(Math.round(n))} /></strong></div><div className="stat"><span className="label">Likes</span><strong><CountUp value={profile.likes_received} format={(n) => compact(Math.round(n))} /></strong></div></div>
          </section>
          <div className="profile-actions">{isOwn
              ? <><button type="button" className="btn" onClick={() => openEdit(profile)}>Edit profile</button><button type="button" className="btn" onClick={() => setWallet(true)}>Wallet</button></>
              : <><button type="button" className={"btn " + (profile.is_following ? "" : "btn-primary")} disabled={busy} onClick={() => { void toggleFollow(); }}>{profile.is_following ? "Following" : "Follow"}</button>{profile.is_friend && <span className="tag tag-yes">Friends</span>}</>}</div>
          <nav className="line-tabs profile-tabs" aria-label="Profile videos"><button type="button" className={tab === "videos" ? "active" : ""} onClick={() => { void switchTab("videos"); }}>Videos</button>{isOwn && <button type="button" className={tab === "liked" ? "active" : ""} onClick={() => { void switchTab("liked"); }}>Liked</button>}</nav>
          {loading ? <p className="loading-line">Loading videos</p> : posts.length ? <ThumbnailGrid posts={posts} liked={tab === "liked"} /> : <EmptyState icon={<VideoOff size={24} strokeWidth={1.4} />} title={tab === "liked" ? "No liked videos yet" : "No videos yet"}>{isOwn && tab === "videos" ? "Post a take on any market and it shows up here." : undefined}</EmptyState>}
          {cursor && <button type="button" className="btn load-more" disabled={busy} onClick={() => { void loadMore(); }}>Load more</button>}
        </>}
      </>}
    </main>

    {edit && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEdit(false); }}><section className="sheet edit-profile-sheet" role="dialog" aria-modal="true" aria-label="Edit profile">
      <div className="sheet-head"><button className="icon-btn sm" type="button" onClick={() => setEdit(false)} aria-label="Close"><X size={17} strokeWidth={1.5} /></button><h2 className="grow">Edit profile</h2><button type="button" className="btn btn-primary btn-sm" disabled={busy || !/^[a-z0-9_.]{3,20}$/.test(draft.username)} onClick={() => { void saveProfile(); }}>{busy ? "Saving…" : "Save"}</button></div>
      <label className="edit-avatar"><span className="avatar-ring"><ProfileAvatar src={profile?.avatar_url} name={profile?.display_name} size={84} /></span><span className="onboarding-avatar-edit" aria-hidden="true"><Camera size={14} strokeWidth={1.5} /></span><span className="visually-hidden">Change photo</span><input type="file" className="visually-hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void changeAvatar(event.target.files?.[0]); }} /></label>
      <label className="field"><span className="label">Display name</span><input className="input" maxLength={80} value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} /></label>
      <label className="field"><span className="label">Username</span><span className="input-wrap"><span>@</span><input maxLength={20} value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") })} /></span></label>
      <label className="field"><span className="label">Bio</span><textarea className="textarea" maxLength={160} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /><span className="field-hint">{draft.bio.length}/160</span></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </section></div>}
    {wallet && <WalletSheet session={session} onClose={() => setWallet(false)} notify={notify} />}
    {toast && <div className="toast" role="status">{toast}</div>}
    {session.synced && me && <OnboardingFlow session={session} />}
  </AppShell>;
}
