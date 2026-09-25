"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Bookmark, ChevronRight, Compass, Eye, Heart, MessageCircle, Plus, Quote, Search, Share2, UserRound, Volume2, VolumeX, Wallet } from "lucide-react";
import { getFeed, getUserProfile, setFollow, sharePost, toggleLike } from "@/lib/api";
import { errorCopy, optionalCopy, uiCopy } from "@/lib/copy";
import { demoPosts } from "@/lib/seed";
import { getSupabase } from "@/lib/supabase";
import { marketEnded, useMarketClock } from "@/lib/markets";
import type { FeedPost, FeedTab, MarketSummary, Side, UserProfile } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { useWatchSignals } from "@/lib/use-watch-signals";
import { BuySheet } from "@/components/buy-sheet";
import { CommentsDrawer } from "@/components/comments-drawer";
import { MarketPicker } from "@/components/market-picker";
import { MarketsView } from "@/components/markets-view";
import { OnboardingPicker } from "@/components/onboarding-picker";
import { PeopleSearch, ProfilePanel } from "@/components/people-panels";
import { PostComposer } from "@/components/post-composer";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import { WalletSheet } from "@/components/wallet-sheet";
import { PositionsPanel } from "@/components/positions-panel";
import "@/styles/wallet-chip.css";

function short(value: string): string {
  return value.length > 18 ? value.slice(0, 8) + "..." + value.slice(-5) : value;
}
function price(value: number | null): string {
  return value === null ? "\u2014" : (value * 100).toFixed(1) + "\u00a2";
}
function compactUsd(value: number): string {
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (value >= 10_000) return "$" + Math.round(value / 1000) + "k";
  if (value >= 1_000) return "$" + (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "$" + value.toFixed(2);
}
function chance(value: number | null): string {
  return value === null ? "\u2014" : Math.round(value * 100) + "%";
}
function ProbabilityBar({ yes }: { yes: number | null }) {
  return <div className={"prob-bar" + (yes === null ? " unknown" : "")} aria-hidden="true">{yes !== null && <span style={{ width: Math.max(2, Math.min(98, yes * 100)) + "%" }} />}</div>;
}
function question(post: FeedPost): string {
  return post.market.question?.trim() || post.caption?.trim() || "Market " + short(post.panta_market_id);
}

type ComposerTarget = { quotePost: FeedPost; market?: never } | { market: MarketSummary; quotePost?: never };
type BuyTarget = { post: Pick<FeedPost, "panta_market_id" | "market" | "caption">; side: Side };

export function FeedExperience({ initialPostId, initialMarketId }: { initialPostId?: string; initialMarketId?: string }) {
  const session = useSession();
  const marketNow = useMarketClock();
  const { authenticated, getAccessToken, authorized, me, synced } = session;
  const [tab, setTab] = useState<FeedTab | "markets">(initialMarketId ? "markets" : "for_you");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [source, setSource] = useState<"live" | "demo">("live");
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(initialPostId || "");
  const [unmutedId, setUnmutedId] = useState("");
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [toast, setToast] = useState("");
  const [buy, setBuy] = useState<BuyTarget | null>(null);
  const [comments, setComments] = useState<FeedPost | null>(null);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [marketPicker, setMarketPicker] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [positions, setPositions] = useState(false);
  const [account, setAccount] = useState(false);
  const walletSetupShown = useRef(false);
  const requestedProfiles = useRef(new Set<string>());
  const refreshKey = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const videos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const activePost = posts.find((post) => post.id === activeId) || posts[0];
  const watch = useWatchSignals(tab === "markets" ? "" : activeId, session);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "markets") setTab("markets");
  }, []);
  useEffect(() => {
    if (!session.authenticated) walletSetupShown.current = false;
    else if (session.ready && !session.address && !walletSetupShown.current) {
      walletSetupShown.current = true;
      setAccount(true);
    }
  }, [session.authenticated, session.ready, session.address]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }, []);
  const onProfile = useCallback((profile: UserProfile) => {
    setProfiles((current) => ({ ...current, [profile.id]: profile }));
  }, []);

  const refresh = useCallback(async (focusId?: string) => {
    if (tab === "markets") return;
    const key = ++refreshKey.current;
    setLoading(true);
    setFeedError("");
    try {
      const token = authenticated && synced ? await getAccessToken() : null;
      let page = await getFeed(null, token, { tab });
      const gathered = [...page.posts];
      let pages = 0;
      while (focusId && !gathered.some((post) => post.id === focusId) && page.next_cursor && pages < 20) {
        page = await getFeed(page.next_cursor, token, { tab });
        gathered.push(...page.posts);
        pages++;
      }
      if (refreshKey.current !== key) return;
      const visible = gathered.length || tab !== "for_you" ? gathered : demoPosts;
      setPosts(visible);
      setSource(gathered.length ? "live" : "demo");
      setCursor(gathered.length ? page.next_cursor : null);
      setActiveId(focusId && visible.some((post) => post.id === focusId) ? focusId : visible[0]?.id || "");
      if (focusId && gathered.some((post) => post.id === focusId)) {
        window.setTimeout(() => document.getElementById("post-" + focusId)?.scrollIntoView({ block: "start" }), 80);
      } else if (focusId) notify("That post could not be found.");
    } catch (cause) {
      if (refreshKey.current === key) {
        setPosts(tab === "for_you" ? demoPosts : []);
        setSource("demo");
        setCursor(null);
        setActiveId(tab === "for_you" ? demoPosts[0]?.id || "" : "");
        setFeedError(errorCopy(cause));
      }
    } finally { if (refreshKey.current === key) setLoading(false); }
  }, [tab, authenticated, synced, getAccessToken, notify]);

  useEffect(() => { if (tab !== "markets") void refresh(initialPostId); }, [tab, initialPostId, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore || tab === "markets" || source === "demo") return;
    setLoadingMore(true);
    try {
      const token = authenticated && synced ? await getAccessToken() : null;
      const page = await getFeed(cursor, token, { tab });
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...page.posts.filter((post) => !seen.has(post.id))];
      });
      setCursor(page.next_cursor);
    } catch (cause) { notify(errorCopy(cause)); }
    finally { setLoadingMore(false); }
  }

  useEffect(() => {
    if (tab === "markets") return;
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.55)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveId(visible.target.getAttribute("data-post-id") || "");
    }, { root, threshold: [0.25, 0.55, 0.8] });
    root.querySelectorAll("[data-post-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts, tab]);

  useEffect(() => {
    videos.current.forEach((video, id) => {
      video.muted = id !== unmutedId;
      if (tab !== "markets" && id === activeId) {
        void video.play().catch(() => {
          video.muted = true;
          setUnmutedId("");
          void video.play().catch(() => undefined);
        });
      } else video.pause();
    });
  }, [activeId, unmutedId, posts, tab]);

  useEffect(() => {
    if (!activePost?.id || tab === "markets") return;
    const supabase = getSupabase();
    if (!supabase) return;
    const id = activePost.id;
    const channel = supabase.channel("likes:" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: "post_id=eq." + id }, () => {
        void getFeed(null, null, { tab }).then((page) => {
          const updated = page.posts.find((post) => post.id === id);
          if (updated) setPosts((current) => current.map((post) => post.id === id ? { ...post, like_count: updated.like_count } : post));
        }).catch(() => undefined);
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activePost?.id, tab]);

  useEffect(() => {
    const id = activePost?.author.id;
    if (!authenticated || !id || id === me?.id || requestedProfiles.current.has(id)) return;
    requestedProfiles.current.add(id);
    void authorized((token) => getUserProfile(id, token)).then(onProfile).catch(() => undefined);
  }, [authenticated, activePost?.author.id, me?.id, authorized, onProfile]);

  async function like(post: FeedPost) {
    if (post.demo) { notify("This is a demo post."); return; }
    if (!session.authenticated) { session.login(); return; }
    try {
      const result = await authorized((token) => toggleLike(post.id, token));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked_by_me: result.liked, like_count: result.like_count } : item));
    } catch (cause) { notify(errorCopy(cause)); }
  }
  async function follow(post: FeedPost) {
    if (post.demo) { notify("This is a demo post."); return; }
    if (!session.authenticated) { session.login(); return; }
    const id = post.author.id;
    const current = profiles[id];
    try {
      const result = await authorized((token) => setFollow(id, !(current?.is_following ?? post.author.is_following ?? false), token));
      onProfile({ id, display_name: post.author.display_name, username: post.author.username || null, bio: null, avatar_url: post.author.avatar_url || null, likes_received: 0, follower_count: result.follower_count, following_count: current?.following_count ?? 0, post_count: current?.post_count ?? 0, follows_me: current?.follows_me ?? false, is_following: result.following, is_friend: result.following && Boolean(current?.follows_me) });
    } catch (cause) { notify(errorCopy(cause)); }
  }
  async function share(post: FeedPost) {
    const url = window.location.origin + "/post/" + post.id;
    try {
      if (navigator.share) await navigator.share({ title: "Igloo", text: question(post), url });
      else { await navigator.clipboard.writeText(url); notify(uiCopy("share.fallback")); }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      notify(errorCopy(cause));
      return;
    }
    if (session.authenticated && !post.demo) {
      try {
        const result = await authorized((token) => sharePost(post.id, token));
        setPosts((current) => current.map((item) => item.id === post.id ? { ...item, share_count: result.share_count } : item));
      } catch (cause) { notify(errorCopy(cause)); }
    }
  }

  function openPicker() {
    if (!session.authenticated) { session.login(); return; }
    setMarketPicker(true);
  }
  function openQuote(post: FeedPost) {
    if (post.demo) { notify("This is a demo post."); return; }
    if (!session.authenticated) { session.login(); return; }
    setComposer({ quotePost: post });
  }
  function openOriginal(id: string) {
    if (posts.some((post) => post.id === id) && tab !== "markets") document.getElementById("post-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.assign("/post/" + encodeURIComponent(id));
  }
  function openPeople() {
    if (!session.authenticated) { session.login(); return; }
    setPeopleSearch(true);
  }
  function onPosted(id: string) {
    setComposer(null);
    window.location.assign("/post/" + encodeURIComponent(id));
  }
  function switchTab(next: FeedTab | "markets") {
    if (initialMarketId) { window.location.assign(next === "markets" ? "/?tab=markets" : "/"); return; }
    if (next === "following" && !session.authenticated) { session.login(); return; }
    feedRef.current?.scrollTo({ top: 0 });
    setTab(next);
    setPosts([]);
    setCursor(null);
    setActiveId("");
  }
  function buyMarket(market: MarketSummary, side: Side) {
    setBuy({ post: { panta_market_id: market.panta_market_id, caption: null, market: { question: market.question, yes_price: market.yes_price, no_price: market.no_price, category: market.category, phase: market.phase, end_time: market.end_time } }, side });
  }

  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <main className="setup-screen"><h1>Igloo</h1><p>Set NEXT_PUBLIC_PRIVY_APP_ID in apps/web/.env.local to enable sign in.</p></main>;

  const follower = (post: FeedPost) => profiles[post.author.id];
  return <div className={"app-frame" + (tab === "markets" ? " market-mode" : "")}>
    <aside className="left-nav" aria-label="Main navigation"><div className="wordmark"><span className="logo-square" />Igloo</div><nav>
      <button type="button" className={"nav-item" + (tab === "for_you" ? " active" : "")} onClick={() => switchTab("for_you")}><Compass size={20} />For You</button>
      <button type="button" className={"nav-item" + (tab === "markets" ? " active" : "")} onClick={() => switchTab("markets")}><Search size={20} />Markets</button>
      <button type="button" className="nav-item" onClick={openPeople}><UserRound size={20} />Find people</button>
      <button type="button" className="nav-item" onClick={() => session.authenticated ? setPositions(true) : session.login()}><Bookmark size={20} />Positions</button>
      <button type="button" className="nav-item" onClick={() => session.authenticated ? window.location.assign("/profile") : session.login()}><UserRound size={20} />Profile</button>
      <button type="button" className="nav-item nav-post" onClick={openPicker}><Plus size={20} />Post</button>
    </nav><button type="button" className="left-footer profile-entry" onClick={() => session.authenticated ? window.location.assign("/profile") : session.login()}><ProfileAvatar src={me?.avatar_url} name={me?.display_name} size={34} /><span>{session.authenticated ? (me?.username ? "@" + me.username : me?.display_name || "Profile") : "Sign in"}<small>{session.authenticated ? "View profile" : "Join Igloo"}</small></span></button></aside>

    <main className="feed-column"><header className="feed-header"><div className="mobile-wordmark"><span className="logo-square" />Igloo</div><nav className="top-tabs" aria-label="Feed tabs">
      <button type="button" className={tab === "markets" ? "active" : ""} onClick={() => switchTab("markets")}>Markets</button>
      <button type="button" className={tab === "following" ? "active" : ""} onClick={() => switchTab("following")}>Following</button>
      <button type="button" className={tab === "for_you" ? "active" : ""} onClick={() => switchTab("for_you")}>For You</button>
    </nav>{session.authenticated ? <button type="button" className="header-wallet" onClick={() => setAccount(true)}><Image src="/brand/usdc-token.svg" alt="" width={32} height={32} className="usdc-token-mark" />{session.balance === null ? <span>Wallet</span> : <><span className="wallet-full">{session.balance.toFixed(2)} USDC</span><span className="wallet-short" aria-hidden="true">{compactUsd(session.balance)}</span></>}</button> : <button type="button" className="header-signin" onClick={session.login}>Sign in</button>}</header>

    {tab === "markets" ? <MarketsView marketId={initialMarketId} session={session} onPost={(market) => setComposer({ market })} onQuote={openQuote} onBuy={buyMarket} onOpenPost={openOriginal} onBack={() => window.location.assign("/?tab=markets")} /> : <div className="feed-scroll" ref={feedRef} onScroll={(event) => { const element = event.currentTarget; if (element.scrollTop + element.clientHeight >= element.scrollHeight - element.clientHeight * 1.5) void loadMore(); }}>
      {posts.map((post, index) => <article className="feed-item" id={"post-" + post.id} data-post-id={post.id} key={post.id}>
        {videoErrors[post.id] ? <div className="video-fallback"><span>{post.market.category || "Market"}</span><strong>{question(post)}</strong><small>Video unavailable</small></div> : <video ref={(element) => { if (element) videos.current.set(post.id, element); else videos.current.delete(post.id); }} src={post.video_url} className="post-video" autoPlay={post.id === activeId} loop muted playsInline preload={post.id === activeId || posts[index - 1]?.id === activeId ? "auto" : "metadata"} onPlay={() => watch.onPlay(post.id)} onPause={() => watch.onPause(post.id)} onTimeUpdate={(event) => watch.onTimeUpdate(post.id, event.currentTarget)} onEnded={() => watch.onEnded(post.id)} onClick={() => setUnmutedId((current) => current === post.id ? "" : post.id)} onError={() => setVideoErrors((current) => ({ ...current, [post.id]: true }))} aria-label={question(post) + " video; tap to toggle sound"} />}
        <div className="video-shade" aria-hidden /><div className="post-topline"><span className="category-tag">{post.market.category || "Market"}</span>{post.demo && <span className="demo-tag">Demo</span>}</div>
        <div className="post-content"><div className="post-copy"><div className="author-line"><button type="button" className="creator" onClick={() => session.authenticated ? (post.author.username ? window.location.assign("/u/" + encodeURIComponent(post.author.username)) : setProfileId(post.author.id)) : session.login()}><ProfileAvatar src={post.author.avatar_url} name={post.author.display_name} size={28} />{authorName(post.author)}</button>{(follower(post)?.is_friend ?? post.author.is_friend) && <span className="friend-badge">Friends</span>}{me?.id !== post.author.id && <button type="button" className={"follow-button" + ((follower(post)?.is_following ?? post.author.is_following) ? " following" : "")} onClick={() => { void follow(post); }}>{follower(post)?.is_following ?? post.author.is_following ? "Following" : "Follow"}</button>}</div><h1>{question(post)}</h1>{post.caption && post.caption !== post.market.question && <p>{post.caption}</p>}{post.quoted_post && <button type="button" className="quoted-preview" onClick={() => openOriginal(post.quoted_post!.id)}><video src={post.quoted_post.video_url} muted playsInline preload="metadata" aria-hidden="true" /><span><small>Quoted post</small><strong><ProfileAvatar src={post.quoted_post.author.avatar_url} name={post.quoted_post.author.display_name} size={21} />{authorName(post.quoted_post.author)}</strong><em>{post.quoted_post.caption || "View original"}</em></span></button>}</div>
          <div className="action-rail"><button type="button" className={"rail-button" + (post.liked_by_me ? " selected" : "")} onClick={() => { void like(post); }} aria-label="Like" title="Like"><Heart size={25} fill={post.liked_by_me ? "currentColor" : "none"} /><span>{post.like_count}</span></button><button type="button" className="rail-button" onClick={() => setComments(post)} aria-label="Comments" title="Comments"><MessageCircle size={25} /><span>{post.comment_count}</span></button><button type="button" className="rail-button" onClick={() => { void share(post); }} aria-label="Share" title="Share"><Share2 size={24} /><span>{post.share_count}</span></button><button type="button" className="rail-button" onClick={() => openQuote(post)} aria-label="Quote" title="Quote"><Quote size={24} /><span>{post.quote_count ?? 0}</span></button><button type="button" className="rail-button sound-button" onClick={() => setUnmutedId((current) => current === post.id ? "" : post.id)} aria-label={unmutedId === post.id ? "Mute video" : "Unmute video"} title={unmutedId === post.id ? "Mute" : "Unmute"}>{unmutedId === post.id ? <Volume2 size={23} /> : <VolumeX size={23} />}</button></div>
          <div className="market-strip"><div className="market-heading"><button type="button" onClick={() => window.location.assign("/market/" + encodeURIComponent(post.panta_market_id))}>View market<ChevronRight size={14} /></button><span className={"status-pill" + (marketEnded(post.market.end_time, marketNow) ? " ended" : "")}>{marketEnded(post.market.end_time, marketNow) ? "Ended" : "Live"}</span></div><div className="chance-row"><span className="chance-value">{chance(post.market.yes_price)}<small>chance</small></span><em>YES</em></div><ProbabilityBar yes={post.market.yes_price} /><div className="trade-sides"><button type="button" className="trade-yes" disabled={marketEnded(post.market.end_time, marketNow)} onClick={() => setBuy({ post, side: "YES" })}><span>YES</span><strong>{price(post.market.yes_price)}</strong></button><button type="button" className="trade-no" disabled={marketEnded(post.market.end_time, marketNow)} onClick={() => setBuy({ post, side: "NO" })}><span>NO</span><strong>{price(post.market.no_price)}</strong></button></div></div>
        </div></article>)}
      {!loading && !feedError && posts.length === 0 && <div className="feed-empty"><strong>{tab === "following" ? "Your following feed is quiet." : "No videos yet."}</strong><p>{tab === "following" ? optionalCopy("following.empty", "Follow people to see their videos here.") : "Check back for new market videos."}</p>{tab === "following" && <button type="button" className="subtle-button" onClick={openPeople}><Search size={16} />Find people</button>}</div>}
      {feedError && posts.length === 0 && <div className="feed-empty"><p className="inline-error" role="alert">{feedError}</p><button type="button" className="subtle-button" onClick={() => { void refresh(initialPostId); }}>Retry</button></div>}
      {loadingMore && <div className="load-indicator">Loading more...</div>}
    </div>}
    <nav className="mobile-nav" aria-label="Mobile navigation"><button type="button" className={tab === "for_you" || tab === "following" ? "active" : ""} onClick={() => switchTab("for_you")} aria-label="Feed" title="Feed"><Compass size={21} /><span>Feed</span></button><button type="button" className={tab === "markets" ? "active" : ""} onClick={() => switchTab("markets")} aria-label="Markets" title="Markets"><Search size={21} /><span>Markets</span></button><button type="button" onClick={() => session.authenticated ? setPositions(true) : session.login()} aria-label="Positions" title="Positions"><Bookmark size={21} /><span>Positions</span></button><button type="button" className="create-nav" onClick={openPicker} aria-label="Create post" title="Create post"><Plus size={24} /></button><button type="button" onClick={() => session.authenticated ? window.location.assign("/profile") : session.login()} aria-label="Profile" title="Profile"><ProfileAvatar src={me?.avatar_url} name={me?.display_name} size={23} /><span>Profile</span></button></nav>
    {loading && tab !== "markets" && <div className="feed-loading" role="status">Updating feed...</div>}</main>

    <aside className="right-panel"><div className="right-title"><Eye size={14} />Now watching</div>{activePost && tab !== "markets" && <><div className="watch-card"><span className="right-category">{activePost.market.category || "Market"}</span><h2>{question(activePost)}</h2><span className="chance-value">{chance(activePost.market.yes_price)}<small>chance</small></span><ProbabilityBar yes={activePost.market.yes_price} /><div className="right-prices"><button type="button" disabled={marketEnded(activePost.market.end_time, marketNow)} onClick={() => setBuy({ post: activePost, side: "YES" })}><span>Buy Yes</span><strong>{price(activePost.market.yes_price)}</strong></button><button type="button" disabled={marketEnded(activePost.market.end_time, marketNow)} onClick={() => setBuy({ post: activePost, side: "NO" })}><span>Buy No</span><strong>{price(activePost.market.no_price)}</strong></button></div></div>{activePost.caption && <p className="right-caption">{activePost.caption}</p>}</>}<div className="right-bottom"><button type="button" onClick={() => session.authenticated ? setPositions(true) : session.login()}><Wallet size={17} />View positions</button><button type="button" onClick={openPicker}><Plus size={17} />Post</button></div></aside>

    {toast && <div className="toast" role="status">{toast}</div>}
    {buy && <BuySheet post={buy.post} side={buy.side} session={session} onClose={() => setBuy(null)} onConfirmed={() => notify("Order confirmed.")} />}
    {comments && <CommentsDrawer post={comments} session={session} onClose={() => setComments(null)} onAdded={() => setPosts((current) => current.map((post) => post.id === comments.id ? { ...post, comment_count: post.comment_count + 1 } : post))} />}
    {marketPicker && <MarketPicker session={session} onClose={() => setMarketPicker(false)} onSelect={(market) => { setMarketPicker(false); setComposer({ market }); }} />}
    {composer && <PostComposer market={composer.market} quotePost={composer.quotePost} session={session} onClose={() => setComposer(null)} onPosted={onPosted} />}
    {peopleSearch && <PeopleSearch session={session} onClose={() => setPeopleSearch(false)} onOpenProfile={(user) => { setPeopleSearch(false); if (user.username) window.location.assign("/u/" + encodeURIComponent(user.username)); else setProfileId(user.id); }} />}
    {profileId && <ProfilePanel id={profileId} session={session} onClose={() => setProfileId("")} onOpenPost={openOriginal} onProfile={onProfile} />}
    {positions && <PositionsPanel session={session} onClose={() => setPositions(false)} />}
    {session.synced && me && (!me.onboarded || ("username" in me && !me.username)) && <OnboardingPicker session={session} />}
    {account && <WalletSheet session={session} onClose={() => setAccount(false)} notify={notify} />}
  </div>;
}
