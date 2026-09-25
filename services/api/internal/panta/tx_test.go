package panta

import (
	"encoding/base64"
	"testing"

	"github.com/gagliardetto/solana-go"
)

// Panta's primary build returns instructions, not a transaction, so a
// compile bug would surface as the wallet refusing to sign (wrong payer,
// missing signature slots, legacy vs v0). Decode what we produce and check
// the fields a wallet relies on.
func TestCompileUnsignedTx(t *testing.T) {
	payer := solana.NewWallet().PublicKey()
	other := solana.NewWallet().PublicKey()
	bh := solana.Hash(solana.NewWallet().PublicKey())
	prog := solana.MustPublicKeyFromBase58("6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp")

	b64, err := CompileUnsignedTx([]Instruction{{
		ProgramID: prog.String(),
		Data:      base64.StdEncoding.EncodeToString([]byte{1, 2, 3}),
		Accounts: []AccountMeta{
			{Pubkey: payer.String(), IsSigner: true, IsWritable: true},
			{Pubkey: other.String(), IsWritable: true},
		},
	}}, bh.String(), payer.String())
	if err != nil {
		t.Fatal(err)
	}

	t.Logf("unsigned tx: %s", b64)
	tx, err := solana.TransactionFromBase64(b64)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !tx.Message.IsVersioned() {
		t.Error("want a v0 versioned message")
	}
	if got := tx.Message.AccountKeys[0]; got != payer {
		t.Errorf("fee payer = %s, want %s", got, payer)
	}
	if tx.Message.RecentBlockhash != bh {
		t.Errorf("blockhash = %s, want %s", tx.Message.RecentBlockhash, bh)
	}
	if n := tx.Message.Header.NumRequiredSignatures; n != 1 || len(tx.Signatures) != 1 {
		t.Errorf("signatures: header=%d slots=%d, want 1 zeroed slot", n, len(tx.Signatures))
	}
	if !tx.Signatures[0].IsZero() {
		t.Error("signature slot should be zero (unsigned)")
	}
	if len(tx.Message.Instructions) != 1 {
		t.Fatalf("instructions = %d", len(tx.Message.Instructions))
	}
	ix := tx.Message.Instructions[0]
	if tx.Message.AccountKeys[ix.ProgramIDIndex] != prog {
		t.Error("program id not preserved")
	}
	if string(ix.Data) != "\x01\x02\x03" {
		t.Errorf("data = %v", []byte(ix.Data))
	}
}

func TestCompileUnsignedTxRejectsBadInput(t *testing.T) {
	payer := solana.NewWallet().PublicKey().String()
	bh := solana.Hash(solana.NewWallet().PublicKey()).String()
	cases := map[string]struct {
		ins   []Instruction
		bh    string
		payer string
	}{
		"no instructions (pk_test_ sandbox build)": {nil, bh, payer},
		"sandbox blockhash":                        {[]Instruction{{ProgramID: payer}}, "SandboxBlockhash11111111111111111111111111111", payer},
		"bad payer":                                {[]Instruction{{ProgramID: payer}}, bh, "notakey"},
	}
	for name, c := range cases {
		if _, err := CompileUnsignedTx(c.ins, c.bh, c.payer); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
}
