"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_HREF } from "./data";
import s from "./landing.module.css";
import { IglooLogo } from "./logo";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  // Glass switches from white to dark once the hero has mostly scrolled away.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav aria-label="Main" className={scrolled ? `${s.nav} ${s.navScrolled}` : s.nav}>
      <a href="#top" aria-label="Igloo home" className={s.navBrand}>
        <IglooLogo height={20} />
      </a>
      <div className={s.navLinks}>
        <a href="#how">How it works</a>
        <a href="#categories">Categories</a>
        <a href="#risk">Risk</a>
      </div>
      <Link href={APP_HREF} className={s.navCta}>
        Open Igloo
      </Link>
    </nav>
  );
}
