import s from "./landing.module.css";

type Puff = { x: number; y: number; s: number; o: number; b: number };

/** Deterministic cloud puff layout (seeded so server and client agree). */
function makePuffs() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const back: Puff[] = [];
  const front: Puff[] = [];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 9; i++) {
      const x = R(-10, 20);
      back.push({ x: side ? 100 - x : x, y: R(30, 88), s: R(260, 520), o: R(0.7, 0.95), b: R(6, 14) });
    }
    for (let i = 0; i < 3; i++) {
      const x = R(0, 26);
      back.push({ x: side ? 100 - x : x, y: R(10, 24), s: R(180, 300), o: R(0.3, 0.5), b: 18 });
    }
    for (let i = 0; i < 5; i++) {
      const x = R(-6, 16);
      front.push({ x: side ? 100 - x : x, y: R(42, 70), s: R(240, 420), o: R(0.85, 1), b: R(8, 12) });
    }
  }
  for (let i = 0; i < 16; i++) front.push({ x: -6 + i * 7.5 + R(-2, 2), y: R(80, 100), s: R(320, 560), o: R(0.9, 1), b: R(10, 16) });
  for (let i = 0; i < 6; i++) front.push({ x: 18 + i * 13 + R(-3, 3), y: R(44, 52), s: R(220, 380), o: R(0.35, 0.55), b: 20 });
  return { back, front };
}

const PUFFS = makePuffs();

const TINT = { back: "206,228,247", front: "214,233,249" } as const;

type Props = { layer: "back" | "front"; vw: number; zIndex?: number };

/** Soft blurred cloud puffs, scaled to the viewport width. */
export function Clouds({ layer, vw, zIndex = 0 }: Props) {
  const ck = Math.max(0.55, Math.min(1.15, vw / 1440));
  const t = TINT[layer];
  return (
    <div aria-hidden="true" className={s.clouds} style={{ zIndex }}>
      {PUFFS[layer].map((p, i) => {
        const size = Math.round(p.s * ck);
        return (
          <div
            key={i}
            className={s.puff}
            style={{
              left: `${p.x.toFixed(1)}%`,
              top: `${p.y.toFixed(1)}%`,
              width: size,
              height: Math.round(size * 0.62),
              opacity: +p.o.toFixed(2),
              filter: `blur(${Math.round(p.b * ck)}px)`,
              background: `radial-gradient(ellipse at 50% 38%, #ffffff 0%, rgba(247,251,255,.96) 32%, rgba(${t},.7) 56%, rgba(${t},0) 71%)`,
            }}
          />
        );
      })}
    </div>
  );
}
