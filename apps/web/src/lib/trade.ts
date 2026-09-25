import { Buffer } from "buffer";
import { Connection, VersionedTransaction } from "@solana/web3.js";

export type SolanaSigner = {
  address: string;
  signTransaction(input: { transaction: Uint8Array }): Promise<{ signedTransaction: Uint8Array }>;
};

export async function signAndBroadcast(
  unsignedBase64: string,
  wallet: SolanaSigner,
  onSigned?: () => void,
): Promise<string> {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!endpoint) throw new Error("Solana RPC URL is not configured");
  const transaction = VersionedTransaction.deserialize(Buffer.from(unsignedBase64, "base64"));
  const payer = transaction.message.staticAccountKeys[0]?.toBase58();
  if (payer !== wallet.address) throw new Error("Transaction fee payer does not match the connected wallet");
  const { signedTransaction } = await wallet.signTransaction({
    transaction: new Uint8Array(transaction.serialize()),
  });
  VersionedTransaction.deserialize(signedTransaction);
  onSigned?.();
  const connection = new Connection(endpoint, "confirmed");
  return connection.sendRawTransaction(signedTransaction, { skipPreflight: false });
}
