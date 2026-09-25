"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Check, Compass, Copy, Heart, MessageCircle, Plus, Share2, UserRound, Volume2, VolumeX, Wallet, X } from "lucide-react";
import { getFeed, sharePost, toggleLike } from "@/lib/api";
import { errorCopy, uiCopy } from "@/lib/copy";
import { demoPosts } from "@/lib/seed";
import { getSupabase } from "@/lib/supabase";
import type { FeedPost, Side } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { BuySheet } from "@/components/buy-sheet";
import { CommentsDrawer } from "@/components/comments-drawer";
import { PostComposer } from "@/components/post-composer";
import { PositionsPanel } from "@/components/positions-panel";

function short(value: string): string {
  return value.length > 18 ? value.slice(0, 8) + "..." + value.slice(-5) : value;
}

function price(value: number | null): string {
  return value === null ? "\u2014" : (value * 100).toFixed(1) + "\u00a2";
}

function question(post: FeedPost): string {
  return post.market.question?.trim() || post.caption?.trim() || "Market " + short(post.panta_market_id);
}

export function FeedExperience({ initialPostId }: { initialPostId?: string }) {
  const session = useSession();
  const { authenticated, getAccessToken } = session;
  const [posts, setPosts] = useState<FeedPost[]>(demoPosts);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(initialPostId || demoPosts[0]?.id || "");
  const [unmutedId, setUnmutedId] = useState("");
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState("");
  const [buy, setBuy] = useState<{ post: FeedPost; side: Side } | null>(null);
  const [comments, setComments] = useState<FeedPost | null>(null);
  const [composer, setComposer] = useState(false);
  const [positions, setPositions] = useState(false);
  const [account, setAccount] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const videos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const activePost = posts.find((post) => post.id === activeId) || posts[0];
  const realtimePostId = activePost?.id;
  const realtimeDemo = activePost?.demo;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }, []);

  const refresh = useCallback(async (focusId?: string) => {
    setLoading(true);
    try {
      const token = authenticated ? await getAccessToken() : null;
      let page = await getFeed(null, token);
      const gathered = [...page.posts];
      let loops = 0;
      while (focusId && !gathered.some((post) => post.id === focusId) && page.next_cursor && loops < 20) {
        page = await getFeed(page.next_cursor, token);
        gathered.push(...page.posts);
        loops++;
      }
      if (gathered.length) {
        setPosts(gathered);
        setSource("live");
        setCursor(page.next_cursor);
      } else {
        setPosts(demoPosts);
        setSource("demo");
        setCursor(null);
      }
      if (focusId && (gathered.some((post) => post.id === focusId) || demoPosts.some((post) => post.id === focusId))) {
        setActiveId(focusId);
        window.setTimeout(() => document.getElementById("post-" + focusId)?.scrollIntoView({ block: "start" }), 80);
      } else if (focusId) {
        notify("That post could not be found.");
      }
    } catch {
      setPosts(demoPosts);
      setSource("demo");
      setCursor(null);
      if (focusId && !demoPosts.some((post) => post.id === focusId)) notify("The feed is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken, notify]);

  useEffect(() => { void refresh(initialPostId); }, [initialPostId, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore || source !== "live") return;
    setLoadingMore(true);
    try {
      const token = authenticated ? await getAccessToken() : null;
      const page = await getFeed(cursor, token);
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...page.posts.filter((post) => !seen.has(post.id))];
      });
      setCursor(page.next_cursor);
    } catch (cause) {
      notify(errorCopy(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveId(visible.target.getAttribute("data-post-id") || "");
    }, { root, threshold: [0.25, 0.55, 0.8] });
    root.querySelectorAll("[data-post-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts]);

  useEffect(() => {
    videos.current.forEach((video, id) => {
      video.muted = id !== unmutedId;
      if (id === activeId) {
        void video.play().catch(() => {
          video.muted = true;
          setUnmutedId("");
          void video.play().catch(() => undefined);
        });
      } else {
        video.pause();
      }
    });
  }, [activeId, unmutedId, posts]);

  useEffect(() => {
    if (!realtimePostId || realtimeDemo) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase.channel("likes:" + realtimePostId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "likes", filter: "post_id=eq." + realtimePostId,
      }, () => { void getFeed(null, null).then((page) => {
        const updated = page.posts.find((post) => post.id === realtimePostId);
        if (updated) setPosts((current) => current.map((post) =>
          post.id === updated.id ? { ...post, like_count: updated.like_count } : post,
        ));
      }).catch(() => undefined); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [realtimePostId, realtimeDemo]);

  async function like(post: FeedPost) {
    if (post.demo) { notify("This is a demo post."); return; }
    if (!session.authenticated) { session.login(); return; }
    try {
      const result = await session.authorized((token) => toggleLike(post.id, token));
      setPosts((current) => current.map((item) =>
        item.id === post.id ? { ...item, liked_by_me: result.liked, like_count: result.like_count } : item,
      ));
    } catch (cause) { notify(errorCopy(cause)); }
  }

  async function share(post: FeedPost) {
    const url = window.location.origin + "/post/" + post.id;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Igloo", text: question(post), url });
      } else {
        await navigator.clipboard.writeText(url);
        notify(uiCopy("share.fallback"));
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      notify(errorCopy(cause));
      return;
    }
    if (!post.demo && session.authenticated) {
      try {
        const result = await session.authorized((token) => sharePost(post.id, token));
        setPosts((current) => current.map((item) =>
          item.id === post.id ? { ...item, share_count: result.share_count } : item,
        ));
      } catch (cause) { notify(errorCopy(cause)); }
    }
  }

  function openComposer() {
    if (!session.authenticated) { session.login(); return; }
    setComposer(true);
  }

  function onPosted(id: string) {
    setComposer(false);
    notify("Video published.");
    void refresh(id);
  }

  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <main className="setup-screen"><h1>Igloo</h1><p>Set NEXT_PUBLIC_PRIVY_APP_ID in apps/web/.env.local to enable sign in.</p></main>;
  }

  return (
    <div className="app-frame">
      <aside className="left-nav" aria-label="Main navigation">
        <div className="wordmark"><span className="logo-square" />Igloo</div>
        <nav>
          <button type="button" className="nav-item active"><Compass size={20} />For you</button>
          <button type="button" className="nav-item" onClick={openComposer}><Plus size={20} />Post</button>
          <button type="button" className="nav-item" onClick={() => session.authenticated ? setPositions(true) : session.login()}><Bookmark size={20} />Positions</button>
          <button type="button" className="nav-item" onClick={() => session.authenticated ? setAccount(true) : session.login()}><UserRound size={20} />Account</button>
        </nav>
        <div className="left-footer">{session.authenticated ? short(session.address || "Wallet connecting") : "Sign in to join the conversation"}</div>
      </aside>

      <main className="feed-column">
        <header className="feed-header">
          <div className="mobile-wordmark"><span className="logo-square" />Igloo</div>
          <strong>For you</strong>
          {session.authenticated ? <button type="button" className="header-wallet" onClick={() => setAccount(true)}><Wallet size={16} />{session.balance === null ? "Wallet" : session.balance.toFixed(2) + " USDC"}</button> :
            <button type="button" className="header-signin" onClick={session.login}>Sign in</button>}
        </header>
        <div className="feed-scroll" ref={feedRef} onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollTop + element.clientHeight >= element.scrollHeight - element.clientHeight * 1.5) void loadMore();
        }}>
          {posts.map((post) => (
            <article className="feed-item" id={"post-" + post.id} data-post-id={post.id} key={post.id}>
              {videoErrors[post.id] ? <div className="video-fallback"><span>{post.market.category || "Market"}</span><strong>{question(post)}</strong><small>Video unavailable</small></div> :
                <video
                  ref={(element) => { if (element) videos.current.set(post.id, element); else videos.current.delete(post.id); }}
                  src={post.video_url}
                  className="post-video"
                  autoPlay={post.id === activeId}
                  loop
                  muted
                  playsInline
                  preload={post.id === activeId ? "auto" : "metadata"}
                  onClick={() => setUnmutedId((current) => current === post.id ? "" : post.id)}
                  onError={() => setVideoErrors((current) => ({ ...current, [post.id]: true }))}
                  aria-label={question(post) + " video; tap to toggle sound"}
                />}
              <div className="video-shade" aria-hidden />
              <div className="post-topline"><span className="category-tag">{post.market.category || "Market"}</span>{post.demo && <span className="demo-tag">Demo</span>}</div>
              <div className="post-content">
                <div className="post-copy"><span className="creator">{"@" + (post.author.display_name || short(post.author.wallet_address || "igloo")).replace(/\s+/g, "").toLowerCase()}</span><h1>{question(post)}</h1>{post.caption && post.caption !== post.market.question && <p>{post.caption}</p>}</div>
                <div className="action-rail">
                  <button type="button" className={"rail-button" + (post.liked_by_me ? " selected" : "")} onClick={() => { void like(post); }} aria-label="Like" title="Like"><Heart size={25} fill={post.liked_by_me ? "currentColor" : "none"} /><span>{post.like_count}</span></button>
                  <button type="button" className="rail-button" onClick={() => setComments(post)} aria-label="Comments" title="Comments"><MessageCircle size={25} /><span>{post.comment_count}</span></button>
                  <button type="button" className="rail-button" onClick={() => { void share(post); }} aria-label="Share" title="Share"><Share2 size={24} /><span>{post.share_count}</span></button>
                  <button type="button" className="rail-button sound-button" onClick={() => setUnmutedId((current) => current === post.id ? "" : post.id)} aria-label={unmutedId === post.id ? "Mute video" : "Unmute video"} title={unmutedId === post.id ? "Mute" : "Unmute"}>{unmutedId === post.id ? <Volume2 size={23} /> : <VolumeX size={23} />}</button>
                </div>
                <div className="market-strip"><div className="market-heading"><span>Trade the market</span><span>{post.market.phase || "Live market"}</span></div><div className="trade-sides">
                  <button type="button" className="trade-yes" onClick={() => setBuy({ post, side: "YES" })}><span>YES</span><strong>{price(post.market.yes_price)}</strong></button>
                  <button type="button" className="trade-no" onClick={() => setBuy({ post, side: "NO" })}><span>NO</span><strong>{price(post.market.no_price)}</strong></button>
                </div></div>
              </div>
            </article>
          ))}
          {loadingMore && <div className="load-indicator">Loading more...</div>}
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button type="button" className="active" aria-label="Feed" title="Feed"><Compass size={21} /><span>Feed</span></button>
          <button type="button" onClick={() => session.authenticated ? setPositions(true) : session.login()} aria-label="Positions" title="Positions"><Bookmark size={21} /><span>Positions</span></button>
          <button type="button" className="create-nav" onClick={openComposer} aria-label="Create post" title="Create post"><Plus size={24} /></button>
          <button type="button" onClick={() => session.authenticated ? setAccount(true) : session.login()} aria-label="Account" title="Account"><UserRound size={21} /><span>Account</span></button>
        </nav>
        {loading && <div className="feed-loading" role="status">Updating feed...</div>}
      </main>

      <aside className="right-panel">
        <div className="right-title">Now watching</div>
        {activePost && <><span className="right-category">{activePost.market.category || "Market"}</span><h2>{question(activePost)}</h2><div className="right-prices"><div><span>YES</span><strong>{price(activePost.market.yes_price)}</strong></div><div><span>NO</span><strong>{price(activePost.market.no_price)}</strong></div></div><p className="right-caption">{activePost.caption}</p></>}
        <div className="right-bottom"><button type="button" onClick={() => session.authenticated ? setPositions(true) : session.login()}><Wallet size={17} />View positions</button><button type="button" onClick={openComposer}><Plus size={17} />Post a take</button></div>
      </aside>

      {toast && <div className="toast" role="status">{toast}</div>}
      {buy && <BuySheet post={buy.post} side={buy.side} session={session} onClose={() => setBuy(null)} onConfirmed={() => { notify("Order confirmed."); }} />}
      {comments && <CommentsDrawer post={comments} session={session} onClose={() => setComments(null)} onAdded={() => {
        setPosts((current) => current.map((post) => post.id === comments.id ? { ...post, comment_count: post.comment_count + 1 } : post));
      }} />}
      {composer && <PostComposer posts={posts} session={session} onClose={() => setComposer(false)} onPosted={onPosted} />}
      {positions && <PositionsPanel session={session} onClose={() => setPositions(false)} />}
      {account && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccount(false); }}><section className="sheet account-sheet" role="dialog" aria-modal="true" aria-label="Account"><div className="sheet-head"><div><span className="eyebrow">Igloo account</span><h2>Your wallet</h2></div><button type="button" className="icon-action" onClick={() => setAccount(false)} aria-label="Close account" title="Close"><X size={20} /></button></div><p className="wallet-balance">{session.balance === null ? "\u2014" : session.balance.toFixed(2)} <span>USDC</span></p><div className="address-line"><span>{session.address || "Connecting wallet"}</span>{session.address && <button type="button" className="icon-action" onClick={() => { void navigator.clipboard.writeText(session.address || ""); notify("Address copied."); }} aria-label="Copy wallet address" title="Copy"><Copy size={17} /></button>}</div><p className="account-state">{session.synced ? <><Check size={16} />Account connected</> : session.syncError || "Connecting account..."}</p>{session.syncError && <button type="button" className="subtle-button" onClick={() => { void session.syncNow().catch(() => notify(uiCopy("error.generic"))); }}>Retry sync</button>}{session.balanceError && <p className="inline-error">{session.balanceError}</p>}<button type="button" className="signout-button" onClick={() => { void session.logout(); setAccount(false); }}>Sign out</button></section></div>}
    </div>
  );
}
