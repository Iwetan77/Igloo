"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Check, Link2, LoaderCircle, Share2, TriangleAlert } from "lucide-react";
import { ApiError, buildMarketCreation, quoteMarketCreation, registerMarket } from "@/lib/api";
import { categories, categoryFor } from "@/lib/categories";
import { errorCopy, uiCopy } from "@/lib/copy";
import { usd } from "@/lib/format";
import { signAndBroadcast } from "@/lib/trade";
import { useDirection } from "@/lib/motion";
import { useSession } from "@/lib/use-session";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui";
import "@/styles/create-market.css";

type Step = "form" | "cost" | "review" | "live";
type Quote = { create_id: string; fee_usdc: number; expires_at: string };
const HOUR = 3600;

function defaultEnd() {
  const date = new Date(Date.now() + 7 * 24 * HOUR * 1000);
  return { date: date.toISOString().slice(0, 10), time: "23:59" };
}

export function CreateMarketExperience() {
  const session = useSession();
  const [step, setStep] = useState<Step>("form");
  const stepDirection = useDirection(["form", "cost", "review", "live"].indexOf(step));
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("crypto");
  const [rules, setRules] = useState("");
  const [source, setSource] = useState("");
  const [end, setEnd] = useState(defaultEnd);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<"" | "quote" | "build" | "sign" | "register">("");
  const [error, setError] = useState("");
  const [marketId, setMarketId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("category");
    if (preset && categories.some((item) => item.id === preset)) setCategory(preset);
  }, []);

  const endTime = Math.floor(new Date(`${end.date}T${end.time}`).getTime() / 1000);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const formError = question.trim().length < 10 ? "Write a question of at least 10 characters."
    : !question.trim().endsWith("?") ? "Phrase the market as a yes/no question ending in “?”."
    : rules.trim().length < 20 ? "Describe how the market resolves in at least 20 characters."
    : !source.trim() ? "Name the source of truth used to resolve it."
    : !Number.isFinite(endTime) || endTime < nowSeconds + HOUR ? "Pick an end time at least an hour from now."
    : "";
  const insufficient = quote !== null && session.balance !== null && session.balance < quote.fee_usdc;
  const endLabel = Number.isFinite(endTime) ? new Date(endTime * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";

  async function getQuote() {
    if (formError || busy) return;
    setBusy("quote");
    setError("");
    try {
      const result = await session.authorized((token) => quoteMarketCreation({
        question: question.trim(),
        resolution_rule: rules.trim(),
        sources_of_truth: [source.trim()],
        category,
        start_time: Math.floor(Date.now() / 1000),
        end_time: endTime,
        resolution_time: endTime + 24 * HOUR,
        title: question.trim(),
      }, token));
      setQuote(result);
      setStep("cost");
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setBusy(""); }
  }

  async function create() {
    if (!quote || busy) return;
    if (!session.wallet) { setError("Your Solana wallet is still connecting."); return; }
    if (Date.now() >= Date.parse(quote.expires_at)) { setQuote(null); setStep("form"); setError("That fee quote expired. Get a fresh one to continue."); return; }
    setError("");
    const stage = { current: "build" as "build" | "sign" | "broadcast" | "register" };
    try {
      setBusy("build");
      const built = await session.authorized((token) => buildMarketCreation(quote.create_id, token));
      stage.current = "sign";
      setBusy("sign");
      const signature = await signAndBroadcast(built.unsigned_tx_base64, session.wallet, () => { stage.current = "broadcast"; });
      stage.current = "register";
      setBusy("register");
      const registered = await session.authorized((token) => registerMarket(quote.create_id, signature, token));
      setMarketId(registered.panta_market_id || built.expected_panta_market_id);
      setStep("live");
    } catch (cause) {
      setError(cause instanceof ApiError ? errorCopy(cause) : stage.current === "sign" ? uiCopy("buy.error.rejected") : stage.current === "broadcast" ? uiCopy("buy.error.broadcast") : errorCopy(cause));
    } finally { setBusy(""); }
  }

  async function share() {
    const url = window.location.origin + "/market/" + encodeURIComponent(marketId);
    try {
      if (navigator.share) await navigator.share({ title: "Igloo", text: question.trim(), url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
    } catch { /* Share sheet dismissed. */ }
  }

  const head = (title: string, back?: () => void) => <header className="screen-head">{back && <button type="button" className="icon-btn" onClick={back} aria-label="Back" disabled={Boolean(busy)}><ArrowLeft size={18} strokeWidth={1.5} /></button>}<h1 className="grow">{title}</h1>{step !== "live" && <span className="tag">{["form", "cost", "review"].indexOf(step) + 1} / 3</span>}</header>;

  return <AppShell active="markets" session={session}>
    <main className="screen create-market"><div className={"step-body " + stepDirection} key={step}>
      {!session.authenticated ? <>
        {head("New market", () => window.location.assign("/?tab=markets"))}
        <EmptyState icon={<CalendarDays size={26} strokeWidth={1.4} />} title="Sign in to create a market" action={<button type="button" className="btn btn-primary" onClick={session.login}>Sign in</button>}>Markets you create are listed for everyone to trade.</EmptyState>
      </> : step === "form" ? <>
        {head("New market", () => window.location.assign("/?tab=markets"))}
        <label className="field"><span className="label">Market question</span><input className="input" maxLength={160} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Will Bitcoin reach $100K by March 2027?" /></label>
        <div className="field"><span className="label">Category</span><div className="chip-wrap">{categories.filter((item) => item.id !== "other").map((item) => <button type="button" key={item.id} className={"chip" + (category === item.id ? " active" : "")} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div></div>
        <label className="field"><span className="label">Resolution rules</span><textarea className="textarea" maxLength={1000} value={rules} onChange={(event) => setRules(event.target.value)} placeholder="Describe exactly when this market resolves YES, and when it resolves NO…" /></label>
        <label className="field"><span className="label">Source of truth</span><input className="input" maxLength={200} value={source} onChange={(event) => setSource(event.target.value)} placeholder="e.g. CoinGecko BTC/USD daily close" /></label>
        <div className="field"><span className="label">End date &amp; time</span><div className="date-row"><label className="input-wrap"><input type="date" aria-label="End date" value={end.date} onChange={(event) => setEnd({ ...end, date: event.target.value })} /></label><label className="input-wrap"><input type="time" aria-label="End time" value={end.time} onChange={(event) => setEnd({ ...end, time: event.target.value })} /></label></div><span className="field-hint">Trading closes then; resolution is due within 24 hours.</span></div>
        {(error || (formError && question)) && <p className="inline-error" role="alert">{error || formError}</p>}
        <div className="screen-foot"><button type="button" className="btn btn-primary btn-lg btn-block" disabled={Boolean(formError) || Boolean(busy)} onClick={() => { void getQuote(); }}>{busy === "quote" ? <><LoaderCircle size={17} className="spin" />Getting fee quote</> : "Next"}</button></div>
      </> : step === "cost" && quote ? <>
        {head("Review cost", () => setStep("form"))}
        <section className="card card-pad cost-card"><span className="label">Market cost breakdown</span><div className="kv"><span>Creation fee</span><strong>${usd(quote.fee_usdc)}</strong></div><div className="kv cost-total"><span>Total</span><strong className="display">${usd(quote.fee_usdc)}</strong></div></section>
        <div className="kv balance-line"><span>Wallet balance</span><strong>{session.balance === null ? "—" : usd(session.balance) + " USDC"}{session.balance !== null && !insufficient && <Check size={15} className="ok-check" />}</strong></div>
        {insufficient && <div className="notice warn"><TriangleAlert size={18} strokeWidth={1.5} /><span><strong>Insufficient balance</strong>Add at least ${usd(quote.fee_usdc - (session.balance ?? 0))} USDC to cover the creation fee. Deposit from your wallet in Profile.</span></div>}
        <div className="screen-foot"><button type="button" className="btn btn-primary btn-lg btn-block" disabled={insufficient} onClick={() => setStep("review")}>Continue</button></div>
      </> : step === "review" && quote ? <>
        {head("Confirm & create", () => setStep("cost"))}
        <section className="card card-pad review-card">
          <div><span className="label">Question</span><p className="review-question">{question.trim()}</p></div>
          <div><span className="label">Category</span><span className="tag">{categoryFor(category).label}</span></div>
          <div><span className="label">Resolution rules</span><p className="review-rules">{rules.trim()}</p><p className="review-rules">Source: {source.trim()}</p></div>
          <div><span className="label">End date</span><p>{endLabel}</p></div>
          <div className="kv"><span>Creation fee</span><strong>${usd(quote.fee_usdc)}</strong></div>
        </section>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="screen-foot"><button type="button" className="btn btn-primary btn-lg btn-block" disabled={Boolean(busy)} onClick={() => { void create(); }}>{busy ? <><LoaderCircle size={17} className="spin" />{busy === "build" ? "Preparing transaction" : busy === "sign" ? "Approve in your wallet" : "Listing your market"}</> : "Sign & create"}</button><button type="button" className="btn btn-quiet btn-block" disabled={Boolean(busy)} onClick={() => window.location.assign("/?tab=markets")}>Cancel</button></div>
      </> : <div className="market-live">
        <span className="status-ring ok"><Check size={32} strokeWidth={1.5} /></span>
        <h1>Your market is live</h1>
        <p>Traders can now take positions on “{question.trim()}”.</p>
        <span className="label">Share market</span>
        <div className="share-row"><button type="button" className="icon-btn" onClick={() => { void navigator.clipboard.writeText(window.location.origin + "/market/" + encodeURIComponent(marketId)).then(() => setCopied(true)); }} aria-label="Copy link"><Link2 size={17} strokeWidth={1.5} /></button><button type="button" className="icon-btn" onClick={() => { void share(); }} aria-label="Share"><Share2 size={17} strokeWidth={1.5} /></button></div>
        {copied && <span className="label">Link copied</span>}
        <div className="screen-foot live-actions"><a className="btn btn-primary btn-lg btn-block" href={"/market/" + encodeURIComponent(marketId)}>View market</a><Link className="btn btn-quiet btn-block" href="/?tab=markets">Done</Link></div>
      </div>}
    </div></main>
  </AppShell>;
}
