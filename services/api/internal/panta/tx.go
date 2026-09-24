package panta

import (
	"encoding/base64"
	"fmt"

	"github.com/gagliardetto/solana-go"
)

// CompileUnsignedTx turns Panta's instruction list into a base64 unsigned v0
// VersionedTransaction with payer as fee payer. Signature slots are zero-filled
// so wallets (Privy, Phantom, web3.js VersionedTransaction.deserialize) can
// sign it as-is.
func CompileUnsignedTx(instrs []Instruction, recentBlockhash, payer string) (string, error) {
	if len(instrs) == 0 {
		return "", fmt.Errorf("no instructions to compile")
	}
	payerKey, err := solana.PublicKeyFromBase58(payer)
	if err != nil {
		return "", fmt.Errorf("payer %q: %w", payer, err)
	}
	bh, err := solana.HashFromBase58(recentBlockhash)
	if err != nil {
		return "", fmt.Errorf("recentBlockhash %q: %w", recentBlockhash, err)
	}
	out := make([]solana.Instruction, 0, len(instrs))
	for i, in := range instrs {
		prog, err := solana.PublicKeyFromBase58(in.ProgramID)
		if err != nil {
			return "", fmt.Errorf("instruction %d programId: %w", i, err)
		}
		data, err := base64.StdEncoding.DecodeString(in.Data)
		if err != nil {
			return "", fmt.Errorf("instruction %d data: %w", i, err)
		}
		metas := make(solana.AccountMetaSlice, 0, len(in.Accounts))
		for j, a := range in.Accounts {
			pk, err := solana.PublicKeyFromBase58(a.Pubkey)
			if err != nil {
				return "", fmt.Errorf("instruction %d account %d: %w", i, j, err)
			}
			metas = append(metas, &solana.AccountMeta{PublicKey: pk, IsSigner: a.IsSigner, IsWritable: a.IsWritable})
		}
		out = append(out, solana.NewInstruction(prog, metas, data))
	}
	tx, err := solana.NewTransaction(out, bh, solana.TransactionPayer(payerKey))
	if err != nil {
		return "", err
	}
	if _, err := tx.Message.SetVersion(solana.MessageVersionV0); err != nil {
		return "", err
	}
	raw, err := tx.MarshalBinary()
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

// ValidPubkey reports whether s is a base58 32-byte Solana public key.
func ValidPubkey(s string) bool {
	_, err := solana.PublicKeyFromBase58(s)
	return err == nil
}
