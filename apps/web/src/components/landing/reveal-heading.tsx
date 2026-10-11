"use client";

import { useRef, type ElementType } from "react";
import s from "./landing.module.css";
import { useBlurReveal } from "./motion";

/** Renders each word as an inline-block span tagged for the blur reveal. */
export function Words({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} data-w="" className={className ? `${s.word} ${className}` : s.word}>
          {w}
        </span>
      ))}
    </>
  );
}

/** Section headline that reveals word by word once 30% visible. */
export function RevealHeading({ as: Tag = "h2", text, className }: { as?: ElementType; text: string; className: string }) {
  const ref = useRef<HTMLElement>(null);
  useBlurReveal(ref);
  return (
    <Tag ref={ref} className={className}>
      <Words text={text} />
    </Tag>
  );
}
