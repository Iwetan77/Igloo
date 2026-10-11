"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LANDING_MARKETS } from "./data";
import s from "./landing.module.css";
import { MarketCard, type Side } from "./market-card";
import { prefersReducedMotion } from "./motion";

type Props = {
  vw: number;
  vh: number;
  /** Example stake used for the payout preview, in dollars */
  stake?: number;
  /** Ring rotation speed along the arc, px/s */
  speed?: number;
};

const CARD_W = 236;

/** 3D carousel of market cards that rotates endlessly and pauses on hover/focus. */
export function CardRing({ vw, vh, stake = 10, speed = 34 }: Props) {
  const [picks, setPicks] = useState<Record<number, Side | null>>({});
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const articleRefs = useRef<(HTMLElement | null)[]>([]);
  const paused = useRef(false);

  const mobile = vw < 720;
  const stageW = Math.min(1180, vw - 24);
  const k = mobile ? Math.min(0.78, vw / 480, vh / 1000) : Math.min(1, stageW / 1180, vh / 1300);
  const scale = +(k * 1.15).toFixed(3);
  const R = Math.round(mobile ? Math.max(300, vw * 0.85) : Math.max(560, stageW * 0.6));
  const step = 2 * Math.asin(Math.min(0.9, (CARD_W * scale * 0.56) / R));
  const stageH = Math.round(330 * scale + 30);

  const geom = useRef({ R, step, scale, speed });
  useEffect(() => {
    geom.current = { R, step, scale, speed };
  }, [R, step, scale, speed]);

  useEffect(() => {
    const rm = prefersReducedMotion();
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let offset = 0;
    let curSpeed: number | null = null;
    let last = 0;
    const t0 = performance.now();

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Nothing to draw once the hero has fully dissolved.
      if (!rm && window.scrollY >= window.innerHeight * 0.7) {
        last = now;
        return;
      }
      const t = now - t0;
      const { R, step, scale, speed } = geom.current;
      const motion = !rm;
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;
      const dt = Math.min(64, now - (last || now));
      last = now;
      const target = motion && !paused.current ? speed : 0;
      curSpeed = (curSpeed ?? target) + (target - (curSpeed ?? target)) * 0.06;
      offset += (curSpeed * dt) / 1000;

      const N = LANDING_MARKETS.length;
      const span = N * step;
      const rot = offset / R;
      const amax = Math.min(1.5, step * 3.45);
      for (let i = 0; i < N; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const th = ((((i * step - rot) % span) + span) % span) - span / 2;
        const a = Math.abs(th);
        // Rise in on load, staggered from the centre outward.
        const p = rm ? 1 : Math.min(1, Math.max(0, (t - 500 - a * 600) / 1100));
        const e = 1 - Math.pow(1 - p, 3);
        let x = R * Math.sin(th);
        const z = R * (Math.cos(th) - 1);
        let y = (1 - e) * 110;
        if (motion) {
          y += Math.sin(t / 1700 + i * 1.7) * 4; // gentle bob
          x += mx * 14; // cursor parallax
          y += my * 8;
        }
        const fade = Math.max(0, Math.min(1, (amax - a) / (step * 0.6)));
        el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(1)}px) rotateY(${th.toFixed(4)}rad) scale(${scale})`;
        el.style.opacity = (e * fade).toFixed(3);
        el.style.zIndex = String(Math.round(100 * Math.cos(th)) + 100);
        el.style.visibility = fade <= 0 ? "hidden" : "visible";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const setPick = useCallback((i: number, side: Side | null) => {
    const apply = () => setPicks((p) => ({ ...p, [i]: side }));
    const el = articleRefs.current[i];
    if (el && !prefersReducedMotion()) {
      el.animate(
        [
          { transform: "perspective(900px) rotateY(0deg)" },
          { transform: "perspective(900px) rotateY(90deg)", offset: 0.5 },
          { transform: "perspective(900px) rotateY(-90deg)", offset: 0.501 },
          { transform: "perspective(900px) rotateY(0deg)" },
        ],
        { duration: 560, easing: "ease-in-out" },
      );
      setTimeout(apply, 280);
    } else apply();
  }, []);

  const pause = () => {
    paused.current = true;
  };
  const resume = () => {
    paused.current = false;
  };

  return (
    <div
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={s.stage}
      style={{ height: stageH, perspective: Math.round(R * 2.2) }}
    >
      {LANDING_MARKETS.map((m, i) => (
        <div
          key={m.question}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          className={s.ringCard}
        >
          <MarketCard
            market={m}
            pick={picks[i] ?? null}
            stake={stake}
            onPick={(side) => setPick(i, side)}
            articleRef={(el) => {
              articleRefs.current[i] = el;
            }}
          />
        </div>
      ))}
    </div>
  );
}
