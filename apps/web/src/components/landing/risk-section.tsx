import s from "./landing.module.css";
import { RevealHeading } from "./reveal-heading";

export function RiskSection() {
  return (
    <section id="risk" className={`${s.section} ${s.riskSection}`}>
      <div className={`${s.container} ${s.riskPanel}`}>
        <div className={s.riskCol}>
          <RevealHeading text="Real money, plain terms" className={s.riskHeading} />
          <p className={s.riskText}>
            Trades on Igloo use real USDC on Solana. Prediction markets carry risk, and you can lose what you put in. Only
            trade what you are comfortable losing.
          </p>
        </div>
        <div className={`${s.riskCol} ${s.riskColEnd}`}>
          <h3 className={s.riskSub}>Eligibility</h3>
          <p className={s.riskNote}>
            You must be of legal age and live in a supported region to trade. Igloo is not available everywhere. Anyone
            can sign in to watch takes.
          </p>
        </div>
      </div>
    </section>
  );
}
