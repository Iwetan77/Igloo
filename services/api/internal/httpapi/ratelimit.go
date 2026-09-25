package httpapi

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// window allows at most n events per d.
type window struct {
	n int
	d time.Duration
}

// Per-user write limits. An upload URL can carry up to 50 MB, so the upload
// limit also caps how fast one account can fill the bucket (500 MB/day).
var (
	postLimits    = []window{{5, 10 * time.Minute}, {20, 24 * time.Hour}}
	commentLimits = []window{{10, time.Minute}, {200, 24 * time.Hour}}
	uploadLimits  = []window{{3, 10 * time.Minute}, {10, 24 * time.Hour}}
)

// rateLimiter keeps a sliding log of event times per key. Counts are small
// (tens per user per day), so a slice per key is cheap. In-process only,
// like the order sessions: the service runs as a single instance.
type rateLimiter struct {
	mu     sync.Mutex
	events map[string][]time.Time
	now    func() time.Time
}

func newRateLimiter() *rateLimiter {
	rl := &rateLimiter{events: map[string][]time.Time{}, now: time.Now}
	go func() {
		for range time.Tick(10 * time.Minute) {
			rl.prune(24 * time.Hour)
		}
	}()
	return rl
}

// allow records an event for key if every window has room, and otherwise
// reports how long until the tightest full window frees a slot.
func (rl *rateLimiter) allow(key string, limits []window) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()
	longest := time.Duration(0)
	for _, w := range limits {
		longest = max(longest, w.d)
	}
	evs := rl.events[key]
	// Drop events older than the longest window; evs stays sorted.
	i := 0
	for i < len(evs) && now.Sub(evs[i]) >= longest {
		i++
	}
	evs = evs[i:]

	var wait time.Duration
	for _, w := range limits {
		// Events inside this window are the tail of evs.
		j := len(evs)
		for j > 0 && now.Sub(evs[j-1]) < w.d {
			j--
		}
		if len(evs)-j >= w.n {
			// The oldest event counted in this window must age out first.
			oldest := evs[len(evs)-w.n]
			wait = max(wait, w.d-now.Sub(oldest))
		}
	}
	if wait > 0 {
		rl.events[key] = evs
		return false, wait
	}
	rl.events[key] = append(evs, now)
	return true, 0
}

func (rl *rateLimiter) prune(older time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()
	for k, evs := range rl.events {
		if len(evs) == 0 || now.Sub(evs[len(evs)-1]) >= older {
			delete(rl.events, k)
		}
	}
}

// limit writes a 429 and returns false when userID has used up action's
// limits. Call it after validation, right before the write, so rejected
// requests don't consume the allowance.
func (s *Server) limit(w http.ResponseWriter, action, userID string, limits []window) bool {
	ok, wait := s.limiter.allow(action+":"+userID, limits)
	if ok {
		return true
	}
	secs := int(math.Ceil(wait.Seconds()))
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	writeError(w, http.StatusTooManyRequests, "RATE_LIMITED", "too many requests; retry in "+strconv.Itoa(secs)+"s")
	return false
}
