"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import categories from "../../../../content/categories.json";
import { ApiError, getMarkets } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import type { MarketSummary } from "@/lib/types";
import type { Session } from "@/lib/use-session";

export function MarketPicker({ session, onSelect, onClose }: {
  session: Session;
  onSelect: (market: MarketSummary) => void;
  onClose: () => void;
}) {
  const { authenticated, getAccessToken } = session;
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
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

  const filtered = markets.filter((market) => (market.question || market.panta_market_id).toLowerCase().includes(query.trim().toLowerCase()));
  const groups = [...new Set(filtered.map((market) => market.category || "other"))];
  const label = (id: string) => categories.find((category) => category.id === id)?.label || id;

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet market-picker-sheet" role="dialog" aria-modal="true" aria-label="Choose a market">
    <div className="sheet-head"><div><span className="eyebrow">New post</span><h2>Choose a market</h2></div><button type="button" className="icon-action" onClick={onClose} aria-label="Close market picker" title="Close"><X size={20} /></button></div>
    <label className="market-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets" autoFocus /></label>
    <div className="market-picker-list">{groups.map((group) => <section key={group}><h3>{label(group)}</h3>{filtered.filter((market) => (market.category || "other") === group).map((market) => <button type="button" className="market-picker-row" key={market.panta_market_id} onClick={() => onSelect(market)}><strong>{market.question || market.panta_market_id}</strong><span>{market.phase || "Market"}</span></button>)}</section>)}
      {!loading && !error && filtered.length === 0 && <p className="empty-note">{query ? "No matching markets loaded." : "No markets available."}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading && <p className="empty-note">Loading markets...</p>}
    </div>
    {cursor && <button type="button" className="subtle-button" disabled={loading} onClick={() => { void fetchPage(cursor); }}>Load more markets</button>}
  </section></div>;
}
