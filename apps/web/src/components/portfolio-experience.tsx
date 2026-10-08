"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, Check, ChevronRight, LoaderCircle, RefreshCw, X } from "lucide-react";
import { ApiError, buildClaim, getMarket, getPositions } from "@/lib/api";
import { errorCopy, uiCopy } from "@/lib/copy";
import { cents, phaseLabel, shares, shortDate, shortId, usd } from "@/lib/format";
import { signAndBroadcast } from "@/lib/trade";
import type { MarketSummary, Position } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import type { Session } from "@/lib/use-session";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Money, SideTag, TickMeter } from "@/components/ui";
import "@/styles/portfolio.css";

type Row = Position & { key: string; market: MarketSummary | null };
const settledPhases = ["resolved", "settled", "cancelled", "canceled", "finalized"];
const isSettled = (row: Row) => row.claimable || settledPhases.includes(row.phase.toLowerCase());
const sidePrice = (row: Row) => row.market ? (row.side === "YES" ? row.market.yes_price : row.market.no_price) : null;
const estValue = (row: Row) => { const price = sidePrice(row); return price === null ? null : price * row.shares; };
const titleOf = (row: Row) => row.market?.question || "Market " + shortId(row.panta_market_id);

export function PortfolioExperience() {
  const session = useSession();
  const { address, getAccessToken, authenticated } = session;
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [claim, setClaim] = useState<Row | null>(null);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const { positions } = await getPositions(address, token);
      const ids = [...new Set(positions.map((position) => position.panta_market_id))];
      const markets = await Promise.allSettled(ids.map((id) => getMarket(id, token)));
      const byId = new Map(ids.map((id, index) => [id, markets[index].status === "fulfilled" ? markets[index].value : null]));
      setRows(positions.map((position, index) => ({ ...position, key: position.panta_market_id + position.side + index, market: byId.get(position.panta_market_id) ?? null })));
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setLoading(false); }
  }, [address, getAccessToken]);

  useEffect(() => { if (authenticated) void refresh(); else setLoading(false); }, [authenticated, refresh]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }

  const open = rows.filter((row) => !isSettled(row));
  const settled = rows.filter(isSettled).sort((a, b) => Number(b.claimable) - Number(a.claimable));
  const claimable = settled.filter((row) => row.claimable).length;
  const openValues = open.map(estValue);
  const total = openValues.some((value) => value !== null) ? openValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const visible = tab === "open" ? open : settled;

  return <AppShell active="portfolio" session={session}>
    <main className="screen portfolio">
      <header className="screen-head"><h1 className="page-title">Portfolio</h1>{authenticated && <button type="button" className="icon-btn" onClick={() => { void refresh(); }} disabled={loading} aria-label="Refresh positions"><RefreshCw size={17} strokeWidth={1.5} className={loading ? "spin" : ""} /></button>}</header>
      {!authenticated ? <EmptyState icon={<BriefcaseBusiness size={26} strokeWidth={1.4} />} title="Your positions live here" action={<button type="button" className="btn btn-primary" onClick={session.login}>Sign in</button>}>Sign in to track open trades and claim winnings.</EmptyState> : <>
        <section className="portfolio-hero hero-dusk">
          <span className="label">Open positions · est. value</span>
          <Money value={total} className="portfolio-total" />
          <div className="portfolio-stats"><div><span className="label">Open</span><strong>{open.length}</strong></div><div><span className="label">Resolved</span><strong>{settled.length}</strong></div><div><span className="label">To claim</span><strong>{claimable}</strong></div></div>
        </section>
        <p className="portfolio-note">Estimates use current market prices and may differ from what you paid.</p>

        <div className="segmented portfolio-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>Open</button><button type="button" role="tab" aria-selected={tab === "resolved"} className={tab === "resolved" ? "active" : ""} onClick={() => setTab("resolved")}>Resolved{claimable ? ` · ${claimable}` : ""}</button></div>

        {error && <div className="notice warn" role="alert"><span><strong>Couldn&apos;t load positions</strong>{error}</span></div>}
        {!address && !loading && <EmptyState icon={<BriefcaseBusiness size={26} strokeWidth={1.4} />} title="No wallet yet">Your Solana wallet is still being set up.</EmptyState>}
        {loading && rows.length === 0 && <p className="loading-line"><LoaderCircle size={16} className="spin" />Loading positions</p>}
        {!loading && !error && address && visible.length === 0 && <EmptyState icon={<BriefcaseBusiness size={26} strokeWidth={1.4} />} title={tab === "open" ? "No open positions" : "Nothing resolved yet"} action={tab === "open" ? <Link className="btn btn-primary" href="/?tab=markets">Browse markets</Link> : undefined}>{tab === "open" ? "Buy YES or NO on any market and it shows up here." : "Positions move here once their market resolves."}</EmptyState>}

        <div className="position-list">{visible.map((row) => row.claimable
          ? <article key={row.key} className="position-card claimable"><div className="position-top"><span className="tag tag-warn">Ready to claim</span><SideTag side={row.side} /></div><strong className="position-question">{titleOf(row)}</strong><div className="kv"><span>Shares</span><strong>{shares(row.shares)}</strong></div><button type="button" className="btn btn-primary btn-block" onClick={() => setClaim(row)}>Claim winnings</button></article>
          : <button type="button" key={row.key} className="position-card" onClick={() => setDetail(row)}>
            <span className="position-top"><SideTag side={row.side} /><span className="label">{isSettled(row) ? phaseLabel(row.phase) : row.market?.end_time ? "Ends " + shortDate(row.market.end_time) : phaseLabel(row.phase)}</span></span>
            <strong className="position-question">{titleOf(row)}</strong>
            {isSettled(row) ? <span className="position-figures settled"><span><span className="label">Shares</span><b>{shares(row.shares)}</b></span><span><span className="label">Payout</span><b>Nothing to claim</b></span></span>
              : <span className="position-figures"><span><span className="label">Shares</span><b>{shares(row.shares)}</b></span><span><span className="label">Price</span><b>{cents(sidePrice(row))}</b></span><span><span className="label">Est. value</span><b>{estValue(row) === null ? "—" : "$" + usd(estValue(row)!)}</b></span></span>}
            <ChevronRight className="position-chevron" size={18} strokeWidth={1.5} />
          </button>)}</div>
        {!loading && rows.length > 0 && <p className="portfolio-end label">No more positions</p>}
      </>}
    </main>

    {detail && <PositionDetail row={detail} onClose={() => setDetail(null)} />}
    {claim && <ClaimSheet row={claim} session={session} onClose={() => setClaim(null)} onClaimed={() => { setClaim(null); notify("Winnings claimed."); void refresh(); }} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </AppShell>;
}

function PositionDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const value = estValue(row);
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet" role="dialog" aria-modal="true" aria-label="Position detail">
    <div className="sheet-head"><span className="label">Position detail</span><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={17} strokeWidth={1.5} /></button></div>
    <h2 className="detail-question">{titleOf(row)}</h2>
    <div className="detail-tiles"><div className="card card-pad"><span className="label">Shares</span><strong className="display">{shares(row.shares)}</strong></div><div className="card card-pad"><span className="label">Current price</span><strong className="display">{cents(sidePrice(row))}</strong></div></div>
    <div className="card card-pad detail-breakdown"><span className="label">Position breakdown</span><div className="kv"><span>Side</span><strong><SideTag side={row.side} /></strong></div><div className="kv"><span>Shares</span><strong>{shares(row.shares)}</strong></div><div className="kv"><span>Est. value</span><strong>{value === null ? "—" : "$" + usd(value)}</strong></div><div className="kv"><span>Phase</span><strong>{phaseLabel(row.phase)}</strong></div></div>
    {row.market && <div className="card card-pad detail-odds"><div className="position-top"><span className="label">Yes probability</span><span className="label">{row.market.end_time ? "Ends " + shortDate(row.market.end_time) : ""}</span></div><TickMeter yes={row.market.yes_price} legend /></div>}
    <a className="btn btn-primary btn-lg btn-block" href={"/market/" + encodeURIComponent(row.panta_market_id)}>View market<ArrowUpRight size={16} /></a>
  </section></div>;
}

function ClaimSheet({ row, session, onClose, onClaimed }: { row: Row; session: Session; onClose: () => void; onClaimed: () => void }) {
  const [state, setState] = useState<"idle" | "building" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const busy = state === "building" || state === "signing" || state === "sending";

  async function claim() {
    if (!session.wallet) { setError("Your Solana wallet is still connecting."); return; }
    setError("");
    const stage = { current: "building" as "building" | "signing" | "sending" };
    try {
      setState("building");
      const built = await session.authorized((token) => buildClaim(row.panta_market_id, token));
      stage.current = "signing";
      setState("signing");
      const tx = await signAndBroadcast(built.unsigned_tx_base64, session.wallet, () => { stage.current = "sending"; setState("sending"); });
      setSignature(tx);
      setState("done");
    } catch (cause) {
      setState("idle");
      setError(cause instanceof ApiError ? errorCopy(cause) : stage.current === "signing" ? uiCopy("buy.error.rejected") : stage.current === "sending" ? uiCopy("buy.error.broadcast") : errorCopy(cause));
    }
  }

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="sheet" role="dialog" aria-modal="true" aria-label="Confirm claim">
    {state === "done" ? <div className="claim-done"><span className="status-ring ok"><Check size={30} strokeWidth={1.5} /></span><h2>Claim sent</h2><p>Your winnings are on their way to your wallet.</p><a className="label" href={"https://solscan.io/tx/" + signature} target="_blank" rel="noreferrer">View transaction ↗</a><button type="button" className="btn btn-primary btn-lg btn-block" onClick={onClaimed}>Done</button></div> : <>
      <div className="sheet-head"><h2 className="grow claim-title">Confirm claim</h2><button type="button" className="icon-btn sm" onClick={onClose} disabled={busy} aria-label="Close"><X size={17} strokeWidth={1.5} /></button></div>
      <p className="muted claim-lede">Check the details, then sign to claim your winnings.</p>
      <div className="card card-pad claim-receipt"><span className="label">Market</span><p>{titleOf(row)}</p><div className="claim-grid"><div><span className="label">Outcome held</span><SideTag side={row.side} /></div><div><span className="label">Shares</span><strong>{shares(row.shares)}</strong></div></div></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => { void claim(); }}>{busy ? <><LoaderCircle size={17} className="spin" />{state === "building" ? "Preparing claim" : state === "signing" ? "Approve in your wallet" : "Sending"}</> : "Sign & claim"}</button>
      <button type="button" className="btn btn-quiet btn-block" onClick={onClose} disabled={busy}>Cancel</button>
    </>}
  </section></div>;
}
