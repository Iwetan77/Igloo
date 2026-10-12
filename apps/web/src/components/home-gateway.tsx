"use client";

import { usePrivy } from "@privy-io/react-auth";
import { FeedExperience } from "@/components/feed-experience";

export function HomeGateway({ landing }: { landing: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  if (!ready) return <main className="setup-screen" role="status">Opening Igloo...</main>;
  return authenticated ? <FeedExperience /> : landing;
}
