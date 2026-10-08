package rank

import "testing"

func p(v float64) *float64 { return &v }

func TestScoreSignals(t *testing.T) {
	w := Default
	base := Candidate{PostID: "x", AgeHours: 1, YesPrice: p(0.5)}
	higher := func(name string, better Candidate) {
		t.Helper()
		if w.Score(better) <= w.Score(base) {
			t.Errorf("%s did not raise the score: %.3f <= %.3f", name, w.Score(better), w.Score(base))
		}
	}
	with := func(f func(*Candidate)) Candidate { c := base; f(&c); return c }

	higher("interest", with(func(c *Candidate) { c.Interest = 1 }))
	higher("following", with(func(c *Candidate) { c.Following = true }))
	higher("engagement", with(func(c *Candidate) { c.Likes, c.Quotes = 10, 2 }))
	if w.Score(with(func(c *Candidate) { c.Following, c.FollowsBack = true, true })) <= w.Score(with(func(c *Candidate) { c.Following = true })) {
		t.Error("friends should outrank one-way follows")
	}
	if w.Score(with(func(c *Candidate) { c.FollowsBack = true })) != w.Score(base) {
		t.Error("someone following you (but not followed back) should not boost their posts")
	}
	if w.Score(with(func(c *Candidate) { c.AgeHours = 200 })) >= w.Score(base) {
		t.Error("older post should score lower")
	}
	if w.Score(with(func(c *Candidate) { c.YesPrice = p(0.97) })) >= w.Score(base) {
		t.Error("a foregone market should score lower than a contested one")
	}
	if w.Score(with(func(c *Candidate) { c.Seen, c.Finished = true, true })) >= w.Score(with(func(c *Candidate) { c.Seen = true })) {
		t.Error("finished should sink further than merely seen")
	}
	if w.Score(with(func(c *Candidate) { c.Likes = 1000 })) > w.Score(base)+w.Engagement*7.0 {
		t.Error("engagement should be log-damped")
	}
}

func TestOrderDiversityAndExploration(t *testing.T) {
	w := Default
	w.Jitter = 0
	var cands []Candidate
	// Twelve strong posts from one author on one market the viewer loves,
	// and weaker posts elsewhere.
	for i := 0; i < 12; i++ {
		cands = append(cands, Candidate{PostID: "hot" + string(rune('a'+i)), AuthorID: "star", MarketID: "m1", Interest: 1, Likes: 50, AgeHours: 1})
	}
	for i := 0; i < 6; i++ {
		cands = append(cands, Candidate{PostID: "other" + string(rune('a'+i)), AuthorID: "a" + string(rune('a'+i)), MarketID: "m" + string(rune('2'+i)), Interest: 0.5, AgeHours: 5})
	}
	cands = append(cands, Candidate{PostID: "explore", AuthorID: "new", MarketID: "mx", Interest: 0, AgeHours: 50})

	order := w.Order(cands)
	if len(order) != len(cands) {
		t.Fatalf("lost posts: %d of %d", len(order), len(cands))
	}
	seen := map[string]bool{}
	for _, id := range order {
		if seen[id] {
			t.Fatalf("duplicate %s", id)
		}
		seen[id] = true
	}
	author := map[string]string{}
	for _, c := range cands {
		author[c.PostID] = c.AuthorID
	}
	// While alternatives remain, the star never appears twice in a row.
	for i := 1; i < 12; i++ {
		if author[order[i]] == "star" && author[order[i-1]] == "star" {
			t.Errorf("same author back to back at %d: %v", i, order[:i+1])
			break
		}
	}
	if order[0][:3] != "hot" {
		t.Errorf("best post should lead, got %s", order[0])
	}
	if order[9] != "explore" {
		t.Errorf("slot 10 should be the out-of-interest pick, got %s (order %v)", order[9], order)
	}

	// Anonymous viewers (no interests anywhere) get no forced exploration slot.
	for i := range cands {
		cands[i].Interest = 0
	}
	if o := w.Order(cands); len(o) != len(cands) {
		t.Fatal("anonymous order lost posts")
	}
}

func TestOrderDeterministic(t *testing.T) {
	cands := []Candidate{
		{PostID: "a", AuthorID: "1", MarketID: "x", Jitter: 0.3},
		{PostID: "b", AuthorID: "2", MarketID: "y", Jitter: 0.3},
		{PostID: "c", AuthorID: "3", MarketID: "z", Jitter: 0.9},
	}
	first := Default.Order(cands)
	for i := 0; i < 20; i++ {
		if got := Default.Order(cands); got[0] != first[0] || got[1] != first[1] || got[2] != first[2] {
			t.Fatalf("order changed between calls: %v vs %v", first, got)
		}
	}
}

// When nothing differs in both author and market, prefer a post that
// differs in one of them over an exact repeat.
func TestOrderPartialDiversity(t *testing.T) {
	w := Default
	w.Jitter = 0
	cands := []Candidate{
		{PostID: "demo-gta-1", AuthorID: "demo", MarketID: "gta", Likes: 9},
		{PostID: "demo-gta-2", AuthorID: "demo", MarketID: "gta", Likes: 8},
		{PostID: "ben-gta", AuthorID: "ben", MarketID: "gta", Likes: 1},
		{PostID: "demo-btc", AuthorID: "demo", MarketID: "btc", Likes: 1},
	}
	o := w.Order(cands)
	if o[0] != "demo-gta-1" || o[1] == "demo-gta-2" {
		t.Errorf("exact repeat chosen while a partial alternative existed: %v", o)
	}
}
