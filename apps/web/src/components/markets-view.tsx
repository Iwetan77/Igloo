"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Play, Plus, Quote } from "lucide-react";
import categories from "../../../../content/categories.json";
import { ApiError, getFeed, getMarket, getMarkets } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import { marketEnded, useMarketClock } from "@/lib/markets";
import { authorName } from "@/components/profile-avatar";
import type { FeedPost, MarketSummary, Side } from "@/lib/types";
import type { Session } from "@/lib/use-session";

const price = (value: number | null) => value === null ? "\u2014" : (value * 100).toFixed(1) + "\u00a2";

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
    setLoading(true);
    setError("");
    if (!marketId) { setMarkets([]); setCursor(null); }
    try {
      const token = authenticated ? await getAccessToken() : null;
      if (marketId) {
        const [detail, feed] = await Promise.all([getMarket(marketId, token), getFeed(null, token, { marketId })]);
        setMarket(detail);
        setVideos(feed.posts);
        setVideoCursor(feed.next_cursor);
      } else {
        const page = await getMarkets(category || undefined, null, token);
        setMarkets(page.markets);
        setCursor(page.next_cursor);
      }
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 404 ? "Markets are coming online. Try again shortly." : errorCopy(cause));
    } finally {
      setLoading(false);
    }
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
        setVideos((current) => [...current, ...page.posts]);
        setVideoCursor(page.next_cursor);
      } else {
        const page = await getMarkets(category || undefined, next, token);
        setMarkets((current) => [...current, ...page.markets]);
        setCursor(page.next_cursor);
      }
    } catch (cause) { setError(cause instanceof ApiError && cause.status === 404 ? "Markets are coming online. Try again shortly." : errorCopy(cause)); }
    finally { setMore(false); }
  }

  if (marketId) return <div className="market-view market-detail">
    <button type="button" className="back-command" onClick={onBack}><ArrowLeft size={18} />Markets</button>
    {loading && <p className="empty-note">Loading market...</p>}
    {error && <div className="market-error"><p className="inline-error" role="alert">{error}</p><button type="button" className="subtle-button" onClick={() => { void load(); }}>Retry</button></div>}
    {market && <>
      <header className="market-detail-head">{market.image_url && <div className="market-detail-image" style={{ backgroundImage: `url(${market.image_url})` }} />}<span className="eyebrow">{market.category || "Market"}</span><h1>{market.question || market.panta_market_id}</h1><span className="market-phase">{marketEnded(market.end_time, marketNow) ? "Ended" : market.phase || "Live market"}</span></header>
      <div className="market-detail-trades"><button type="button" className="trade-yes" disabled={marketEnded(market.end_time, marketNow)} onClick={() => onBuy(market, "YES")}>YES <strong>{price(market.yes_price)}</strong></button><button type="button" className="trade-no" disabled={marketEnded(market.end_time, marketNow)} onClick={() => onBuy(market, "NO")}>NO <strong>{price(market.no_price)}</strong></button></div>
      <button type="button" className="market-post-command" onClick={() => onPost(market)}><Plus size={17} />Post a video on this market</button>
      <h2 className="market-section-heading">Videos <span>{market.post_count}</span></h2>
      <div className="market-video-list">{videos.map((post) => <article className="market-video-row" key={post.id}><button type="button" className="market-video-open" onClick={() => onOpenPost(post.id)}><video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" /><span><strong>{post.caption || post.market.question || "Market video"}</strong><small>{authorName(post.author)}</small><span><Play size={13} />Watch</span></span></button><button type="button" className="market-video-quote" onClick={() => onQuote(post)} aria-label="Quote video" title="Quote"><Quote size={18} /><span>{post.quote_count ?? 0}</span></button></article>)}</div>
      {!loading && !error && videos.length === 0 && <p className="empty-note">No videos on this market yet.</p>}
      {videoCursor && <button type="button" className="subtle-button" disabled={more} onClick={() => { void loadMore(); }}>Load more videos</button>}
    </>}
  </div>;

  return <div className="market-view"><header className="markets-heading"><span className="eyebrow">Explore</span><h1>Markets</h1></header>
    <div className="category-scroll" aria-label="Market categories"><button type="button" className={!category ? "active" : ""} onClick={() => setCategory("")}>All</button>{categories.map((item) => <button type="button" key={item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
    {loading && <p className="empty-note">Loading markets...</p>}
    {error && <div className="market-error"><p className="inline-error" role="alert">{error}</p><button type="button" className="subtle-button" onClick={() => { void load(); }}>Retry</button></div>}
    {!loading && !error && markets.length === 0 && <p className="empty-note">No markets in this category yet.</p>}
    <div className="market-card-list">{markets.map((item) => <button type="button" className="market-card" key={item.panta_market_id} onClick={() => window.location.assign("/market/" + encodeURIComponent(item.panta_market_id))}>{item.image_url && <span className="market-art" style={{ backgroundImage: `url(${item.image_url})` }} />}<span className="market-card-body"><small>{item.category || "Market"} · {marketEnded(item.end_time, marketNow) ? "Ended" : item.phase || "Live"}</small><strong>{item.question || item.panta_market_id}</strong><span className="market-card-meta">YES {price(item.yes_price)} <b>NO {price(item.no_price)}</b><em>{item.post_count} videos</em></span></span></button>)}</div>
    {cursor && <button type="button" className="subtle-button" disabled={more} onClick={() => { void loadMore(); }}>Load more markets</button>}
  </div>;
}
