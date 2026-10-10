"use client";

import { useRef, type CSSProperties } from "react";
import { LANDING_TILES } from "./data";
import s from "./landing.module.css";
import { useRevealOnce } from "./motion";
import { RevealHeading } from "./reveal-heading";

export function Categories() {
  const sectionRef = useRef<HTMLElement>(null);

  // Tiles drop in from below with a springy ease and settle at their rotated spots.
  useRevealOnce(sectionRef, (sec) => {
    const tiles = Array.from(sec.querySelectorAll<HTMLElement>("[data-tile]")).filter((el) => el.offsetParent !== null);
    const anims = tiles.map((el, i) => {
      const r = parseFloat(getComputedStyle(el).getPropertyValue("--rot")) || 0;
      const a = el.animate(
        [{ transform: `translateY(${sec.offsetHeight}px) rotate(${r * 4 + 18}deg)` }, { transform: `rotate(${r}deg)` }],
        { duration: 1100, delay: 120 + i * 85, easing: "cubic-bezier(.25,1.25,.45,1)", fill: "both" },
      );
      a.pause();
      a.onfinish = () => a.cancel();
      return a;
    });
    return {
      play: () => anims.forEach((a) => a.play()),
      cancel: () => anims.forEach((a) => a.cancel()),
    };
  });

  return (
    <section id="categories" ref={sectionRef} className={s.categories}>
      <div className={s.catCenter}>
        <RevealHeading text="Follow what you care about" className={s.catHeading} />
        <p className={s.catNote}>Plus Business, Stocks, Commodities, Macroeconomics, and Other.</p>
      </div>

      {LANDING_TILES.map((t) => {
        const m = t.mobile ?? t;
        const Icon = t.icon;
        const vars = {
          "--x": `${t.x}%`,
          "--y": `${t.y}%`,
          "--r": t.r,
          "--mx": `${m.x}%`,
          "--my": `${m.y}%`,
          "--mr": m.r,
        } as CSSProperties;
        return (
          <div key={t.name} data-tile="" className={t.mobile ? s.tile : `${s.tile} ${s.tileDesktopOnly}`} style={vars}>
            <Icon aria-hidden="true" className={s.tileIcon} color={t.color} strokeWidth={2} />
            <span className={s.tileLabel}>{t.name}</span>
          </div>
        );
      })}
    </section>
  );
}
