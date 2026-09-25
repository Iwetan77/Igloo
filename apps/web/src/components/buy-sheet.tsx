"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, LoaderCircle, X } from "lucide-react";
import { ApiError, buildOrder, quoteOrder, submitOrder, verifyOrder } from "@/lib/api";
import { errorCopy, uiCopy } from "@/lib/copy";
import { signAndBroadcast } from "@/lib/trade";
import { marketEnded } from "@/lib/markets";
import { dollarPerShareIllustration } from "@/lib/payout";
import type { FeedPost, Quote, Side } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/buy-sheet.css";

type Step = "amount" | "quoting" | "quoted" | "building" | "signing" | "broadcasting" | "verifying" | "pending" | "confirmed";
const presets = [1, 5, 10, 25];
const usd = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  useEffect(() => {
    if (!quote) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((Date.parse(quote.expires_at) - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [quote]);

  function updateAmount(value: string) {
    setAmount(value);
    setQuote(null);
    setStep("amount");
    setError("");
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
    } catch (cause) { setStep("amount"); setError(errorCopy(cause)); }
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
      setStep("quoted");
      if (cause instanceof ApiError) setError(errorCopy(cause));
      else if (txStep.current === "signing") setError(uiCopy("buy.error.rejected"));
      else if (txStep.current === "broadcasting") setError(uiCopy("buy.error.broadcast"));
      else setError(errorCopy(cause));
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

  const illustrativePayout = quote ? dollarPerShareIllustration(quote.estimated_shares) : null;
  const busy = ["quoting", "building", "signing", "broadcasting", "verifying"].includes(step);
  const question = post.market.question?.trim() || post.caption || "Market " + post.panta_market_id.slice(0, 8);
  const reviewed = step === "quoted" && quote && !signature;

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="sheet buy-sheet buy-design" data-side={side} role="dialog" aria-modal="true" aria-label={"Buy " + side}>
      <div className="sheet-head"><div><span className="eyebrow">Solana mainnet</span><h2>{step === "confirmed" ? "You're in" : reviewed ? "Review your buy" : "Buy " + side}</h2></div><button className="icon-action" type="button" onClick={onClose} disabled={busy} aria-label="Close buy sheet" title="Close"><X size={20} /></button></div>
      <div className="buy-market-line"><span className="buy-side">{side}</span><p className="sheet-question">{question}</p></div>
      {step === "confirmed" ? <div className="success-state buy-success" role="status"><CheckCircle2 size={42} /><strong>You&apos;re in</strong><span>Your {side} position is confirmed. You can track it in your wallet.</span><button className="solid-action" type="button" onClick={onClose}>Done</button></div> : <>
        <label className="field-label" htmlFor="buy-amount">Amount</label>
        <div className="amount-field"><span>$</span><input id="buy-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => updateAmount(event.target.value)} disabled={busy || Boolean(signature)} /><span>USDC</span></div>
        <div className="amount-presets" role="group" aria-label="Quick amounts">{presets.map((value) => <button type="button" key={value} className={Number(amount) === value ? "active" : ""} aria-pressed={Number(amount) === value} disabled={busy || Boolean(signature)} onClick={() => updateAmount(String(value))}>${value}</button>)}</div>
        {quote && !signature && <div className="quote-details buy-review">
          <div className="buy-review-heading"><strong>Order preview</strong><span>Buy {side} · ${usd(Number(amount))}</span></div>
          <div><span>Estimated shares</span><strong>{quote.estimated_shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong></div>
          <div><span>Fee</span><strong>${usd(quote.fee_usdc)}</strong></div>
          {illustrativePayout !== null && <div className="buy-illustration"><span>At $1 per winning share</span><strong>≈ ${usd(illustrativePayout)}</strong></div>}
          <p className="buy-disclosure">Illustration only. Panta sets the actual payout from final pools after the primary sale; it may be higher or lower.</p>
          <div className="buy-quote-clock"><span><Clock3 size={15} />Quote expires</span><strong className={secondsLeft < 15 ? "warning-text" : ""}>{secondsLeft}s</strong></div>
        </div>}
        {signature && <div className="signature">Transaction: {signature.slice(0, 14)}...{signature.slice(-8)}</div>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        {step === "amount" && <button className="solid-action" type="button" onClick={() => { void getQuote(); }}>Get quote</button>}
        {step === "quoted" && (secondsLeft === 0 ? <button className="solid-action" type="button" onClick={() => { void getQuote(); }}>Refresh quote</button> : <button className="solid-action" type="button" onClick={() => { void confirm(); }}>Confirm {side} buy</button>)}
        {busy && <div className="progress-line" role="status"><LoaderCircle size={18} className="spin" />{{ quoting: "Checking market", building: "Building transaction", signing: "Approve in your wallet", broadcasting: "Sending transaction", verifying: "Waiting for confirmation" }[step as "quoting" | "building" | "signing" | "broadcasting" | "verifying"]}</div>}
        {step === "pending" && signature && <button className="solid-action" type="button" onClick={() => { setError(""); setStep("verifying"); void verifySignature(signature); }}>Check status</button>}
      </>}
    </section>
  </div>;
}
