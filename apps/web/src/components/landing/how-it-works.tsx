"use client";

import { useRef, type ReactNode } from "react";
import s from "./landing.module.css";
import { EASE_REVEAL, useRevealOnce } from "./motion";
import { RevealHeading } from "./reveal-heading";

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className={s.step}>
      <div aria-hidden="true">{children}</div>
      <div className={s.stepHead}>
        <span className={s.stepNum}>{n}</span>
        <h3 className={s.stepTitle}>{title}</h3>
      </div>
      <p className={s.stepBody}>{body}</p>
    </li>
  );
}

export function HowItWorks() {
  const listRef = useRef<HTMLOListElement>(null);

  // The three cards rise in together, once.
  useRevealOnce(listRef, (el) => {
    const a = el.animate(
      [
        { opacity: 0, transform: "translateY(56px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 1000, easing: EASE_REVEAL, fill: "both" },
    );
    a.pause();
    a.onfinish = () => a.cancel();
    return { play: () => a.play(), cancel: () => a.cancel() };
  });

  return (
    <section id="how" className={s.section}>
      <div className={`${s.container} ${s.howInner}`}>
        <RevealHeading text="How it works" className={s.heading} />
        <ol ref={listRef} className={s.steps}>
          <Step
            n={1}
            title="Watch"
            body="Scroll short video takes on real questions about sports, culture, weather, and whatever your friends are arguing about."
          >
            <div className={`${s.visual} ${s.video}`}>
              <div className={s.stripes} />
              <div className={s.videoShade} />
              <div className={`${s.play} ${s.videoPlay}`} />
              <div className={s.videoMeta}>
                <div className={s.videoUser}>
                  <span className={s.avatar}>M</span>@maya.k
                </div>
                <div className={s.progress} />
              </div>
            </div>
          </Step>

          <Step
            n={2}
            title="Take"
            body="Record your own take. Say what you think will happen and why. Reply to anyone by quoting theirs."
          >
            <div className={`${s.visual} ${s.chat}`}>
              <div className={s.chatRow}>
                <span className={s.avatar} style={{ background: "#38bdf8" }}>G</span>
                <span className={s.bubble}>Radar says showers by 3pm.</span>
              </div>
              <div className={s.chatRow}>
                <span className={s.avatar} style={{ background: "#F472B6" }}>S</span>
                <span className={s.bubble}>Forecasts flip by Friday though.</span>
              </div>
              <div className={`${s.chatRow} ${s.chatMine}`}>
                <span className={s.avatar}>Y</span>
                <span className={s.bubble}>Recording my take now.</span>
              </div>
            </div>
          </Step>

          <Step
            n={3}
            title="Trade"
            body="Back your view with YES or NO. Prices move as people trade. Markets settle in USDC on Solana once the outcome is known."
          >
            <div className={`${s.visual} ${s.buy}`}>
              <div className={s.buyToggle}>
                <span className={s.buyOn}>Yes 62¢</span>
                <span>No 38¢</span>
              </div>
              <div className={s.buyRow}>
                <span>Amount</span>
                <span className={s.buyAmount}>$10</span>
              </div>
              <div className={`${s.buyRow} ${s.buyWin}`}>
                <span>You&apos;d win if right</span>
                <strong>$6.13</strong>
              </div>
              <span className={s.buyBtn}>Buy YES</span>
            </div>
          </Step>
        </ol>
      </div>
    </section>
  );
}
