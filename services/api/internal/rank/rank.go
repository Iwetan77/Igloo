// Package rank orders the For You feed. It is pure: the store gathers the
// signals, this package scores and arranges them, so the weights can be
// tuned and tested without a database.
package rank

import (
	"math"
	"sort"
)

// Candidate is one post with the signals the ranker uses, as seen by one viewer.
type Candidate struct {
	PostID, AuthorID, MarketID string

	Interest     float64 // viewer's weight for the post's category, normalised to 0..1
	Following    bool    // viewer follows the author
	FollowsBack  bool    // author follows the viewer (both = friends)
	FriendsLiked int     // likes on the post from people the viewer follows

	Likes, Comments, Shares, Quotes, Completions int

	AgeHours float64
	YesPrice *float64 // nil when unknown

	Seen     bool // viewer has watched it before
	Finished bool // ... to the end

	Jitter float64 // deterministic 0..1 per (session seed, post)
}

// Weights for each signal. Positive terms raise a post; Seen and Finished
// are subtracted.
type Weights struct {
	Interest, Following, Friend, FriendsLiked float64
	Engagement, Freshness, Contested, Jitter  float64
	Seen, Finished                            float64
	FreshnessHalfLifeHours                    float64
	// Every ExploreEvery-th slot goes to the best post outside the viewer's
	// interests, so the feed doesn't narrow into a bubble. 0 disables it.
	ExploreEvery int
}

var Default = Weights{
	Interest:               2.0,
	Following:              1.5,
	Friend:                 1.0, // on top of Following
	FriendsLiked:           0.8,
	Engagement:             0.6,
	Freshness:              1.5,
	Contested:              0.3,
	Jitter:                 0.4,
	Seen:                   2.0,
	Finished:               1.5,
	FreshnessHalfLifeHours: 36,
	ExploreEvery:           10,
}

// Score combines a candidate's signals.
func (w Weights) Score(c Candidate) float64 {
	s := w.Interest * c.Interest
	if c.Following {
		s += w.Following
		if c.FollowsBack {
			s += w.Friend
		}
	}
	s += w.FriendsLiked * math.Min(float64(c.FriendsLiked), 3) / 3
	// Log so one viral post can't drown everything; quotes and comments
	// signal more intent than likes.
	eng := float64(c.Likes) + 2*float64(c.Comments) + 2*float64(c.Shares) + 3*float64(c.Quotes) + 0.5*float64(c.Completions)
	s += w.Engagement * math.Log1p(eng)
	if w.FreshnessHalfLifeHours > 0 {
		s += w.Freshness * math.Exp2(-math.Max(c.AgeHours, 0)/w.FreshnessHalfLifeHours)
	}
	if c.YesPrice != nil {
		// 1 at a 50/50 market, 0 at a foregone conclusion.
		s += w.Contested * (1 - math.Min(math.Abs(*c.YesPrice-0.5)*2, 1))
	}
	s += w.Jitter * c.Jitter
	if c.Seen {
		s -= w.Seen
	}
	if c.Finished {
		s -= w.Finished
	}
	return s
}

// Order scores the candidates and arranges them: highest score first, but
// never the same author or market twice in a row when an alternative
// exists, and with an out-of-interest pick every ExploreEvery slots for
// viewers who have interests. It returns post ids.
func (w Weights) Order(cands []Candidate) []string {
	type scored struct {
		Candidate
		score float64
	}
	pool := make([]scored, len(cands))
	hasInterests := false
	for i, c := range cands {
		pool[i] = scored{c, w.Score(c)}
		if c.Interest > 0 {
			hasInterests = true
		}
	}
	sort.SliceStable(pool, func(i, j int) bool {
		if pool[i].score != pool[j].score {
			return pool[i].score > pool[j].score
		}
		return pool[i].PostID < pool[j].PostID
	})

	out := make([]string, 0, len(pool))
	var prev *scored
	for len(pool) > 0 {
		pick := -1
		explore := hasInterests && w.ExploreEvery > 0 && (len(out)+1)%w.ExploreEvery == 0
		if explore {
			for i := range pool {
				if pool[i].Interest == 0 {
					pick = i
					break
				}
			}
		}
		if pick < 0 {
			pick = 0
			if prev != nil {
				// Best post that differs from the previous one in both author
				// and market; failing that, in at least one; failing that, the best.
				partial := -1
				for i := range pool {
					newAuthor, newMarket := pool[i].AuthorID != prev.AuthorID, pool[i].MarketID != prev.MarketID
					if newAuthor && newMarket {
						partial = -2
						pick = i
						break
					}
					if partial == -1 && (newAuthor || newMarket) {
						partial = i
					}
				}
				if partial >= 0 {
					pick = partial
				}
			}
		}
		chosen := pool[pick]
		out = append(out, chosen.PostID)
		pool = append(pool[:pick], pool[pick+1:]...)
		prev = &chosen
	}
	return out
}
