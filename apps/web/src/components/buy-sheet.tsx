"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { ApiError, buildOrder, quoteOrder, submitOrder, verifyOrder } from "@/lib/api";
import { errorCopy, uiCopy } from "@/lib/copy";
import { signAndBroadcast } from "@/lib/trade";
import { marketEnded } from "@/lib/markets";
import type { FeedPost, Quote, Side } from "@/lib/types";
import type { Session } from "@/lib/use-session";

type Step = "amount" | "quoting" | "quoted" | "building" | "signing" | "broadcasting" | "verifying" | "pending" | "confirmed";

export function BuySheet({
  post, side, session, onClose, onConfirmed,
}: {
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

  async function getQuote() {
    if (marketEnded(post.market.end_time)) { setError("This market has ended."); return; }
    if (!session.authenticated) {
      session.login();
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount above zero.");
      return;
    }
    setError("");
    setStep("quoting");
    try {
      const result = await session.authorized((token) =>
        quoteOrder(post.panta_market_id, side, value, token),
      );
      setQuote(result);
      setStep("quoted");
    } catch (cause) {
      setStep("amount");
      setError(errorCopy(cause));
    }
  }

  async function confirm() {
    if (!quote || !session.wallet) {
      setError("Your Solana wallet is still connecting.");
      return;
    }
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
  async function submitAndVerify(quoteId: string, txSignature: string) {
    try {
      await session.authorized((token) => submitOrder(quoteId, txSignature, token));
      for (let attempt = 0; attempt < 45; attempt++) {
        const result = await session.authorized((token) => verifyOrder(txSignature, token));
        if (result.status === "confirmed") {
          setStep("confirmed");
          onConfirmed();
          return;
        }
        if (result.status === "failed") {
          setStep("pending");
          setError(result.detail || "The order failed on chain. Check your wallet before trying again.");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      setStep("pending");
      setError("Still waiting for confirmation. Check its status before trying another buy.");
    } catch (cause) {
      setStep("pending");
      setError(errorCopy(cause));
    }
  }

  const busy = ["quoting", "building", "signing", "broadcasting", "verifying"].includes(step);
  const question = post.market.question?.trim() || post.caption || "Market " + post.panta_market_id.slice(0, 8);

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="sheet buy-sheet" role="dialog" aria-modal="true" aria-label={"Buy " + side}>
        <div className="sheet-head">
          <div><span className="eyebrow">Live on Solana mainnet</span><h2>Buy {side}</h2></div>
          <button className="icon-action" type="button" onClick={onClose} disabled={busy} aria-label="Close buy sheet" title="Close"><X size={20} /></button>
        </div>
        <p className="sheet-question">{question}</p>
        {step === "confirmed" ? (
          <div className="success-state"><Check size={28} /><strong>Order confirmed</strong><span>Your position will appear in your wallet.</span></div>
        ) : (
          <>
            <label className="field-label" htmlFor="buy-amount">Amount</label>
            <div className="amount-field"><span>$</span><input id="buy-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => {
              setAmount(event.target.value);
              setQuote(null);
              setStep("amount");
              setError("");
            }} disabled={busy || Boolean(signature)} /><span>USDC</span></div>
            {quote && !signature && (
              <div className="quote-details">
                <div><span>Estimated shares</span><strong>{quote.estimated_shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong></div>
                <div><span>Fee</span><strong>${quote.fee_usdc.toFixed(2)}</strong></div>
                <div><span>Quote expires</span><strong className={secondsLeft < 15 ? "warning-text" : ""}>{secondsLeft}s</strong></div>
              </div>
            )}
            {signature && <div className="signature">Transaction: {signature.slice(0, 14)}...{signature.slice(-8)}</div>}
            {error && <p className="inline-error" role="alert">{error}</p>}
            {step === "amount" && <button className="solid-action" type="button" onClick={getQuote}>Get quote</button>}
            {step === "quoted" && <button className="solid-action" type="button" onClick={confirm} disabled={secondsLeft === 0}>Confirm buy</button>}
            {busy && <div className="progress-line" role="status"><LoaderCircle size={18} className="spin" />{{
              quoting: "Checking market",
              building: "Building transaction",
              signing: "Approve in your wallet",
              broadcasting: "Sending transaction",
              verifying: "Waiting for confirmation",
            }[step as "quoting" | "building" | "signing" | "broadcasting" | "verifying"]}</div>}
            {step === "pending" && signature && quote && <button className="solid-action" type="button" onClick={() => {
              setError("");
              setStep("verifying");
              void submitAndVerify(quote.quote_id, signature);
            }}>Check status</button>}
          </>
        )}
      </section>
    </div>
  );
}
