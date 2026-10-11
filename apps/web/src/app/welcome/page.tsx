import type { Metadata, Viewport } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "Igloo: Place your prediction",
  description:
    "Watch short video takes on real-world questions, make yours, and back it with a YES or NO. Sign in with Google. No wallet setup.",
};

export const viewport: Viewport = {
  themeColor: "#1678d6",
};

export default function WelcomePage() {
  return <Landing />;
}
