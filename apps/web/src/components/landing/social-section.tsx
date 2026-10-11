import s from "./landing.module.css";
import { RevealHeading } from "./reveal-heading";

const POINTS = [
  { title: "Quote posts", body: "Answer someone's take with your own video, with theirs attached." },
  { title: "Follows", body: "Follow people whose thinking you like and see their new takes first." },
  { title: "Profiles", body: "Each profile shows a person's takes and which side they took." },
];

export function SocialSection() {
  return (
    <section className={`${s.section} ${s.socialSection}`}>
      <div className={`${s.container} ${s.socialGrid}`}>
        <div className={s.socialCopy}>
          <RevealHeading text="Quote a take. Add yours." className={s.heading} />
          <div className={s.socialPoints}>
            {POINTS.map((p) => (
              <div key={p.title} className={s.pointText}>
                <strong>{p.title}</strong>
                <span>{p.body}</span>
              </div>
            ))}
          </div>
        </div>

        <div role="img" aria-label="Example of a quoted take" className={s.quote}>
          <div className={s.quoteHead}>
            <span className={s.avatar}>R</span>
            <div className={s.quoteWho}>
              @rainorshine
              <small>Quoted @groundsman</small>
            </div>
            <span className={s.tookYes}>Took YES</span>
          </div>
          <p className={s.quoteText}>The radar has a band coming in right around kickoff. Bring a jacket.</p>
          <div className={s.quoteVideo}>
            <div className={s.stripes} />
            <div className={s.play} />
            <span className={s.videoTag}>video take</span>
          </div>
          <div className={s.quoted}>
            <div className={s.quotedThumb} />
            <div className={s.quotedBody}>
              <span className={s.quotedHandle}>@groundsman</span>
              <span className={s.quotedQ}>Will it rain at Saturday&apos;s match?</span>
              <div className={s.prices}>
                <span>Yes 62¢</span>
                <span>No 38¢</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
