"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, Eye, Heart, MessageCircle, Plus, Quote, Search, Share2, UserPlus, Volume2, VolumeX } from "lucide-react";
import { getFeed, getUserProfile, setFollow, sharePost, toggleLike } from "@/lib/api";
import { errorCopy, optionalCopy, uiCopy } from "@/lib/copy";
import { demoPosts } from "@/lib/seed";
import { getSupabase } from "@/lib/supabase";
import { marketEnded, useMarketClock } from "@/lib/markets";
import { cents, compactUsd, percent, shortId } from "@/lib/format";
import { categoryFor } from "@/lib/categories";
import type { FeedPost, FeedTab, MarketSummary, Side, UserProfile } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { useWatchSignals } from "@/lib/use-watch-signals";
import { AppShell } from "@/components/app-shell";
import { BuySheet } from "@/components/buy-sheet";
import { CommentsDrawer } from "@/components/comments-drawer";
import { MarketPicker } from "@/components/market-picker";
import { MarketsView } from "@/components/markets-view";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { ProfilePanel } from "@/components/people-panels";
import { PostComposer } from "@/components/post-composer";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import { WalletSheet } from "@/components/wallet-sheet";
import { SearchSheet } from "@/components/search-sheet";
import { EmptyState, TickMeter } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { withTransition } from "@/lib/motion";
import "@/styles/feed.css";

function question(post: FeedPost): string {
  return post.market.question?.trim() || post.caption?.trim() || "Market " + shortId(post.panta_market_id);
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
  const [search, setSearch] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [account, setAccount] = useState(false);
  const walletSetupShown = useRef(false);
  const requestedProfiles = useRef(new Set<string>());
  const refreshKey = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const videos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const activePost = posts.find((post) => post.id === activeId) || posts[0];
  const watch = useWatchSignals(tab === "markets" ? "" : activeId, session);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "markets") setTab("markets");
    if (params.get("search") === "1") setSearch(true);
    if (params.get("compose") === "1") setMarketPicker(true);
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
  function onPosted(id: string) {
    setComposer(null);
    window.location.assign("/post/" + encodeURIComponent(id));
  }
  function switchTab(next: FeedTab | "markets") {
    if (initialMarketId) { window.location.assign(next === "markets" ? "/?tab=markets" : "/"); return; }
    if (next === "following" && !session.authenticated) { session.login(); return; }
    withTransition(() => {
      feedRef.current?.scrollTo({ top: 0 });
      setTab(next);
      setPosts([]);
      setCursor(null);
      setActiveId("");
    }, "page");
  }
  function buyMarket(market: MarketSummary, side: Side) {
    setBuy({ post: { panta_market_id: market.panta_market_id, caption: null, market: { question: market.question, yes_price: market.yes_price, no_price: market.no_price, category: market.category, phase: market.phase, end_time: market.end_time } }, side });
  }
  function openAuthor(post: FeedPost) {
    if (!session.authenticated) { session.login(); return; }
    if (post.author.username) window.location.assign("/u/" + encodeURIComponent(post.author.username));
    else setProfileId(post.author.id);
  }

  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <main className="setup-screen"><span className="wordmark"><span className="logo-square" />Igloo</span><p className="muted">Set NEXT_PUBLIC_PRIVY_APP_ID in apps/web/.env.local to enable sign in.</p></main>;

  const follower = (post: FeedPost) => profiles[post.author.id];
  const isFollowing = (post: FeedPost) => follower(post)?.is_following ?? post.author.is_following ?? false;
  const ended = (post: Pick<FeedPost, "market">) => marketEnded(post.market.end_time, marketNow);
  const activeChance = activePost ? percent(activePost.market.yes_price) : null;

  return <AppShell active={tab === "markets" ? "markets" : "home"} session={session} className={tab === "markets" ? "feed-shell markets-mode" : "feed-shell"} onHome={() => switchTab("for_you")} onMarkets={() => switchTab("markets")} onSearch={() => setSearch(true)} onPost={openPicker}>
    {tab === "markets" ? <MarketsView marketId={initialMarketId} session={session} onPost={(market) => setComposer({ market })} onQuote={openQuote} onBuy={buyMarket} onOpenPost={openOriginal} onBack={() => window.location.assign("/?tab=markets")} onSearch={() => setSearch(true)} /> : <div className="feed-stage">
      <main className="feed-column">
        <header className="feed-header"><div className="feed-bar slab">
          <button type="button" className="icon-btn sm" onClick={() => setSearch(true)} aria-label="Search markets and people" title="Search"><Search size={17} strokeWidth={1.5} /></button>
          <nav className="feed-tabs" aria-label="Feed tabs">
            <button type="button" className={tab === "following" ? "active" : ""} onClick={() => switchTab("following")}>Following</button>
            <button type="button" className={tab === "for_you" ? "active" : ""} onClick={() => switchTab("for_you")}>For you</button>
          </nav>
          {session.authenticated ? <button type="button" className="tag tag-yes balance-pill" onClick={() => setAccount(true)} aria-label="Wallet balance">{session.balance === null ? "Wallet" : <span className="tabular">{compactUsd(session.balance)} USDC</span>}</button> : <button type="button" className="btn btn-primary btn-sm" onClick={session.login}>Sign in</button>}
        </div></header>

        <div className="feed-scroll" ref={feedRef} onScroll={(event) => { const element = event.currentTarget; if (element.scrollTop + element.clientHeight >= element.scrollHeight - element.clientHeight * 1.5) void loadMore(); }}>
          {posts.map((post, index) => <article className="feed-item" id={"post-" + post.id} data-post-id={post.id} key={post.id}>
            {videoErrors[post.id] ? <div className="video-fallback"><span className="label">{categoryFor(post.market.category).label}</span><strong>{question(post)}</strong><small className="label">Video unavailable</small></div> : <video ref={(element) => { if (element) videos.current.set(post.id, element); else videos.current.delete(post.id); }} src={post.video_url} className="post-video" autoPlay={post.id === activeId} loop muted playsInline preload={post.id === activeId || posts[index - 1]?.id === activeId ? "auto" : "metadata"} onPlay={() => watch.onPlay(post.id)} onPause={() => watch.onPause(post.id)} onTimeUpdate={(event) => watch.onTimeUpdate(post.id, event.currentTarget)} onEnded={() => watch.onEnded(post.id)} onClick={() => setUnmutedId((current) => current === post.id ? "" : post.id)} onError={() => setVideoErrors((current) => ({ ...current, [post.id]: true }))} aria-label={question(post) + " video; tap to toggle sound"} />}
            <div className="video-shade" aria-hidden />
            {post.demo && <span className="tag tag-warn demo-tag">Demo</span>}

            <div className="post-overlay">
              <div className="post-copy">
                <div className="author-line">
                  <button type="button" className="author" onClick={() => openAuthor(post)}><ProfileAvatar src={post.author.avatar_url} name={post.author.display_name} size={30} />{authorName(post.author)}</button>
                  {(follower(post)?.is_friend ?? post.author.is_friend) && <span className="tag">Friends</span>}
                  {me?.id !== post.author.id && !post.demo && <button type="button" className={"follow-pill" + (isFollowing(post) ? " following" : "")} onClick={() => { void follow(post); }}>{isFollowing(post) ? "Following" : "Follow"}</button>}
                </div>
                {post.caption && post.caption !== post.market.question && <p className="post-caption">{post.caption}</p>}
                {post.quoted_post && <button type="button" className="quoted-preview" onClick={() => openOriginal(post.quoted_post!.id)}><video src={post.quoted_post.video_url} muted playsInline preload="metadata" aria-hidden="true" /><span><small className="label">Quoting</small><strong>{authorName(post.quoted_post.author)}</strong><em>{post.quoted_post.caption || "View original"}</em></span></button>}
              </div>

              <div className="action-rail">
                <button type="button" className={"rail-button" + (post.liked_by_me ? " selected" : "")} onClick={() => { void like(post); }} aria-label="Like" title="Like"><Heart size={22} strokeWidth={1.5} fill={post.liked_by_me ? "currentColor" : "none"} /><span>{post.like_count}</span></button>
                <button type="button" className="rail-button" onClick={() => setComments(post)} aria-label="Comments" title="Comments"><MessageCircle size={22} strokeWidth={1.5} /><span>{post.comment_count}</span></button>
                <button type="button" className="rail-button" onClick={() => { void share(post); }} aria-label="Share" title="Share"><Share2 size={21} strokeWidth={1.5} /><span>{post.share_count}</span></button>
                <button type="button" className="rail-button" onClick={() => openQuote(post)} aria-label="Quote" title="Quote"><Quote size={21} strokeWidth={1.5} /><span>{post.quote_count ?? 0}</span></button>
                <button type="button" className="rail-button" onClick={() => setUnmutedId((current) => current === post.id ? "" : post.id)} aria-label={unmutedId === post.id ? "Mute video" : "Unmute video"} title={unmutedId === post.id ? "Mute" : "Unmute"}>{unmutedId === post.id ? <Volume2 size={21} strokeWidth={1.5} /> : <VolumeX size={21} strokeWidth={1.5} />}</button>
              </div>

              <section className="market-card-float" aria-label="Market">
                <div className="slab mcf-slab"><div className="mcf-top"><span className="label">{categoryFor(post.market.category).label} · <span className={ended(post) ? "" : "live-dot"}>{ended(post) ? "Ended" : "Live"}</span></span><button type="button" className="mcf-link" onClick={() => window.location.assign("/market/" + encodeURIComponent(post.panta_market_id))}>Market<ArrowUpRight size={14} /></button></div>
                <strong className="mcf-question">{question(post)}</strong>
                <div className="mcf-odds"><span className="display mcf-chance"><CountUp value={percent(post.market.yes_price)} /><sup>%</sup></span><div className="mcf-meter"><TickMeter yes={post.market.yes_price} size="sm" legend /></div></div></div>
                <div className="mcf-trade on-ink"><button type="button" className="btn btn-yes" disabled={ended(post)} onClick={() => setBuy({ post, side: "YES" })}><span>Buy Yes</span><span className="tabular">{cents(post.market.yes_price)}</span></button><button type="button" className="btn btn-no" disabled={ended(post)} onClick={() => setBuy({ post, side: "NO" })}><span>Buy No</span><span className="tabular">{cents(post.market.no_price)}</span></button></div>
              </section>
            </div>
          </article>)}
          {!loading && !feedError && posts.length === 0 && <div className="feed-empty">{tab === "following" ? <EmptyState icon={<UserPlus size={26} strokeWidth={1.4} />} title="Nothing here yet" action={<button type="button" className="btn btn-primary" onClick={() => setSearch(true)}>Discover people to follow</button>}>{optionalCopy("following.empty", "Follow people to see their video takes and current market positions.")}</EmptyState> : <EmptyState icon={<Eye size={26} strokeWidth={1.4} />} title="No videos yet">Check back for new market takes.</EmptyState>}</div>}
          {feedError && posts.length === 0 && <div className="feed-empty"><EmptyState icon={<Eye size={26} strokeWidth={1.4} />} title="The feed is offline" action={<button type="button" className="btn" onClick={() => { void refresh(initialPostId); }}>Retry</button>}>{feedError}</EmptyState></div>}
        </div>
        {loading && <div className="feed-status label" role="status">Updating feed</div>}
        {loadingMore && <div className="feed-status bottom label" role="status">Loading more</div>}
      </main>

      <aside className="watch-panel">
        <div className="label watch-title"><Eye size={13} strokeWidth={1.5} />Now watching</div>
        {activePost ? <section className="watch-card slab">
          <div className="slab-section"><div className="watch-tags"><span className="tag">{categoryFor(activePost.market.category).label}</span>{ended(activePost) ? <span className="tag">Ended</span> : <span className="tag tag-live">Live</span>}</div>
          <h2>{question(activePost)}</h2></div>
          <div className="slab-section"><div className="watch-odds"><span className="display watch-chance"><CountUp value={activeChance} /><sup>%</sup></span><span className="label">Yes chance</span></div>
          <TickMeter yes={activePost.market.yes_price} legend /></div>
          <div className="slab-section"><div className="watch-trade"><button type="button" className="btn btn-yes btn-lg" disabled={ended(activePost)} onClick={() => setBuy({ post: activePost, side: "YES" })}><span>Buy Yes</span><span className="tabular">{cents(activePost.market.yes_price)}</span></button><button type="button" className="btn btn-no btn-lg" disabled={ended(activePost)} onClick={() => setBuy({ post: activePost, side: "NO" })}><span>Buy No</span><span className="tabular">{cents(activePost.market.no_price)}</span></button></div>
          {activePost.caption && activePost.caption !== activePost.market.question && <p className="watch-caption">{activePost.caption}</p>}</div>
        </section> : <p className="empty-note">Scroll the feed to see a market here.</p>}
        <div className="rows watch-links">
          <a className="row" href={activePost ? "/market/" + encodeURIComponent(activePost.panta_market_id) : "/?tab=markets"}><span className="row-main"><span className="row-title">Open market</span><span className="row-sub">Overview, videos, timeline</span></span><span className="row-end"><ArrowUpRight size={16} /></span></a>
          <button type="button" className="row" onClick={() => session.authenticated ? window.location.assign("/portfolio") : session.login()}><span className="row-main"><span className="row-title">Your positions</span><span className="row-sub">Open and resolved</span></span><span className="row-end"><BriefcaseBusiness size={16} strokeWidth={1.5} /></span></button>
          <button type="button" className="row" onClick={() => activePost && !activePost.demo ? (session.authenticated ? setComposer({ market: { panta_market_id: activePost.panta_market_id, question: activePost.market.question, category: activePost.market.category, phase: activePost.market.phase, end_time: activePost.market.end_time, yes_price: activePost.market.yes_price, no_price: activePost.market.no_price, image_url: null, post_count: 0 } }) : session.login()) : openPicker()}><span className="row-main"><span className="row-title">Post a take on this market</span><span className="row-sub">Record or upload a video</span></span><span className="row-end"><Plus size={16} /></span></button>
        </div>
      </aside>
    </div>}

    {toast && <div className="toast" role="status">{toast}</div>}
    {buy && <BuySheet post={buy.post} side={buy.side} session={session} onClose={() => setBuy(null)} onConfirmed={() => notify("Order confirmed.")} />}
    {comments && <CommentsDrawer post={comments} session={session} onClose={() => setComments(null)} onAdded={() => setPosts((current) => current.map((post) => post.id === comments.id ? { ...post, comment_count: post.comment_count + 1 } : post))} />}
    {marketPicker && <MarketPicker session={session} onClose={() => setMarketPicker(false)} onSelect={(market) => { setMarketPicker(false); setComposer({ market }); }} />}
    {composer && <PostComposer market={composer.market} quotePost={composer.quotePost} session={session} onClose={() => setComposer(null)} onPosted={onPosted} />}
    {search && <SearchSheet session={session} onClose={() => setSearch(false)} onOpenProfile={(user) => { setSearch(false); if (user.username) window.location.assign("/u/" + encodeURIComponent(user.username)); else setProfileId(user.id); }} />}
    {profileId && <ProfilePanel id={profileId} session={session} onClose={() => setProfileId("")} onOpenPost={openOriginal} onProfile={onProfile} />}
    {session.synced && me && <OnboardingFlow session={session} />}
    {account && <WalletSheet session={session} onClose={() => setAccount(false)} notify={notify} />}
  </AppShell>;
}
