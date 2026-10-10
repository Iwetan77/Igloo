"use client";

import { useRef, type ReactNode } from "react";
import s from "./landing.module.css";
import { useRevealOnce } from "./motion";
import { RevealHeading } from "./reveal-heading";

const LINE = "M0 86 L20 82 L40 88 L60 76 L80 79 L100 70 L120 73 L140 62 L160 66 L180 57 L200 53 L220 58 L240 47 L260 43 L280 46 L300 40";

const TAKES = [
  { letter: "G", bg: "#38bdf8", handle: "groundsman", text: "Radar says showers by 3pm.", side: "YES", pct: 48 },
  { letter: "S", bg: "#F472B6", handle: "slicetheory", text: "Forecasts flip by Friday.", side: "NO", pct: 55 },
  { letter: "R", bg: "#A78BFA", handle: "rainorshine", text: "Bring a jacket.", side: "YES", pct: 62 },
] as const;

function Point({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <li className={s.point}>
      <span className={s.dot} style={{ background: color }} />
      <div className={s.pointText}>
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
    </li>
  );
}

export function ChartSection() {
  const phoneRef = useRef<HTMLDivElement>(null);

  // The chart line draws itself and the take percentages count up from 0.
  useRevealOnce(phoneRef, (el) => {
    const path = el.querySelector<SVGPathElement>("[data-path]");
    const dot = el.querySelector<SVGCircleElement>("[data-dot]");
    if (!path || !dot) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = String(len);
    dot.style.transformOrigin = "300px 40px";
    const line = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 1600,
      easing: "cubic-bezier(.4,0,.2,1)",
      fill: "both",
    });
    const pop = dot.animate(
      [
        { opacity: 0, transform: "scale(0)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 400, delay: 1500, fill: "both" },
    );
    line.pause();
    pop.pause();
    const counts = Array.from(el.querySelectorAll<HTMLElement>("[data-count]"));
    counts.forEach((c) => (c.textContent = "0"));
    let raf = 0;
    return {
      play: () => {
        line.play();
        pop.play();
        const start = performance.now();
        const tick = (now: number) => {
          let done = true;
          counts.forEach((c, i) => {
            const p = Math.min(1, Math.max(0, (now - start - 500 - i * 220) / 1000));
            if (p < 1) done = false;
            c.textContent = String(Math.round(Number(c.dataset.count) * (1 - Math.pow(1 - p, 3))));
          });
          if (!done) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      cancel: () => {
        cancelAnimationFrame(raf);
        line.cancel();
        pop.cancel();
        path.style.strokeDasharray = "";
        counts.forEach((c) => (c.textContent = c.dataset.count ?? ""));
      },
    };
  });

  return (
    <section className={s.section}>
      <div className={`${s.container} ${s.split}`}>
        <div className={s.splitCopy}>
          <RevealHeading text="People first. Charts second." className={s.heading} />
          <p className={s.lead}>
            Most prediction markets open on an order book. Igloo opens on a person telling you what they think and why.
            You see the take and the replies, then decide for yourself.
          </p>
          <ul className={s.points}>
            <Point color="#7dd3fc" title="Sign in with Google">
              A wallet is created for you automatically. There is nothing to install or set up.
            </Point>
            <Point color="#818cf8" title="Takes show why">
              Prices tell you what people think. Takes tell you the reasoning behind it.
            </Point>
            <Point color="#2fd68a" title="Two buttons">
              Every market is a question with a YES and a NO. Pick one and set an amount.
            </Point>
          </ul>
        </div>

        <div ref={phoneRef} role="img" aria-label="Illustrative market screen" className={s.phone}>
          <div className={s.phoneInner}>
            <div className={s.notch} />
            <div className={s.market}>
              <span className={s.marketMeta}>
                <span className={s.dot} style={{ background: "#38BDF8" }} />
                Weather · Ends in 3d
              </span>
              <span className={s.marketQ}>Will it rain at Saturday&apos;s match?</span>
              <span className={s.marketChance}>62% chance of YES</span>
            </div>
            <svg viewBox="0 0 300 120" className={s.chart} aria-hidden="true">
              <path d="M0 30H300M0 60H300M0 90H300" stroke="rgba(148,163,184,0.13)" strokeWidth="1" />
              <path data-path="" d={LINE} fill="none" stroke="#7dd3fc" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle data-dot="" cx="300" cy="40" r="4.5" fill="#7dd3fc" />
            </svg>
            <div className={s.takes}>
              <span className={s.takesLabel}>Takes</span>
              {TAKES.map((t) => (
                <div key={t.handle} className={s.take}>
                  <span className={s.avatar} style={{ background: t.bg }}>
                    {t.letter}
                  </span>
                  <div className={s.takeMain}>
                    <span className={s.takeHandle}>@{t.handle}</span>
                    <span className={s.takeText}>{t.text}</span>
                  </div>
                  <span className={t.side === "NO" ? `${s.takeSide} ${s.takeNo}` : s.takeSide}>
                    {t.side} at <span data-count={t.pct}>{t.pct}</span>%
                  </span>
                </div>
              ))}
            </div>
            <span className={s.illus}>Illustrative example</span>
          </div>
        </div>
      </div>
    </section>
  );
}
