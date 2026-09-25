package store

import (
	"context"
	"testing"
	"time"
)

func TestSocialAndRanking(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	mk := func(privy, wallet, name string) User {
		u, err := st.UpsertUser(ctx, privy, wallet, &name)
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	ann := mk("did:privy:ann", "BD4Ptc3X9Mf7m3KShwsAoi86E1rRfdUkoa7uQhf4Vbcm", "Ann")
	ben := mk("did:privy:ben", "9Nfj7UR9qP64K6ojw8aoGHF62B4zQ9Wr1Lb6Sp98MoNF", "Ben")
	cat := mk("did:privy:cat", "G7PExRdwMk8UbbSM7nG42EvzA19jEQPVvKHBWU4DjXzE", "Cat")

	str := func(s string) *string { return &s }
	f := func(v float64) *float64 { return &v }
	for _, m := range []CachedMarket{
		{ID: "mkt-crypto", Question: str("BTC 100k?"), Category: str("crypto"), Phase: str("primary"), YesPrice: f(0.5), NoPrice: f(0.5)},
		{ID: "mkt-sports", Question: str("Derby?"), Category: str("sports"), Phase: str("secondary"), YesPrice: f(0.9), NoPrice: f(0.1)},
		{ID: "mkt-done", Question: str("Old?"), Category: str("sports"), Phase: str("resolved")},
		{ID: "mkt-blank", Category: str("sports"), Phase: str("primary")},
	} {
		if err := st.UpsertMarket(ctx, m); err != nil {
			t.Fatal(err)
		}
	}
	post := func(author User, market string) Post {
		p, err := st.CreatePost(ctx, author.ID, market, "https://example.com/v.mp4", nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	benCrypto := post(ben, "mkt-crypto")
	catSports := post(cat, "mkt-sports")
	annCrypto := post(ann, "mkt-crypto")

	t.Run("onboarding interests and me", func(t *testing.T) {
		m, err := st.Me(ctx, ann.ID)
		if err != nil || m.Onboarded || len(m.Interests) != 0 {
			t.Fatalf("before onboarding: %+v %v", m, err)
		}
		if err := st.SetInterests(ctx, ann.ID, []string{"sports", "crypto"}); err != nil {
			t.Fatal(err)
		}
		if err := st.SetInterests(ctx, ann.ID, []string{"crypto"}); err != nil { // re-pick drops sports
			t.Fatal(err)
		}
		m, _ = st.Me(ctx, ann.ID)
		if !m.Onboarded || len(m.Interests) != 1 || m.Interests[0] != "crypto" {
			t.Errorf("after onboarding: %+v", m)
		}
	})

	t.Run("upsert keeps known values when Panta sends blanks", func(t *testing.T) {
		if err := st.UpsertMarket(ctx, CachedMarket{ID: "mkt-crypto", Phase: str("primary")}); err != nil {
			t.Fatal(err)
		}
		m, err := st.CachedMarketByID(ctx, "mkt-crypto")
		if err != nil || m.Question == nil || *m.Question != "BTC 100k?" || m.YesPrice == nil || m.PostCount != 2 {
			t.Errorf("got %+v %v", m, err)
		}
	})

	t.Run("markets list hides resolved and question-less markets", func(t *testing.T) {
		all, err := st.ListMarkets(ctx, "", 0, 50)
		if err != nil {
			t.Fatal(err)
		}
		if len(all) != 2 || all[0].ID != "mkt-crypto" { // crypto has 2 posts, so it sorts first
			t.Errorf("all: %+v", all)
		}
		sports, _ := st.ListMarkets(ctx, "sports", 0, 50)
		if len(sports) != 1 || sports[0].ID != "mkt-sports" {
			t.Errorf("sports: %+v", sports)
		}
	})

	t.Run("follows, friends, profile, search", func(t *testing.T) {
		if n, err := st.SetFollow(ctx, ann.ID, ben.ID, true); err != nil || n != 1 {
			t.Fatalf("follow: %d %v", n, err)
		}
		if n, _ := st.SetFollow(ctx, ann.ID, ben.ID, true); n != 1 {
			t.Errorf("double follow counted twice: %d", n)
		}
		p, _ := st.Profile(ctx, ann.ID, ben.ID)
		if !p.IsFollowing || p.FollowsMe || p.FollowerCount != 1 || p.PostCount != 1 {
			t.Errorf("one-way: %+v", p)
		}
		st.SetFollow(ctx, ben.ID, ann.ID, true)
		if p, _ = st.Profile(ctx, ann.ID, ben.ID); !p.IsFollowing || !p.FollowsMe {
			t.Errorf("mutual: %+v", p)
		}
		if _, err := st.SetFollow(ctx, ann.ID, ann.ID, true); err == nil {
			t.Error("self-follow allowed")
		}
		res, err := st.SearchUsers(ctx, ann.ID, "be", 20)
		if err != nil || len(res) != 1 || res[0].ID != ben.ID || !res[0].IsFollowing {
			t.Errorf("search: %+v %v", res, err)
		}
		if res, _ := st.SearchUsers(ctx, ann.ID, "%", 20); len(res) != 0 {
			t.Errorf("wildcard not escaped: %+v", res)
		}
	})

	t.Run("following feed and market feed", func(t *testing.T) {
		fol, err := st.Feed(ctx, FeedQuery{ViewerID: ann.ID, FollowingOnly: true, Limit: 50})
		if err != nil || len(fol) != 1 || fol[0].ID != benCrypto.ID {
			t.Errorf("following feed: %+v %v", fol, err)
		}
		byMarket, _ := st.Feed(ctx, FeedQuery{MarketID: "mkt-sports", Limit: 50})
		if len(byMarket) != 1 || byMarket[0].ID != catSports.ID {
			t.Errorf("market feed: %+v", byMarket)
		}
		byAuthor, _ := st.Feed(ctx, FeedQuery{AuthorID: ann.ID, Limit: 50})
		if len(byAuthor) != 1 || byAuthor[0].ID != annCrypto.ID {
			t.Errorf("author feed: %+v", byAuthor)
		}
	})

	t.Run("views and learned interests", func(t *testing.T) {
		before := time.Now()
		if err := st.RecordView(ctx, ann.ID, catSports.ID, 4*time.Second, false); err != nil {
			t.Fatal(err)
		}
		if err := st.RecordView(ctx, ann.ID, catSports.ID, time.Hour, true); err != nil { // capped at 10 min
			t.Fatal(err)
		}
		var views int
		var watchMS int64
		var completed bool
		st.db.QueryRow(ctx, `select view_count, total_watch_ms, completed from post_views where user_id=$1 and post_id=$2`,
			ann.ID, catSports.ID).Scan(&views, &watchMS, &completed)
		if views != 2 || watchMS != 4000+600000 || !completed {
			t.Errorf("views=%d watch=%d completed=%v", views, watchMS, completed)
		}
		for i := 0; i < 20; i++ {
			st.BumpInterest(ctx, ann.ID, catSports.ID, SignalQuote)
		}
		var w float64
		var src string
		st.db.QueryRow(ctx, `select weight::float8, source from user_interests where user_id=$1 and category='sports'`, ann.ID).Scan(&w, &src)
		if w != maxInterest || src != "learned" {
			t.Errorf("sports interest = %v (%s), want capped %v learned", w, src, maxInterest)
		}

		cands, err := st.ForYouCandidates(ctx, ann.ID, time.Now(), "seed")
		if err != nil {
			t.Fatal(err)
		}
		byID := map[string]int{}
		for i, c := range cands {
			byID[c.PostID] = i
		}
		if _, own := byID[annCrypto.ID]; own {
			t.Error("viewer's own post is a candidate")
		}
		s, b := cands[byID[catSports.ID]], cands[byID[benCrypto.ID]]
		if s.Interest != 1 || !s.Seen || !s.Finished || s.YesPrice == nil || *s.YesPrice != 0.9 {
			t.Errorf("sports candidate: %+v", s)
		}
		if b.Interest != 0.2 || !b.Following || !b.FollowsBack || b.Seen { // crypto 1 / sports 5
			t.Errorf("ben's crypto candidate: %+v", b)
		}
		if s.Jitter < 0 || s.Jitter > 1 {
			t.Errorf("jitter out of range: %v", s.Jitter)
		}
		// Views after the session's asOf don't count, so pages stay stable.
		old, _ := st.ForYouCandidates(ctx, ann.ID, before.Add(-time.Hour), "seed")
		for _, c := range old {
			if c.Seen {
				t.Errorf("view after asOf leaked into ranking: %+v", c)
			}
		}
		anon, _ := st.ForYouCandidates(ctx, "", time.Now(), "seed")
		if len(anon) != 3 {
			t.Errorf("anonymous candidates = %d, want all 3 posts", len(anon))
		}
	})
}
