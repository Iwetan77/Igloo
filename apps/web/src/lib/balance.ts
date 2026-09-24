import { Connection, PublicKey } from "@solana/web3.js";

const USDC_MAINNET_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export async function getUsdcBalance(address: string): Promise<number> {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!endpoint) throw new Error("Solana RPC URL is not configured");
  const connection = new Connection(endpoint, "confirmed");
  const accounts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(address),
    { mint: USDC_MAINNET_MINT },
  );
  return accounts.value.reduce((sum, account) => {
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
    return sum + (typeof amount === "number" ? amount : 0);
  }, 0);
}

