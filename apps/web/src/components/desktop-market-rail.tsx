"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { getMarkets } from "@/lib/api";
import { categoryFor } from "@/lib/categories";
import { percent, shortId } from "@/lib/format";
import { marketEnded } from "@/lib/markets";
import { expandInto } from "@/lib/motion";
import type { FeedPost, MarketSummary } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import { TickMeter } from "@/components/ui";

/** Desktop discovery rail. Use real take counts; unavailable odds stay unknown. */
export function DesktopMarketRail({ posts, session, now, onMarkets }: {
  posts: FeedPost[];
  session: Session;
  now: number;
  onMarkets: () => void;
}) {
  const { authenticated, getAccessToken } = session;
  const [markets, setMarkets] = useState<MarketSummary[]>([]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    let cancelled = false;
    let requested = false;
    const load = () => {
      if (!desktop.matches || requested) return;
      requested = true;
      void (async () => {
        const token = authenticated ? await getAccessToken() : null;
        const page = await getMarkets(undefined, null, token);
        if (!cancelled) setMarkets(page.markets);
      })().catch(() => undefined);
    };
    load();
    desktop.addEventListener("change", load);
    return () => { cancelled = true; desktop.removeEventListener("change", load); };
  }, [authenticated, getAccessToken]);

  const feedMarkets = new Map<string, MarketSummary>();
  for (const post of posts) {
    const previous = feedMarkets.get(post.panta_market_id);
    feedMarkets.set(post.panta_market_id, {
      ...post.market,
      panta_market_id: post.panta_market_id,
      image_url: null,
      post_count: (previous?.post_count ?? 0) + 1,
    });
  }
  const items = (markets.length ? markets : [...feedMarkets.values()])
    .filter((market) => !marketEnded(market.end_time, now))
    .sort((a, b) => b.post_count - a.post_count)
    .slice(0, 8);
  const demo = !markets.length && posts.some((post) => post.demo);

  return <section className="desktop-market-rail" aria-label="Trending markets">
    <div className="trending-heading">
      <h2 className="label">Trending markets{demo && <span className="tag">Demo</span>}</h2>
      <button type="button" className="label" onClick={onMarkets}>All markets<ArrowUpRight size={13} /></button>
    </div>
    <div className="trending-track" tabIndex={0} aria-label="Scroll trending markets">
      {items.map((market) => {
        const chance = percent(market.yes_price);
        return <button type="button" className="trending-card slab" key={market.panta_market_id}
          onClick={(event) => expandInto(event.currentTarget, () => window.location.assign("/market/" + encodeURIComponent(market.panta_market_id)))}>
          <strong>{market.question || "Market " + shortId(market.panta_market_id)}</strong>
          <span className="trending-odds"><b className="tabular">{chance === null ? "—" : chance + "%"}<small> Yes</small></b><ArrowUpRight size={15} /></span>
          <TickMeter yes={market.yes_price} size="sm" />
          <span className="trending-meta">{categoryFor(market.category).label}<span>{demo ? "Demo market" : market.post_count + " takes"}</span></span>
        </button>;
      })}
      {!items.length && <p className="trending-empty muted">{posts.length ? "No active markets right now." : "Markets will appear here when available."}</p>}
    </div>
  </section>;
}
