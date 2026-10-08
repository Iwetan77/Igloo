"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Timer, TriangleAlert, X } from "lucide-react";
import { ApiError, buildOrder, quoteOrder, submitOrder, verifyOrder } from "@/lib/api";
import { errorCopy, uiCopy } from "@/lib/copy";
import { signAndBroadcast } from "@/lib/trade";
import { marketEnded } from "@/lib/markets";
import { dollarPerShareIllustration } from "@/lib/payout";
import { shares, usd } from "@/lib/format";
import { SlideConfirm } from "@/components/slide-confirm";
import { Money } from "@/components/ui";
import type { FeedPost, Quote, Side } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/buy-sheet.css";

type Step = "amount" | "quoting" | "quoted" | "review" | "building" | "signing" | "broadcasting" | "verifying" | "pending" | "confirmed" | "failed";
const presets = [1, 5, 10, 25];
const busySteps = ["quoting", "building", "signing", "broadcasting", "verifying"];
const progressCopy: Record<string, string> = { building: "Building transaction", signing: "Approve in your wallet", broadcasting: "Sending to Solana", verifying: "Waiting for confirmation" };

export function BuySheet({ post, side, session, onClose, onConfirmed }: {
  post: Pick<FeedPost, "panta_market_id" | "market" | "caption">;
  side: Side;
  session: Session;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [amount, setAmount] = useState("5");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<Step>("amount");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [signature, setSignature] = useState("");
  const retry = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!quote) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((Date.parse(quote.expires_at) - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [quote]);

  function updateAmount(value: string) {
    setAmount(value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"));
    setQuote(null);
    setStep("amount");
    setError("");
  }
  function fail(message: string, again: () => void) {
    retry.current = again;
    setError(message);
    setStep("failed");
  }

  async function getQuote() {
    if (marketEnded(post.market.end_time)) { setError("This market has ended."); return; }
    if (!session.authenticated) { session.login(); return; }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter an amount above zero."); return; }
    setError("");
    setQuote(null);
    setStep("quoting");
    try {
      const result = await session.authorized((token) => quoteOrder(post.panta_market_id, side, value, token));
      setQuote(result);
      setSecondsLeft(Math.max(0, Math.ceil((Date.parse(result.expires_at) - Date.now()) / 1000)));
      setStep("quoted");
    } catch (cause) { fail(errorCopy(cause), () => { void getQuote(); }); }
  }

  async function confirm() {
    if (!quote || !session.wallet) { setError("Your Solana wallet is still connecting."); return; }
    if (Date.now() >= Date.parse(quote.expires_at)) {
      setQuote(null);
      setStep("amount");
      setError(uiCopy("buy.error.expired"));
      return;
    }
    setError("");
    const txStep = { current: "building" as "building" | "signing" | "broadcasting" };
    try {
      setStep("building");
      const built = await session.authorized((token) => buildOrder(quote.quote_id, token));
      txStep.current = "signing";
      setStep("signing");
      const txSignature = await signAndBroadcast(built.unsigned_tx_base64, session.wallet, () => {
        txStep.current = "broadcasting";
        setStep("broadcasting");
      });
      setSignature(txSignature);
      setStep("verifying");
      await submitAndVerify(quote.quote_id, txSignature);
    } catch (cause) {
      const message = cause instanceof ApiError ? errorCopy(cause)
        : txStep.current === "signing" ? uiCopy("buy.error.rejected")
        : txStep.current === "broadcasting" ? uiCopy("buy.error.broadcast")
        : errorCopy(cause);
      fail(message, () => { setError(""); setStep("review"); });
    }
  }

  async function verifySignature(txSignature: string) {
    try {
      for (let attempt = 0; attempt < 45; attempt++) {
        const result = await session.authorized((token) => verifyOrder(txSignature, token));
        if (result.status === "confirmed") { setStep("confirmed"); onConfirmed(); return; }
        if (result.status === "failed") {
          setStep("pending");
          setError(result.detail || "The order failed on chain. Check your wallet before trying again.");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      setStep("pending");
      setError("Still waiting for confirmation. Check its status before trying another buy.");
    } catch (cause) { setStep("pending"); setError(errorCopy(cause)); }
  }

  async function submitAndVerify(quoteId: string, txSignature: string) {
    try { await session.authorized((token) => submitOrder(quoteId, txSignature, token)); }
    catch (cause) { setStep("pending"); setError(errorCopy(cause)); return; }
    await verifySignature(txSignature);
  }

  const value = Number(amount) || 0;
  const sidePrice = side === "YES" ? post.market.yes_price : post.market.no_price;
  const payout = quote ? dollarPerShareIllustration(quote.estimated_shares) : null;
  const busy = busySteps.includes(step);
  const question = post.market.question?.trim() || post.caption || "Market " + post.panta_market_id.slice(0, 8);
  const sideClass = side === "YES" ? "yes" : "no";
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  const close = <button className="icon-btn sm" type="button" onClick={onClose} disabled={busy} aria-label="Close" title="Close"><X size={17} strokeWidth={1.5} /></button>;
  let body: React.ReactNode;

  if (step === "confirmed") {
    body = <div className="buy-result"><span className="status-ring ok"><Check size={30} strokeWidth={1.5} /></span><h2>Position added</h2><p>You bought about {quote ? shares(quote.estimated_shares) : ""} {side} shares. It now shows in your portfolio.</p><div className="buy-actions"><button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => window.location.assign("/portfolio")}>View positions</button><button type="button" className="btn btn-lg btn-block" onClick={onClose}>Done</button></div></div>;
  } else if (step === "failed") {
    body = <div className="buy-result"><span className="status-ring bad"><TriangleAlert size={28} strokeWidth={1.5} /></span><h2>Something went wrong</h2><p>{error || uiCopy("error.generic")}</p><div className="buy-actions"><button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => retry.current()}>Retry</button><button type="button" className="btn btn-quiet btn-block" onClick={onClose}>Cancel</button></div><span className="label">If the issue persists, contact support.</span></div>;
  } else if (step === "pending") {
    body = <div className="buy-result"><span className="status-ring"><Timer size={28} strokeWidth={1.5} /></span><h2>Waiting on the network</h2><p>{error}</p>{signature && <span className="label">Tx {signature.slice(0, 10)}…{signature.slice(-6)}</span>}<div className="buy-actions"><button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => { setError(""); setStep("verifying"); void verifySignature(signature); }}>Check status</button><button type="button" className="btn btn-quiet btn-block" onClick={onClose}>Close</button></div></div>;
  } else if (["building", "signing", "broadcasting", "verifying"].includes(step)) {
    body = <div className="buy-result"><span className="status-ring"><LoaderCircle size={28} strokeWidth={1.5} className="spin" /></span><h2>{progressCopy[step]}</h2><p>Keep this window open while your {side} order goes through.</p>{signature && <span className="label">Tx {signature.slice(0, 10)}…{signature.slice(-6)}</span>}</div>;
  } else if (step === "review" && quote) {
    body = <>
      <div className="sheet-head"><button type="button" className="icon-btn sm" onClick={() => setStep("quoted")} aria-label="Back"><ArrowLeft size={17} strokeWidth={1.5} /></button><h2>Confirm trade</h2>{close}</div>
      <div className="card card-pad buy-receipt"><span className="label">Market</span><p className="buy-receipt-question">{question}</p>
        <div className="buy-receipt-grid"><div><span className="label">Side</span><strong className={sideClass}>{side}</strong></div><div><span className="label">Amount</span><strong>${usd(value)}</strong></div></div>
        <div className="kv"><span>Fee</span><strong>${usd(quote.fee_usdc)}</strong></div><div className="kv"><span>Total</span><strong>${usd(value + quote.fee_usdc)}</strong></div></div>
      <p className="buy-expiry label"><Timer size={13} strokeWidth={1.5} />Quote expires in {clock}</p>
      {secondsLeft === 0 ? <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => { void getQuote(); }}>Refresh quote</button> : <SlideConfirm label="Slide to sign & buy" onConfirm={() => { void confirm(); }} />}
      <button type="button" className="btn btn-quiet btn-block" onClick={onClose}>Cancel</button>
    </>;
  } else if ((step === "quoted") && quote) {
    body = <>
      <div className="sheet-head"><button type="button" className="icon-btn sm" onClick={() => updateAmount(amount)} aria-label="Back"><ArrowLeft size={17} strokeWidth={1.5} /></button><h2>Order summary</h2>{close}</div>
      <div className="buy-summary"><div className="kv"><span>Amount</span><strong>${usd(value)}</strong></div><div className="kv"><span>Price per share</span><strong>{sidePrice === null ? "—" : usd(sidePrice) + " USDC"}</strong></div><div className="kv"><span>Est. shares</span><strong>{shares(quote.estimated_shares)}</strong></div><div className="kv"><span>Fee</span><strong>${usd(quote.fee_usdc)}</strong></div>{payout !== null && <div className="kv"><span>Payout at $1 per share</span><strong className={sideClass}>${usd(payout)}</strong></div>}</div>
      <p className="buy-disclosure">Illustration only. Panta sets the actual payout from final pools after the primary sale; it may be higher or lower.</p>
      <p className="buy-expiry label"><Timer size={13} strokeWidth={1.5} />Quote expires in {clock}</p>
      {secondsLeft === 0 ? <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => { void getQuote(); }}>Refresh quote</button> : <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setStep("review")}>Continue</button>}
    </>;
  } else {
    body = <>
      <div className="sheet-head"><span className="tag">Solana mainnet</span><h2>Buy <span className={sideClass}>{side}</span></h2>{close}</div>
      <p className="buy-question">{question}</p>
      <label className="buy-amount" htmlFor="buy-amount"><span className="visually-hidden">Amount in USDC</span><span className="display">$</span><input id="buy-amount" className="display" inputMode="decimal" autoComplete="off" value={amount} placeholder="0" style={{ width: Math.max(1, amount.length) + 0.3 + "ch" }} onChange={(event) => updateAmount(event.target.value)} disabled={busy} /></label>
      <p className="buy-rate label">{sidePrice === null ? "Price updates when you get a quote" : `1 share = ${usd(sidePrice)} USDC`}</p>
      <div className="buy-presets" role="group" aria-label="Quick amounts">{presets.map((preset) => <button type="button" key={preset} className={"chip" + (value === preset ? " active" : "")} aria-pressed={value === preset} disabled={busy} onClick={() => updateAmount(String(preset))}>${preset}</button>)}</div>
      <div className="kv buy-balance"><span>Wallet balance</span><strong>{session.balance === null ? "—" : <Money value={session.balance} unit="USDC" className="buy-balance-value" />}</strong></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg btn-block" type="button" disabled={busy} onClick={() => { void getQuote(); }}>{step === "quoting" ? <><LoaderCircle size={17} className="spin" />Checking market</> : "Get quote"}</button>
    </>;
  }

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className={"sheet buy-sheet side-" + sideClass} role="dialog" aria-modal="true" aria-label={"Buy " + side}>{body}</section>
  </div>;
}
