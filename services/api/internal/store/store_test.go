package store

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5"
)

// These run against a real Postgres (embedded-postgres downloads a server
// binary on first use) with the repo's Supabase migrations applied.
// IGLOO_MIGRATIONS_DIR overrides where the migrations are read from.
func openTestStore(t *testing.T) *Store {
	t.Helper()
	if testing.Short() {
		t.Skip("database tests skipped in -short mode")
	}
	dir := os.Getenv("IGLOO_MIGRATIONS_DIR")
	if dir == "" {
		dir = filepath.Join("..", "..", "..", "..", "supabase", "migrations")
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.sql"))
	if len(files) == 0 {
		t.Skipf("no migrations in %s (set IGLOO_MIGRATIONS_DIR)", dir)
	}
	sort.Strings(files)

	tmp := t.TempDir()
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Port(54391).Database("igloo_test").
		RuntimePath(filepath.Join(tmp, "rt")).DataPath(filepath.Join(tmp, "data")).
		Logger(nil))
	if err := pg.Start(); err != nil {
		t.Fatalf("start postgres: %v", err)
	}
	t.Cleanup(func() { _ = pg.Stop() })

	ctx := context.Background()
	url := "postgres://postgres:postgres@localhost:54391/igloo_test"
	c, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	// Supabase provides these; the migrations reference them.
	for _, stmt := range []string{
		"create publication supabase_realtime",
		"create role anon nologin",
		"create role authenticated nologin",
		`create schema storage`,
		`create table storage.buckets (id text primary key, name text not null, public boolean,
			file_size_limit bigint, allowed_mime_types text[])`,
	} {
		if _, err := c.Exec(ctx, stmt); err != nil {
			t.Fatal(err)
		}
	}
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := c.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}
	c.Close(ctx)

	st, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(st.Close)
	return st
}

func TestStore(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	name := "Ada"

	alice, err := st.UpsertUser(ctx, "did:privy:alice", "BD4Ptc3X9Mf7m3KShwsAoi86E1rRfdUkoa7uQhf4Vbcm", &name)
	if err != nil {
		t.Fatal(err)
	}
	bob, err := st.UpsertUser(ctx, "did:privy:bob", "9Nfj7UR9qP64K6ojw8aoGHF62B4zQ9Wr1Lb6Sp98MoNF", nil)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("resync keeps display name when omitted and updates wallet", func(t *testing.T) {
		u, err := st.UpsertUser(ctx, "did:privy:alice", "G7PExRdwMk8UbbSM7nG42EvzA19jEQPVvKHBWU4DjXzE", nil)
		if err != nil {
			t.Fatal(err)
		}
		if u.ID != alice.ID || u.DisplayName == nil || *u.DisplayName != "Ada" || u.WalletAddress != "G7PExRdwMk8UbbSM7nG42EvzA19jEQPVvKHBWU4DjXzE" {
			t.Errorf("got %+v", u)
		}
		if _, err := st.UserByPrivyID(ctx, "did:privy:nobody"); err != ErrNotFound {
			t.Errorf("unknown user: err = %v, want ErrNotFound", err)
		}
	})

	// Five posts; the feed must page through all of them newest-first with no
	// duplicates or gaps, including when timestamps tie.
	var ids []string
	for i := 0; i < 5; i++ {
		p, err := st.CreatePost(ctx, alice.ID, "GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V", "https://example.com/v.mp4", nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, p.ID)
	}
	if _, err := st.db.Exec(ctx, `update posts set created_at = $1 where id = any($2)`, time.Now().Add(-time.Hour), ids[1:3]); err != nil {
		t.Fatal(err)
	}

	t.Run("feed pages cover every post exactly once", func(t *testing.T) {
		seen := map[string]bool{}
		var cur *Cursor
		var last *FeedPost
		for pages := 0; pages < 10; pages++ {
			rows, err := st.Feed(ctx, FeedQuery{Cursor: cur, Limit: 2})
			if err != nil {
				t.Fatal(err)
			}
			if len(rows) == 0 {
				break
			}
			for i := range rows {
				r := rows[i]
				if seen[r.ID] {
					t.Fatalf("post %s returned twice", r.ID)
				}
				seen[r.ID] = true
				if last != nil && r.CreatedAt.After(last.CreatedAt) {
					t.Errorf("feed not newest-first")
				}
				last = &r
			}
			c := Cursor{CreatedAt: last.CreatedAt, ID: last.ID}
			dec, err := DecodeCursor(c.Encode())
			if err != nil || !dec.CreatedAt.Equal(c.CreatedAt) || dec.ID != c.ID {
				t.Fatalf("cursor round trip: %+v, %v", dec, err)
			}
			cur = dec
		}
		if len(seen) != len(ids) {
			t.Errorf("saw %d posts, want %d", len(seen), len(ids))
		}
	})

	post := ids[0]

	t.Run("like toggles and liked_by_me follows the viewer", func(t *testing.T) {
		liked, n, err := st.ToggleLike(ctx, post, bob.ID)
		if err != nil || !liked || n != 1 {
			t.Fatalf("first like: %v %d %v", liked, n, err)
		}
		if _, n, _ := st.ToggleLike(ctx, post, alice.ID); n != 2 {
			t.Errorf("second user's like: count %d, want 2", n)
		}
		byBob := feedPost(t, st, bob.ID, post)
		byAnon := feedPost(t, st, "", post)
		if !byBob.LikedByMe || byAnon.LikedByMe || byBob.LikeCount != 2 {
			t.Errorf("bob sees liked=%v count=%d, anon sees liked=%v", byBob.LikedByMe, byBob.LikeCount, byAnon.LikedByMe)
		}
		liked, n, _ = st.ToggleLike(ctx, post, bob.ID)
		if liked || n != 1 {
			t.Errorf("unlike: %v %d", liked, n)
		}
	})

	t.Run("comments come back oldest-first with author", func(t *testing.T) {
		for _, b := range []string{"first", "second"} {
			if _, err := st.CreateComment(ctx, post, bob.ID, b); err != nil {
				t.Fatal(err)
			}
		}
		cs, err := st.ListComments(ctx, post)
		if err != nil {
			t.Fatal(err)
		}
		if len(cs) != 2 || cs[0].Body != "first" || cs[1].Body != "second" || cs[0].Author.ID != bob.ID {
			t.Errorf("got %+v", cs)
		}
		if got := feedPost(t, st, "", post).CommentCount; got != 2 {
			t.Errorf("comment_count = %d", got)
		}
	})

	t.Run("share count includes the new share", func(t *testing.T) {
		for want := 1; want <= 2; want++ {
			n, err := st.AddShare(ctx, post, bob.ID)
			if err != nil || n != want {
				t.Errorf("share %d: got %d, %v", want, n, err)
			}
		}
	})

	t.Run("quote posts link to the original and survive its deletion", func(t *testing.T) {
		orig, err := st.CreatePost(ctx, alice.ID, "BpPmo7wHrh8bi3ea2ohiVy64sxEnSTufx67zTA9ntnfT", "https://example.com/orig.mp4", &name, nil)
		if err != nil {
			t.Fatal(err)
		}
		if m, err := st.PostMarket(ctx, orig.ID); err != nil || m != orig.PantaMarketID {
			t.Fatalf("PostMarket: %q %v", m, err)
		}
		if _, err := st.PostMarket(ctx, "00000000-0000-0000-0000-000000000000"); err != ErrNotFound {
			t.Errorf("PostMarket missing: %v", err)
		}
		q, err := st.CreatePost(ctx, bob.ID, orig.PantaMarketID, "https://example.com/quote.mp4", nil, &orig.ID)
		if err != nil {
			t.Fatal(err)
		}
		if q.QuotedPostID == nil || *q.QuotedPostID != orig.ID {
			t.Fatalf("created quote: %+v", q)
		}
		fq := feedPost(t, st, "", q.ID)
		if fq.Quoted == nil || fq.Quoted.ID != orig.ID || fq.Quoted.VideoURL != "https://example.com/orig.mp4" ||
			fq.Quoted.Author.ID != alice.ID || fq.Quoted.Caption == nil || *fq.Quoted.Caption != "Ada" {
			t.Errorf("feed quote: %+v", fq.Quoted)
		}
		if n := feedPost(t, st, "", orig.ID).QuoteCount; n != 1 {
			t.Errorf("original quote_count = %d, want 1", n)
		}
		if feedPost(t, st, "", orig.ID).Quoted != nil {
			t.Error("original post reports a quoted post")
		}
		if _, err := st.db.Exec(ctx, `delete from posts where id = $1`, orig.ID); err != nil {
			t.Fatal(err)
		}
		if fq := feedPost(t, st, "", q.ID); fq.Quoted != nil || fq.QuotedPostID != nil {
			t.Errorf("after original deleted: quoted=%+v id=%v, want both nil", fq.Quoted, fq.QuotedPostID)
		}
	})

	t.Run("post existence", func(t *testing.T) {
		if ok, _ := st.PostExists(ctx, post); !ok {
			t.Error("existing post not found")
		}
		if ok, _ := st.PostExists(ctx, "00000000-0000-0000-0000-000000000000"); ok {
			t.Error("missing post reported as existing")
		}
	})
}

func feedPost(t *testing.T, st *Store, viewer, id string) FeedPost {
	t.Helper()
	rows, err := st.Feed(context.Background(), FeedQuery{ViewerID: viewer, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.ID == id {
			return r
		}
	}
	t.Fatalf("post %s not in feed", id)
	return FeedPost{}
}
