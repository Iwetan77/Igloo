import type { Ref } from "react";
import type { LandingMarket } from "./data";
import s from "./landing.module.css";

export type Side = "yes" | "no";

type Props = {
  market: LandingMarket;
  pick: Side | null;
  /** Example stake, in dollars */
  stake: number;
  onPick: (side: Side | null) => void;
  articleRef?: Ref<HTMLElement>;
};

const cents = (p: number) => `${Math.round(p * 100)}¢`;

/** Illustrative market card. Picking a side previews the payout (stake / price − stake). */
export function MarketCard({ market: m, pick, stake, onPick, articleRef }: Props) {
  const price = pick === "no" ? 1 - m.price : m.price;
  const win = stake / price - stake;
  const Icon = m.icon;
  const art = `radial-gradient(120% 90% at 85% 100%, oklch(0.62 0.14 ${m.hue + 30}) 0%, transparent 60%), linear-gradient(150deg, oklch(0.5 0.12 ${m.hue}), oklch(0.28 0.08 ${m.hue + 40}))`;

  return (
    <article ref={articleRef} aria-label={m.question} className={s.card}>
      <div className={s.cardTop}>
        <span className={s.cardCat}>
          <span className={s.dot} style={{ background: m.categoryColor }} />
          {m.category}
        </span>
        <span className={s.chip}>{m.ends}</span>
      </div>

      <h3 className={s.cardQ}>{m.question}</h3>

      <div className={s.cardArt} aria-hidden="true">
        <div className={s.cardArtBg} style={{ background: art }} />
        <Icon className={s.cardGlyphBig} size={140} strokeWidth={1.5} />
        <span className={s.cardGlyphBadge}>
          <Icon size={32} strokeWidth={2} />
        </span>
      </div>

      <div className={s.cardUser}>
        <span className={s.avatar}>{m.initial}</span>@{m.handle}
      </div>

      {pick === null ? (
        <div className={s.cardActions}>
          <button type="button" className={s.btnYes} onClick={() => onPick("yes")} aria-label={`Yes at ${cents(m.price)}`}>
            Yes <span>{cents(m.price)}</span>
          </button>
          <button type="button" className={s.btnNo} onClick={() => onPick("no")} aria-label={`No at ${cents(1 - m.price)}`}>
            No <span>{cents(1 - m.price)}</span>
          </button>
        </div>
      ) : (
        <div aria-live="polite" className={pick === "no" ? `${s.picked} ${s.pickedNo}` : s.picked}>
          <div className={s.pickedText}>
            <span className={s.pickedWin}>You&apos;d win ${win.toFixed(2)} if right</span>
            <span className={s.pickedSub}>
              ${stake} on {pick === "no" ? "NO" : "YES"} at {cents(price)}
            </span>
          </div>
          <button type="button" className={s.changeBtn} onClick={() => onPick(null)}>
            Change
          </button>
        </div>
      )}
    </article>
  );
}
