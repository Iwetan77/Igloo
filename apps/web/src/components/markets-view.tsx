"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Film, Play, Plus, Quote, Search, Share2, Video } from "lucide-react";
import { ApiError, getFeed, getMarket, getMarkets } from "@/lib/api";
import { categories, categoryFor } from "@/lib/categories";
import { errorCopy } from "@/lib/copy";
import { cents, percent, phaseLabel, shortDate, shortId } from "@/lib/format";
import { marketEnded, useMarketClock } from "@/lib/markets";
import { useCountdown } from "@/lib/use-countdown";
import { authorName } from "@/components/profile-avatar";
import { EmptyState, TickMeter } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { expandInto, useDirection, useIndicator } from "@/lib/motion";
import type { FeedPost, MarketSummary, Side } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/markets.css";

const titleOf = (market: MarketSummary) => market.question || "Market " + shortId(market.panta_market_id);
function useOpenMarket() {
  const router = useRouter();
  return (id: string, from?: HTMLElement | null) => expandInto(from ?? null, () => router.push("/market/" + encodeURIComponent(id)));
}

function timeLeft(endTime: string | null | undefined, countdown: ReturnType<typeof useCountdown>, ended: boolean) {
  if (ended) return "Ended";
  if (countdown) return countdown.label + " left";
  return endTime ? "Ends soon" : "No end date";
}

function MarketCard({ market, now }: { market: MarketSummary; now: number }) {
  const openMarket = useOpenMarket();
  const countdown = useCountdown(market.end_time);
  const ended = marketEnded(market.end_time, now);
  const chance = percent(market.yes_price);
  return <button type="button" className="market-tile" onClick={(event) => openMarket(market.panta_market_id, event.currentTarget)}>
    <span className="market-tile-top"><span className="tag">{categoryFor(market.category).label}</span>{ended ? <span className="label">Ended</span> : <span className="label live-dot">Live</span>}</span>
    <strong className="market-tile-question">{titleOf(market)}</strong>
    <span className="market-tile-odds"><span className="display"><CountUp value={chance} /><sup>%</sup></span><span className="tag tag-yes">Yes</span></span>
    <TickMeter yes={market.yes_price} size="sm" />
    <span className="market-tile-foot label"><span title={market.post_count + " takes"}><Video size={12} strokeWidth={1.5} />{market.post_count}</span><span>{timeLeft(market.end_time, countdown, ended)}</span></span>
  </button>;
}

function RelatedMarkets({ market, session }: { market: MarketSummary; session: Session }) {
  const openMarket = useOpenMarket();
  const { authenticated, getAccessToken } = session;
  const [related, setRelated] = useState<MarketSummary[]>([]);
  useEffect(() => {
    if (!market.category) return;
    let cancelled = false;
    void (async () => {
      const token = authenticated ? await getAccessToken() : null;
      const page = await getMarkets(categoryFor(market.category).id, null, token);
      if (!cancelled) setRelated(page.markets.filter((item) => item.panta_market_id !== market.panta_market_id).slice(0, 4));
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [market.category, market.panta_market_id, authenticated, getAccessToken]);
  if (!related.length) return null;
  return <section className="market-section"><h3 className="label">Related markets</h3><div className="rows">{related.map((item) => {
    const chance = percent(item.yes_price);
    return <button type="button" className="row" key={item.panta_market_id} onClick={(event) => openMarket(item.panta_market_id, event.currentTarget)}><span className="row-main"><span className="row-text">{titleOf(item)}</span><span className="row-sub">{item.post_count} takes · ends {shortDate(item.end_time)}</span></span>{chance !== null && <span className={"tag " + (chance >= 50 ? "tag-yes" : "tag-no")}>{chance}% yes</span>}</button>;
  })}</div></section>;
}

function Timeline({ market, now }: { market: MarketSummary; now: number }) {
  const ended = marketEnded(market.end_time, now);
  const steps = [
    { title: "Open for trading", detail: phaseLabel(market.phase), done: true },
    { title: "Trading closes", detail: market.end_time ? new Date(market.end_time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "No end date set", done: ended },
    { title: "Resolution", detail: ended ? "Awaiting the outcome" : "After trading closes", done: false },
  ];
  const current = steps.findIndex((step) => !step.done);
  return <section className="market-section">
    <div className="card card-pad timeline-progress"><span className="label">Market progress</span><ol className="progress-track">{steps.map((step, index) => <li key={step.title} className={step.done ? "done" : index === current ? "current" : ""}><span /><small className="label">{step.title.split(" ")[0]}</small></li>)}</ol></div>
    <ol className="timeline">{steps.map((step, index) => <li key={step.title} className={step.done ? "done" : index === current ? "current" : ""}><span className="timeline-dot" /><div><strong>{step.title}</strong><span className="row-sub">{step.detail}</span></div></li>)}</ol>
  </section>;
}

type DetailTab = "overview" | "timeline" | "videos";

export function MarketsView({ marketId, session, onPost, onQuote, onBuy, onOpenPost, onBack, onSearch }: {
  marketId?: string;
  session: Session;
  onPost: (market: MarketSummary) => void;
  onQuote: (post: FeedPost) => void;
  onBuy: (market: MarketSummary, side: Side) => void;
  onOpenPost: (id: string) => void;
  onBack: () => void;
  onSearch: () => void;
}) {
  const router = useRouter();
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
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const detailTabs = useIndicator<HTMLElement>(detailTab + (market ? ":ready" : ""));
  const detailDirection = useDirection(["overview", "timeline", "videos"].indexOf(detailTab));
  const chips = useIndicator<HTMLDivElement>(category);
  const [shared, setShared] = useState(false);
  const countdown = useCountdown(market?.end_time);

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

  async function share() {
    if (!market) return;
    const url = window.location.origin + "/market/" + encodeURIComponent(market.panta_market_id);
    try {
      if (navigator.share) await navigator.share({ title: "Igloo", text: titleOf(market), url });
      else { await navigator.clipboard.writeText(url); setShared(true); window.setTimeout(() => setShared(false), 2500); }
    } catch { /* The share sheet was dismissed. */ }
  }

  const errorBlock = error && <div className="notice warn" role="alert"><span><strong>Couldn&apos;t load markets</strong>{error}</span><button type="button" className="btn btn-sm" onClick={() => { void load(); }}>Retry</button></div>;

  if (marketId) {
    const ended = market ? marketEnded(market.end_time, marketNow) : false;
    const chance = market ? percent(market.yes_price) : null;
    return <div className="screen market-detail">
      <div className="market-topbar"><button type="button" className="icon-btn" onClick={onBack} aria-label="Back to markets"><ArrowLeft size={18} strokeWidth={1.5} /></button>{market && <span className="tag">{categoryFor(market.category).label}</span>}{market && (ended ? <span className="tag">Ended</span> : <span className="tag tag-live">Live</span>)}<span className="grow" />{market && <button type="button" className="icon-btn" onClick={() => { void share(); }} aria-label="Share market" title={shared ? "Link copied" : "Share"}><Share2 size={17} strokeWidth={1.5} /></button>}</div>
      {loading && !market && <p className="loading-line">Loading market</p>}
      {errorBlock}
      {market && <>
        <header className="market-hero slab">
          <div className="slab-section"><span className="label">Prediction market</span><h1>{titleOf(market)}</h1></div>
          <div className="slab-section"><div className="market-hero-odds"><span className="label">Yes odds</span><span className="label">{cents(market.yes_price)} a share</span></div><div className="market-hero-meter"><span className="display"><CountUp value={chance} /><sup>%</sup></span><TickMeter yes={market.yes_price} /></div></div>
          <div className="slab-section slab-split"><div className="stat"><span className="label">{ended ? "Trading" : "Time left"}</span><span className="label">Until trading closes</span><strong>{ended ? "Closed" : countdown ? countdown.label : market.end_time ? "Soon" : "Open"}</strong></div><div className="stat"><span className="label">Takes</span><span className="label">Videos on this market</span><strong><CountUp value={market.post_count} /></strong></div></div>
        </header>
        <div className="market-trade"><button type="button" className="btn btn-yes btn-lg" disabled={ended} onClick={() => onBuy(market, "YES")}><span>Buy Yes</span><span className="tabular">{cents(market.yes_price)}</span></button><button type="button" className="btn btn-no btn-lg" disabled={ended} onClick={() => onBuy(market, "NO")}><span>Buy No</span><span className="tabular">{cents(market.no_price)}</span></button></div>
        <nav className="line-tabs" aria-label="Market sections" ref={detailTabs.host}><span className="indicator" ref={detailTabs.bar} aria-hidden="true" />{(["overview", "timeline", "videos"] as DetailTab[]).map((item) => <button type="button" key={item} className={detailTab === item ? "active" : ""} onClick={() => setDetailTab(item)}>{item === "videos" ? `Videos (${market.post_count})` : item}</button>)}</nav>

        <div className={"panel " + detailDirection} key={detailTab}>
        {detailTab === "overview" && <>
          <section className="market-section"><h3 className="label">About this market</h3><p className="market-about">This market resolves YES if “{titleOf(market)}” happens by the end date, and NO otherwise. Prices move with trading: a YES share at {cents(market.yes_price)} implies roughly a {chance ?? "—"}% chance.</p>
            <div className="card card-pad market-facts"><div className="kv"><span>Category</span><strong>{categoryFor(market.category).label}</strong></div><div className="kv"><span>Status</span><strong>{ended ? "Ended" : phaseLabel(market.phase)}</strong></div><div className="kv"><span>Closes</span><strong>{shortDate(market.end_time)}</strong></div><div className="kv"><span>YES / NO</span><strong>{cents(market.yes_price)} / {cents(market.no_price)}</strong></div></div>
          </section>
          <RelatedMarkets market={market} session={session} />
        </>}
        {detailTab === "timeline" && <Timeline market={market} now={marketNow} />}
        {detailTab === "videos" && <section className="market-section">
          <div className="market-videos-head"><div><h3>Analysis videos</h3><span className="row-sub">{market.post_count} takes on this market</span></div><button type="button" className="btn btn-primary btn-sm" onClick={() => onPost(market)}><Plus size={16} />Post video</button></div>
          {videos.length > 0 ? <div className="video-grid">{videos.map((post) => <article className="video-tile" key={post.id}><button type="button" className="video-tile-open" onClick={() => onOpenPost(post.id)} aria-label={"Watch " + (post.caption || post.market.question || "video")}><video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" onLoadedMetadata={(event) => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0.1) video.currentTime = 0.1; }} /><span className="video-tile-play"><Play size={13} fill="currentColor" /></span><span className="video-tile-caption"><strong>{post.caption || post.market.question || "Market video"}</strong><small>{authorName(post.author)}</small></span></button><button type="button" className="video-tile-quote" onClick={() => onQuote(post)} aria-label="Quote video" title="Quote"><Quote size={13} />{post.quote_count ?? 0}</button></article>)}</div>
            : !loading && <EmptyState icon={<Film size={26} strokeWidth={1.4} />} title="No takes yet" action={<button type="button" className="btn btn-primary" onClick={() => onPost(market)}>Post the first take</button>}>Record a short video with your call on this market.</EmptyState>}
          {videoCursor && <button type="button" className="btn load-more" disabled={more} onClick={() => { void loadMore(); }}>Load more videos</button>}
        </section>}
        </div>
      </>}
    </div>;
  }

  const selected = categories.find((item) => item.id === category);
  return <div className="screen markets-home">
    <header className="screen-head"><h1 className="page-title">Markets</h1><button type="button" className="btn btn-sm" onClick={() => session.authenticated ? router.push("/create" + (category ? "?category=" + category : "")) : session.login()}><Plus size={15} />Create</button><button type="button" className="icon-btn" onClick={onSearch} aria-label="Search markets"><Search size={17} strokeWidth={1.5} /></button></header>
    <div className="chip-row markets-chips" aria-label="Market categories" ref={chips.host}><span className="indicator chip-indicator" ref={chips.bar} aria-hidden="true" /><button type="button" className={"chip" + (!category ? " active" : "")} onClick={() => setCategory("")}>All</button>{categories.map((item) => <button type="button" key={item.id} className={"chip" + (category === item.id ? " active" : "")} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
    {errorBlock}
    {loading && <p className="loading-line">Loading markets</p>}
    {!loading && !error && markets.length === 0 && <EmptyState icon={<Film size={26} strokeWidth={1.4} />} title="No markets in this category yet" action={<button type="button" className="btn" onClick={() => session.authenticated ? router.push("/create" + (category ? "?category=" + category : "")) : session.login()}>Create a market</button>}>Be the first to create a prediction market{selected ? " for " + selected.label : ""}.</EmptyState>}
    <div className="market-grid" key={category}>{markets.map((item) => <MarketCard key={item.panta_market_id} market={item} now={marketNow} />)}</div>
    {cursor && <button type="button" className="btn load-more" disabled={more} onClick={() => { void loadMore(); }}>Load more markets</button>}
  </div>;
}
