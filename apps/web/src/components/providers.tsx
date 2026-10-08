"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { useEffect } from "react";
import { syncThemeColor, useTheme } from "@/lib/theme";

const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const theme = useTheme();
  useEffect(() => syncThemeColor(theme), [theme]);
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["twitter", "email", "wallet", "google"],
        externalWallets: { solana: { connectors: solanaConnectors } },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "users-without-wallets" },
        },
        appearance: {
          theme: theme === "dark" ? "#0d1f22" : "#f4f3ef",
          accentColor: theme === "dark" ? "#cbc6fb" : "#06191c",
          walletChainType: "solana-only",
          landingHeader: "Sign in to Igloo",
          logo: <span className="privy-logo"><span className="privy-logo-mark" />Igloo</span>,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

