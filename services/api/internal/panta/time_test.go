package panta

import (
	"encoding/json"
	"testing"
	"time"
)

// Live Panta sends unix seconds and the sandbox sends RFC 3339; a wrong parse
// would mark live markets as ended (or never ended) in the Markets tab.
func TestFlexTime(t *testing.T) {
	var v struct {
		A flexTime `json:"a"`
		B flexTime `json:"b"`
		C flexTime `json:"c"`
		D flexTime `json:"d"`
	}
	if err := json.Unmarshal([]byte(`{"a":1798675200,"b":"2026-12-31T23:59:59Z","c":null,"d":"garbage"}`), &v); err != nil {
		t.Fatal(err)
	}
	if v.A.t == nil || !v.A.t.Equal(time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("unix seconds: %v", v.A.t)
	}
	if v.B.t == nil || v.B.t.Year() != 2026 || v.B.t.Month() != 12 {
		t.Errorf("rfc3339: %v", v.B.t)
	}
	if v.C.t != nil || v.D.t != nil {
		t.Errorf("null/garbage should be unknown: %v %v", v.C.t, v.D.t)
	}
}
