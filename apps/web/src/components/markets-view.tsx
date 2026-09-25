"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, Clock3, Play, Plus, Quote, Video } from "lucide-react";
import { ApiError, getFeed, getMarket, getMarkets } from "@/lib/api";
import { categories, categoryFor } from "@/lib/categories";
import { errorCopy } from "@/lib/copy";
import { marketEnded, useMarketClock } from "@/lib/markets";
import { useCountdown } from "@/lib/use-countdown";
import { authorName } from "@/components/profile-avatar";
import { CategoryIcon } from "@/components/category-icon";
import type { FeedPost, MarketSummary, Side } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/markets.css";

const price = (value: number | null) => value === null ? "\u2014" : (value * 100).toFixed(1) + "\u00a2";
const yesPercent = (value: number | null) => value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value * 100));
const accent = (color: string) => ({ "--category-accent": color }) as CSSProperties;

function MarketCard({ market, now }: { market: MarketSummary; now: number }) {
  const category = categoryFor(market.category);
  const countdown = useCountdown(market.end_time);
  const ended = marketEnded(market.end_time, now);
  const chance = yesPercent(market.yes_price);
  return <button type="button" className="market-card market-card-v2" style={accent(category.color)} onClick={() => window.location.assign("/market/" + encodeURIComponent(market.panta_market_id))}>
    <span className="market-card-top"><span className="market-category"><CategoryIcon name={category.icon} />{category.label}</span><span className={"status-pill" + (ended ? " ended" : "")}>{ended ? "Ended" : market.phase || "Live"}</span></span>
    <span className="market-card-content"><strong className="market-card-question">{market.question || "Market " + market.panta_market_id.slice(0, 8)}</strong>{market.image_url && <span className="market-card-art" style={{ backgroundImage: `url(${market.image_url})` }} aria-hidden="true" />}</span>
    <span className="market-card-chance"><span className="chance-value">{chance === null ? "\u2014" : Math.round(chance) + "%"}<small>YES</small></span><span className="market-card-opposite">NO {price(market.no_price)}</span></span>
    <span className={"prob-bar" + (chance === null ? " unknown" : "")} aria-label={chance === null ? "Probability unavailable" : `YES ${Math.round(chance)} percent, NO ${Math.round(100 - chance)} percent`}><span style={{ width: (chance ?? 0) + "%" }} /></span>
    <span className="market-card-footer"><span><Video size={14} />{market.post_count} videos</span><span><Clock3 size={14} />{ended ? "Ended" : countdown ? "Ends in " + countdown.label : market.end_time ? "Ends soon" : "End date TBD"}</span></span>
  </button>;
}

function MarketHero({ market, now }: { market: MarketSummary; now: number }) {
  const category = categoryFor(market.category);
  const countdown = useCountdown(market.end_time);
  const ended = marketEnded(market.end_time, now);
  const chance = yesPercent(market.yes_price);
  return <header className="market-detail-head market-hero-v2" style={accent(category.color)}>
    <div className="market-hero-meta"><span className="market-category"><CategoryIcon name={category.icon} />{category.label}</span><span className={"status-pill" + (ended ? " ended" : "")}>{ended ? "Ended" : market.phase || "Live"}</span></div>
    <div className="market-hero-main"><div><h1>{market.question || "Market " + market.panta_market_id.slice(0, 8)}</h1><p className="market-hero-timing"><Clock3 size={16} />{ended ? "Ended" : countdown ? "Ends in " + countdown.label : market.end_time ? "Ends soon" : "End date TBD"}<span>·</span><Video size={16} />{market.post_count} videos</p></div><div className="market-hero-prob"><span className="chance-value">{chance === null ? "\u2014" : Math.round(chance) + "%"}</span><span>YES chance</span></div></div>
    <div className={"prob-bar" + (chance === null ? " unknown" : "")} aria-label={chance === null ? "Probability unavailable" : `YES ${Math.round(chance)} percent`}><span style={{ width: (chance ?? 0) + "%" }} /></div>
  </header>;
}

function MarketVideoCard({ post, onOpen, onQuote }: { post: FeedPost; onOpen: (id: string) => void; onQuote: (post: FeedPost) => void }) {
  return <article className="market-video-card"><button type="button" className="market-video-open" onClick={() => onOpen(post.id)} aria-label={"Watch " + (post.caption || post.market.question || "video")}><video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" onLoadedMetadata={(event) => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0.1) video.currentTime = 0.1; }} /><span className="market-video-caption"><strong>{post.caption || post.market.question || "Market video"}</strong><small>{authorName(post.author)}</small></span><span className="market-video-play"><Play size={17} fill="currentColor" /></span></button><button type="button" className="market-video-quote" onClick={() => onQuote(post)} aria-label="Quote video" title="Quote"><Quote size={16} /><span>{post.quote_count ?? 0}</span></button></article>;
}

export function MarketsView({ marketId, session, onPost, onQuote, onBuy, onOpenPost, onBack }: {
  marketId?: string;
  session: Session;
  onPost: (market: MarketSummary) => void;
  onQuote: (post: FeedPost) => void;
  onBuy: (market: MarketSummary, side: Side) => void;
  onOpenPost: (id: string) => void;
  onBack: () => void;
}) {
  const { authenticated, getAccessToken } = session;
  const marketNow = useMarketClock();
  const requestKey = useRef(0);
  const [category, setCategory] = useState("");
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [videos, setVideos] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [videoCursor, setVideoCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const key = ++requestKey.current;
    setLoading(true);
    setError("");
    if (!marketId) { setMarkets([]); setCursor(null); }
    try {
      const token = authenticated ? await getAccessToken() : null;
      if (marketId) {
        const [detail, feed] = await Promise.all([getMarket(marketId, token), getFeed(null, token, { marketId })]);
        if (key !== requestKey.current) return;
        setMarket(detail);
        setVideos(feed.posts);
        setVideoCursor(feed.next_cursor);
      } else {
        const page = await getMarkets(category || undefined, null, token);
        if (key !== requestKey.current) return;
        setMarkets(page.markets);
        setCursor(page.next_cursor);
      }
    } catch (cause) {
      if (key === requestKey.current) setError(cause instanceof ApiError && cause.status === 404 ? "Markets are coming online. Try again shortly." : errorCopy(cause));
    } finally { if (key === requestKey.current) setLoading(false); }
  }, [marketId, category, authenticated, getAccessToken]);

  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    const next = marketId ? videoCursor : cursor;
    if (!next || more) return;
    setMore(true);
    try {
      const token = authenticated ? await getAccessToken() : null;
      if (marketId) {
        const page = await getFeed(next, token, { marketId });
        setVideos((current) => [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))]);
        setVideoCursor(page.next_cursor);
      } else {
        const page = await getMarkets(category || undefined, next, token);
        setMarkets((current) => [...current, ...page.markets.filter((item) => !current.some((known) => known.panta_market_id === item.panta_market_id))]);
        setCursor(page.next_cursor);
      }
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setMore(false); }
  }

  if (marketId) return <div className="market-view market-detail market-design">
    <button type="button" className="back-command" onClick={onBack}><ArrowLeft size={18} />Markets</button>
    {loading && !market && <p className="empty-note">Loading market...</p>}
    {error && <div className="market-error"><p className="inline-error" role="alert">{error}</p><button type="button" className="subtle-button" onClick={() => { void load(); }}>Retry</button></div>}
    {market && <>
      <MarketHero market={market} now={marketNow} />
      <div className="market-detail-trades"><button type="button" className="trade-yes" disabled={marketEnded(market.end_time, marketNow)} onClick={() => onBuy(market, "YES")}><span>Buy YES</span><strong>{price(market.yes_price)}</strong></button><button type="button" className="trade-no" disabled={marketEnded(market.end_time, marketNow)} onClick={() => onBuy(market, "NO")}><span>Buy NO</span><strong>{price(market.no_price)}</strong></button></div>
      <div className="market-video-heading"><h2>Market videos <span>{market.post_count}</span></h2><button type="button" className="market-post-command" onClick={() => onPost(market)}><Plus size={17} />Post a video on this market</button></div>
      <div className="market-video-grid">{videos.map((post) => <MarketVideoCard key={post.id} post={post} onOpen={onOpenPost} onQuote={onQuote} />)}</div>
      {!loading && !error && videos.length === 0 && <p className="empty-note">No videos on this market yet.</p>}
      {videoCursor && <button type="button" className="subtle-button market-load-more" disabled={more} onClick={() => { void loadMore(); }}>Load more videos</button>}
    </>}
  </div>;

  return <div className="market-view market-design"><header className="markets-heading"><span className="eyebrow">Discover</span><h1>Markets</h1></header>
    <div className="category-scroll" aria-label="Market categories"><button type="button" className={!category ? "active" : ""} onClick={() => setCategory("")}>All</button>{categories.map((item) => <button type="button" key={item.id} className={category === item.id ? "active" : ""} style={accent(item.color)} onClick={() => setCategory(item.id)}><CategoryIcon name={item.icon} size={16} />{item.label}</button>)}</div>
    {loading && <p className="empty-note">Loading markets...</p>}
    {error && <div className="market-error"><p className="inline-error" role="alert">{error}</p><button type="button" className="subtle-button" onClick={() => { void load(); }}>Retry</button></div>}
    {!loading && !error && markets.length === 0 && <p className="empty-note">No markets in this category yet.</p>}
    <div className="market-card-list">{markets.map((item) => <MarketCard key={item.panta_market_id} market={item} now={marketNow} />)}</div>
    {cursor && <button type="button" className="subtle-button market-load-more" disabled={more} onClick={() => { void loadMore(); }}>Load more markets</button>}
  </div>;
}
