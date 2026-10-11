"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CardRing } from "./card-ring";
import { Clouds } from "./clouds";
import { APP_HREF } from "./data";
import s from "./landing.module.css";
import { IglooMark } from "./logo";
import { prefersReducedMotion, useBlurReveal, useViewport } from "./motion";
import { Words } from "./reveal-heading";

export function LandingHero() {
  const { vw, vh } = useViewport();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  useBlurReveal(headingRef, 150);

  // Dissolve: headline and card block fade, blur and lift out while the sky stays put.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let lastDp = -1;
    const update = () => {
      raf = 0;
      const dp = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.7)));
      if (dp === lastDp) return;
      lastDp = dp;
      for (const el of [headingRef.current, blockRef.current]) {
        if (!el) continue;
        el.style.opacity = String(1 - dp);
        el.style.filter = dp > 0 ? `blur(${(dp * 16).toFixed(1)}px)` : "";
        el.style.transform = dp > 0 ? `translateY(${(-dp * 36).toFixed(1)}px) scale(${1 - dp * 0.04})` : "";
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header id="top" className={s.hero}>
      <Clouds layer="back" vw={vw} />

      <h1 ref={headingRef} className={s.heroHeading}>
        <span className={`${s.heroLine} ${s.skyText}`}>
          <Words text="Place your prediction." />
        </span>
        <span className={s.heroLine}>
          <Words text="Your take on" className={s.fade1} />
        </span>
        <span className={`${s.heroLine} ${s.heroLast}`}>
          <Words text="what happens next." className={s.fade2} />
        </span>
      </h1>

      <Clouds layer="front" vw={vw} zIndex={2} />

      <div ref={blockRef} className={s.heroBlock}>
        <CardRing vw={vw} vh={vh} />
        <p className={s.heroTagline}>Watch takes, make yours, and back it with a YES or NO.</p>
        <Link href={APP_HREF} className={s.pill}>
          <IglooMark height={15} className={s.pillMark} />
          Open Igloo
        </Link>
        <p className={s.heroNote}>Illustrative examples. Not real markets or prices.</p>
      </div>
    </header>
  );
}
