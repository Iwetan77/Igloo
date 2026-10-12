package storage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The browser uploads with the token we return; if we parsed it or built the
// URLs wrong, every upload would fail with an opaque storage error.
func TestSignUpload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/storage/v1/object/upload/sign/videos/u1/a.mp4" {
			http.Error(w, "unexpected "+r.Method+" "+r.URL.Path, http.StatusNotFound)
			return
		}
		if r.Header.Get("apikey") != "sk" || r.Header.Get("Authorization") != "Bearer sk" {
			http.Error(w, "bad key", http.StatusUnauthorized)
			return
		}
		w.Write([]byte(`{"url":"/object/upload/sign/videos/u1/a.mp4?token=tok123"}`))
	}))
	defer srv.Close()

	up, err := New(srv.URL+"/", "sk").SignUpload(context.Background(), "videos", "u1/a.mp4")
	if err != nil {
		t.Fatal(err)
	}
	if up.Token != "tok123" {
		t.Errorf("token = %q", up.Token)
	}
	if want := srv.URL + "/storage/v1/object/upload/sign/videos/u1/a.mp4?token=tok123"; up.UploadURL != want {
		t.Errorf("upload url = %q, want %q", up.UploadURL, want)
	}
	if want := srv.URL + "/storage/v1/object/public/videos/u1/a.mp4"; up.PublicURL != want {
		t.Errorf("public url = %q, want %q", up.PublicURL, want)
	}

	if _, err := New(srv.URL, "wrong").SignUpload(context.Background(), "videos", "u1/a.mp4"); err == nil {
		t.Error("rejected key: want error")
	}
}
