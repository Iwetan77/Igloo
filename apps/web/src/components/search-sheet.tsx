"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Search, X } from "lucide-react";
import { searchMarkets, searchUsers } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import type { MarketSummary, UserProfile } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import { EmptyState } from "@/components/ui";
import { categoryFor } from "@/lib/categories";
import "@/styles/search.css";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

type Results = { markets: MarketSummary[]; people: UserProfile[] };

function chance(yes: number | null): string {
  return yes === null ? "" : Math.round(yes * 100) + "%";
}

/** One search box for markets and people. */
export function SearchSheet({ session, onClose, onOpenProfile }: {
  session: Session;
  onClose: () => void;
  onOpenProfile: (user: UserProfile) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { authenticated, synced, getAccessToken } = session;

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) { setResults(null); setLoading(false); setError(""); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const token = authenticated && synced ? await getAccessToken() : null;
        // Each half fails on its own, so a people-search hiccup still shows markets.
        const [markets, people] = await Promise.allSettled([searchMarkets(q, token), searchUsers(q, token)]);
        if (controller.signal.aborted) return;
        setResults({
          markets: markets.status === "fulfilled" ? markets.value.markets : [],
          people: people.status === "fulfilled" ? people.value.users : [],
        });
        const failed = [markets, people].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        setError(failed ? errorCopy(failed.reason) : "");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, authenticated, synced, getAccessToken]);

  const empty = results && results.markets.length === 0 && results.people.length === 0;

  return <div className="overlay search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="sheet search-sheet" role="dialog" aria-modal="true" aria-label="Search">
      <div className="search-bar">
        <Search size={17} strokeWidth={1.5} aria-hidden="true" />
        <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets and people" aria-label="Search markets and people" maxLength={100} enterKeyHint="search" />
        {query && <button type="button" className="search-clear" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Clear search"><X size={16} /></button>}
        <button type="button" className="search-cancel" onClick={onClose}>Cancel</button>
      </div>

      <div className="search-results" aria-live="polite">
        {!results && !loading && <EmptyState icon={<Globe size={28} strokeWidth={1.3} />} title="Find your next prediction trade">Find a market to trade on, or people to follow.</EmptyState>}
        {loading && !results && <p className="loading-line">Searching</p>}
        {error && <p className="inline-error">{error}</p>}
        {empty && !loading && <p className="search-hint">Nothing matches “{query.trim()}”.</p>}

        {results && results.markets.length > 0 && <section className="search-section">
          <h3 className="label">Markets</h3>
          {results.markets.map((market) => <button type="button" key={market.panta_market_id} className="search-row" onClick={() => window.location.assign("/market/" + encodeURIComponent(market.panta_market_id))}>
            <span className="search-row-text"><strong>{market.question}</strong><small>{categoryFor(market.category).label}{market.post_count ? " · " + market.post_count + (market.post_count === 1 ? " take" : " takes") : ""}</small></span>
            {market.yes_price !== null && <span className="search-chance display">{chance(market.yes_price)}<small className="label">yes</small></span>}
          </button>)}
        </section>}

        {results && results.people.length > 0 && <section className="search-section">
          <h3 className="label">People</h3>
          {results.people.map((user) => <button type="button" key={user.id} className="search-row" onClick={() => onOpenProfile(user)}>
            <ProfileAvatar src={user.avatar_url} name={user.display_name} size={40} />
            <span className="search-row-text"><strong>{authorName(user)}</strong><small>{user.username && user.display_name ? user.display_name + " · " : ""}{user.follower_count} {user.follower_count === 1 ? "follower" : "followers"}</small></span>
            {user.is_friend ? <span className="tag tag-yes">Friends</span> : user.is_following ? <span className="tag">Following</span> : null}
          </button>)}
        </section>}
      </div>
    </section>
  </div>;
}
