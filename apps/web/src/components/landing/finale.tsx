"use client";

import Link from "next/link";
import { Clouds } from "./clouds";
import { APP_HREF } from "./data";
import s from "./landing.module.css";
import { IglooLogo, IglooMark, IglooWordmark } from "./logo";
import { useViewport } from "./motion";
import { RevealHeading } from "./reveal-heading";

export function Finale() {
  const { vw } = useViewport();
  return (
    <section className={s.finale}>
      <Clouds layer="back" vw={vw} />

      <div className={s.finaleInner}>
        <RevealHeading text="Place your prediction." className={`${s.finaleHeading} ${s.skyText}`} />
        <Link href={APP_HREF} className={s.pill}>
          <IglooMark height={15} className={s.pillMark} />
          Open Igloo
        </Link>
        <p className={s.finaleNote}>Sign in with Google. No wallet setup.</p>
      </div>

      <footer className={s.footer}>
        <span>
          <IglooLogo height={20} />
          <span className={s.srOnly}>Igloo</span>
        </span>
        <div className={s.footerLinks}>
          <a href="#">Terms</a>
          <a href="#">Privacy</a>
          <a href="#risk">Risk disclosure</a>
          <span>© 2026 Igloo</span>
        </div>
      </footer>

      <div aria-hidden="true" className={s.bigWordmark}>
        <IglooWordmark />
      </div>
    </section>
  );
}
