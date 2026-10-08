"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google"],
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "users-without-wallets" },
        },
        appearance: {
          theme: "#0a0b0d",
          accentColor: "#e6e8eb",
          landingHeader: "Sign in to Igloo",
          logo: <span className="privy-logo"><span className="privy-logo-mark" />Igloo</span>,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

