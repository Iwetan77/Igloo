package store

import (
	"context"
	"testing"
	"time"
)

func TestProfilesAndEndedMarkets(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	str := func(s string) *string { return &s }
	a, _ := st.UpsertUser(ctx, "did:privy:a", "BD4Ptc3X9Mf7m3KShwsAoi86E1rRfdUkoa7uQhf4Vbcm", str("Ada"))
	b, _ := st.UpsertUser(ctx, "did:privy:b", "9Nfj7UR9qP64K6ojw8aoGHF62B4zQ9Wr1Lb6Sp98MoNF", str("Bo"))

	t.Run("username, bio, avatar updates", func(t *testing.T) {
		if err := st.UpdateProfile(ctx, a.ID, ProfileUpdate{Username: str("ada.l"), Bio: str("hi"), AvatarURL: str("https://x/avatars/a.png")}); err != nil {
			t.Fatal(err)
		}
		// The API lowercases usernames before saving; the database enforces
		// both the lowercase format and uniqueness.
		if err := st.UpdateProfile(ctx, b.ID, ProfileUpdate{Username: str("ada.l")}); err != ErrUsernameTaken {
			t.Errorf("duplicate username: err = %v, want ErrUsernameTaken", err)
		}
		if err := st.UpdateProfile(ctx, b.ID, ProfileUpdate{Username: str("ADA.L")}); err == nil {
			t.Error("uppercase username accepted by the database")
		}
		if err := st.UpdateProfile(ctx, b.ID, ProfileUpdate{Username: str("no spaces!")}); err == nil {
			t.Error("format constraint not enforced by the database")
		}
		// nil leaves fields alone; "" clears.
		if err := st.UpdateProfile(ctx, a.ID, ProfileUpdate{Bio: str("")}); err != nil {
			t.Fatal(err)
		}
		m, _ := st.Me(ctx, a.ID)
		if m.Username == nil || *m.Username != "ada.l" || m.Bio != nil || m.AvatarURL == nil || *m.DisplayName != "Ada" {
			t.Errorf("me after updates: username=%v bio=%v avatar=%v name=%v", m.Username, m.Bio, m.AvatarURL, m.DisplayName)
		}
		p, err := st.ProfileByUsername(ctx, b.ID, "ADA.L")
		if err != nil || p.ID != a.ID {
			t.Errorf("by username: %+v %v", p, err)
		}
		if _, err := st.ProfileByUsername(ctx, "", "nobody"); err != ErrNotFound {
			t.Errorf("unknown username: %v", err)
		}
		if res, _ := st.SearchUsers(ctx, b.ID, "ada.", 10); len(res) != 1 || res[0].ID != a.ID {
			t.Errorf("search by username: %+v", res)
		}
	})

	t.Run("liked feed, likes received, author fields", func(t *testing.T) {
		p1, _ := st.CreatePost(ctx, a.ID, "m1", "https://example.com/1.mp4", nil, nil)
		p2, _ := st.CreatePost(ctx, a.ID, "m1", "https://example.com/2.mp4", nil, nil)
		st.ToggleLike(ctx, p1.ID, b.ID)
		st.ToggleLike(ctx, p2.ID, b.ID)
		st.ToggleLike(ctx, p2.ID, a.ID)
		liked, err := st.Feed(ctx, FeedQuery{ViewerID: b.ID, LikedBy: b.ID, Limit: 10})
		if err != nil || len(liked) != 2 {
			t.Fatalf("b's liked: %d %v", len(liked), err)
		}
		if liked[0].Author.Username == nil || *liked[0].Author.Username != "ada.l" || liked[0].Author.AvatarURL == nil {
			t.Errorf("feed author missing username/avatar: %+v", liked[0].Author)
		}
		if l, _ := st.Feed(ctx, FeedQuery{LikedBy: a.ID, Limit: 10}); len(l) != 1 || l[0].ID != p2.ID {
			t.Errorf("a's liked: %+v", l)
		}
		if m, _ := st.Me(ctx, a.ID); m.LikesReceived != 3 {
			t.Errorf("likes_received = %d, want 3", m.LikesReceived)
		}
		if p, _ := st.Profile(ctx, "", a.ID); p.LikesReceived != 3 || p.PostCount != 2 {
			t.Errorf("profile counts: %+v", p)
		}
		c, err := st.CreateComment(ctx, p1.ID, a.ID, "mine")
		if err != nil || c.Author.Username == nil || *c.Author.Username != "ada.l" {
			t.Errorf("comment author: %+v %v", c.Author, err)
		}
	})

	t.Run("finished markets are hidden from the markets list", func(t *testing.T) {
		past, future := time.Now().Add(-time.Hour), time.Now().Add(24*time.Hour)
		st.UpsertMarket(ctx, CachedMarket{ID: "ended", Question: str("Old match?"), Category: str("sports"), Phase: str("primary"), EndTime: &past})
		st.UpsertMarket(ctx, CachedMarket{ID: "live", Question: str("Future match?"), Category: str("sports"), Phase: str("primary"), EndTime: &future})
		st.UpsertMarket(ctx, CachedMarket{ID: "unknown-end", Question: str("No end?"), Category: str("sports"), Phase: str("primary")})
		// A later refresh without an end time must not erase the known one.
		st.UpsertMarket(ctx, CachedMarket{ID: "ended", Phase: str("primary")})
		ms, err := st.ListMarkets(ctx, "sports", 0, 50)
		if err != nil {
			t.Fatal(err)
		}
		got := map[string]bool{}
		for _, m := range ms {
			got[m.ID] = true
		}
		if got["ended"] || !got["live"] || !got["unknown-end"] {
			t.Errorf("markets listed: %v", got)
		}
		if m, _ := st.CachedMarketByID(ctx, "ended"); m.EndTime == nil {
			t.Error("end_time was erased by a blank refresh")
		}
	})
}
