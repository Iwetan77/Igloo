"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import "@/styles/signup.css";

export function SignupExperience() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (ready && authenticated) router.replace("/feed");
  }, [ready, authenticated, router]);

  return <main className="signup-screen">
    <header className="signup-header"><Link href="/landing" className="signup-brand"><span className="logo-square" />Igloo</Link><Link href="/landing" className="signup-back"><ArrowLeft size={17} />Back</Link></header>
    <section className="signup-content" aria-labelledby="signup-title">
      <span className="signup-eyebrow">Join Igloo</span>
      <h1 id="signup-title">Make your call.</h1>
      <p>Watch real takes, follow the markets that matter to you, and share your own.</p>
      <button type="button" className="signup-google" onClick={login} disabled={!ready || authenticated}>{!ready ? "Connecting..." : authenticated ? "Opening Igloo..." : "Continue with Google"}<ArrowRight size={18} /></button>
      <Link href="/trade" className="signup-explore">Explore markets first <ArrowRight size={16} /></Link>
    </section>
  </main>;
}
