import { Montserrat } from "next/font/google";
import { Categories } from "./categories";
import { ChartSection } from "./chart-section";
import { Finale } from "./finale";
import { LandingHero } from "./hero";
import { HowItWorks } from "./how-it-works";
import s from "./landing.module.css";
import { LandingNav } from "./nav";
import { RiskSection } from "./risk-section";
import { SocialSection } from "./social-section";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  display: "swap",
});

// Marks the root as JS-enabled before hydration so headline words can start blurred.
const markJs = "document.currentScript.parentElement.setAttribute('data-js','')";

/** Public landing page for Igloo. Every "Open Igloo" button leads into the app. */
export function Landing() {
  return (
    <div className={`${s.root} ${montserrat.className}`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: markJs }} />
      <LandingNav />
      <LandingHero />
      {/* Sections slide up over the sticky hero. */}
      <main style={{ position: "relative", zIndex: 1 }}>
        <HowItWorks />
        <Categories />
        <ChartSection />
        <SocialSection />
        <RiskSection />
        <Finale />
      </main>
    </div>
  );
}
