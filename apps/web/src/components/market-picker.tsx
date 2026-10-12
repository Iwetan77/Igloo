"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { categoryFor } from "@/lib/categories";
import { ApiError, getMarkets } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import { percent } from "@/lib/format";
import { marketEnded, useMarketClock } from "@/lib/markets";
import type { MarketSummary } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/composer.css";

/** Step one of posting: choose the market your take is about. */
export function MarketPicker({ session, onSelect, onClose }: {
  session: Session;
  onSelect: (market: MarketSummary) => void;
  onClose: () => void;
}) {
  const { authenticated, getAccessToken } = session;
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const marketNow = useMarketClock();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fetchPage = useCallback(async (next?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const token = authenticated ? await getAccessToken() : null;
      let cursorValue = next;
      for (let pageIndex = 0; pageIndex < (next ? 1 : 10); pageIndex++) {
        const page = await getMarkets(undefined, cursorValue, token);
        setMarkets((current) => {
          const seen = new Set(current.map((market) => market.panta_market_id));
          return [...current, ...page.markets.filter((market) => !seen.has(market.panta_market_id))];
        });
        setCursor(page.next_cursor);
        if (!page.next_cursor) break;
        cursorValue = page.next_cursor;
      }
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 404 ? "Markets are coming online. Try again shortly." : errorCopy(cause));
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  const needle = query.trim().toLowerCase();
  const filtered = markets.filter((market) => (market.question || market.panta_market_id).toLowerCase().includes(needle) || categoryFor(market.category).label.toLowerCase().includes(needle));
  const open = filtered.filter((market) => !marketEnded(market.end_time, marketNow));
  const closed = filtered.filter((market) => marketEnded(market.end_time, marketNow));

  const row = (market: MarketSummary) => {
    const chance = percent(market.yes_price);
    const ended = marketEnded(market.end_time, marketNow);
    return <button type="button" className="pick-row" key={market.panta_market_id} onClick={() => onSelect(market)}>
      <span className="pick-tags"><span className="tag">{categoryFor(market.category).label}</span>{ended ? <span className="tag">Ended</span> : chance !== null && <span className={"tag " + (chance >= 50 ? "tag-yes" : "tag-no")}>{chance >= 50 ? "Yes " + chance : "No " + (100 - chance)}%</span>}</span>
      <strong>{market.question || market.panta_market_id}</strong>
    </button>;
  };

  return <div className="overlay composer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet composer-sheet" role="dialog" aria-modal="true" aria-label="Choose a market">
    <div className="sheet-head"><h2 className="composer-title">New post</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close" title="Close"><X size={17} strokeWidth={1.5} /></button></div>
    <label className="input-wrap"><Search size={17} strokeWidth={1.5} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a market…" aria-label="Search for a market" autoFocus /></label>
    <div className="pick-list">
      {open.length > 0 && <><h3 className="label">Open markets</h3>{open.map(row)}</>}
      {closed.length > 0 && <><h3 className="label">Ended</h3>{closed.map(row)}</>}
      {!loading && !error && filtered.length === 0 && <p className="empty-note">{query ? "No matching markets loaded." : "No markets available."}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading && <p className="loading-line">Loading markets</p>}
      {cursor && !loading && <button type="button" className="btn load-more" onClick={() => { void fetchPage(cursor); }}>Load more markets</button>}
    </div>
  </section></div>;
}
