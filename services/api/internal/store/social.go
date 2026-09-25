package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---- profile and interests ----

type Me struct {
	User
	Onboarded      bool
	Interests      []string
	FollowerCount  int
	FollowingCount int
}

func (s *Store) Me(ctx context.Context, userID string) (Me, error) {
	var m Me
	err := s.db.QueryRow(ctx, `
		select u.id, u.privy_user_id, u.wallet_address, u.display_name, u.created_at,
		       u.onboarded_at is not null,
		       coalesce((select array_agg(category order by category) from user_interests
		                  where user_id = u.id and source = 'onboarding'), '{}'),
		       (select count(*) from follows where followee_id = u.id),
		       (select count(*) from follows where follower_id = u.id)
		  from users u where u.id = $1`, userID,
	).Scan(&m.ID, &m.PrivyUserID, &m.WalletAddress, &m.DisplayName, &m.CreatedAt,
		&m.Onboarded, &m.Interests, &m.FollowerCount, &m.FollowingCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// SetInterests replaces the user's onboarding picks and marks them onboarded.
// Learned weights for other categories are kept.
func (s *Store) SetInterests(ctx context.Context, userID string, categories []string) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			delete from user_interests
			 where user_id = $1 and source = 'onboarding' and not (category = any($2::text[]))`,
			userID, categories); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into user_interests (user_id, category, weight, source)
			select $1, c, 1, 'onboarding' from unnest($2::text[]) c
			on conflict (user_id, category) do update
			   set source = 'onboarding', weight = greatest(user_interests.weight, 1), updated_at = now()`,
			userID, categories); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `update users set onboarded_at = coalesce(onboarded_at, now()) where id = $1`, userID)
		return err
	})
}

// Learned-interest increments per engagement signal, and the cap per category.
const (
	SignalView    = 0.1 // watched at least a few seconds
	SignalFinish  = 0.3 // watched to the end
	SignalLike    = 0.5
	SignalComment = 0.7
	SignalShare   = 0.7
	SignalQuote   = 1.0
	maxInterest   = 5.0
)

// BumpInterest nudges the user's weight for the category of postID's market.
// Posts whose market has no cached category are skipped.
func (s *Store) BumpInterest(ctx context.Context, userID, postID string, delta float64) error {
	_, err := s.db.Exec(ctx, `
		insert into user_interests (user_id, category, weight, source)
		select $1, mc.category, least($3::numeric, $4::numeric), 'learned'
		  from posts p join markets_cache mc on mc.panta_market_id = p.panta_market_id
		 where p.id = $2 and mc.category is not null and mc.category <> ''
		on conflict (user_id, category) do update
		   set weight = least(user_interests.weight + $3::numeric, $4::numeric), updated_at = now()`,
		userID, postID, delta, maxInterest)
	return err
}

// ---- follows ----

// SetFollow follows (on=true) or unfollows followeeID and returns the
// followee's follower count afterwards.
func (s *Store) SetFollow(ctx context.Context, followerID, followeeID string, on bool) (int, error) {
	var err error
	if on {
		_, err = s.db.Exec(ctx, `insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, followerID, followeeID)
	} else {
		_, err = s.db.Exec(ctx, `delete from follows where follower_id = $1 and followee_id = $2`, followerID, followeeID)
	}
	if err != nil {
		return 0, err
	}
	var n int
	err = s.db.QueryRow(ctx, `select count(*) from follows where followee_id = $1`, followeeID).Scan(&n)
	return n, err
}

type Profile struct {
	ID             string
	DisplayName    *string
	WalletAddress  string
	FollowerCount  int
	FollowingCount int
	PostCount      int
	IsFollowing    bool // viewer follows them
	FollowsMe      bool // they follow the viewer
}

func (s *Store) Profile(ctx context.Context, viewerID, userID string) (Profile, error) {
	var p Profile
	err := s.db.QueryRow(ctx, `
		select u.id, u.display_name, u.wallet_address,
		       (select count(*) from follows where followee_id = u.id),
		       (select count(*) from follows where follower_id = u.id),
		       (select count(*) from posts where author_user_id = u.id),
		       ($1::uuid is not null and exists(select 1 from follows where follower_id = $1::uuid and followee_id = u.id)),
		       ($1::uuid is not null and exists(select 1 from follows where follower_id = u.id and followee_id = $1::uuid))
		  from users u where u.id = $2`, nullable(viewerID), userID,
	).Scan(&p.ID, &p.DisplayName, &p.WalletAddress, &p.FollowerCount, &p.FollowingCount, &p.PostCount, &p.IsFollowing, &p.FollowsMe)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

// SearchUsers matches display names containing q, most-followed first.
func (s *Store) SearchUsers(ctx context.Context, viewerID, q string, limit int) ([]Profile, error) {
	rows, err := s.db.Query(ctx, `
		select u.id, u.display_name, u.wallet_address,
		       (select count(*) from follows where followee_id = u.id) as followers,
		       (select count(*) from follows where follower_id = u.id),
		       (select count(*) from posts where author_user_id = u.id),
		       ($1::uuid is not null and exists(select 1 from follows where follower_id = $1::uuid and followee_id = u.id)),
		       ($1::uuid is not null and exists(select 1 from follows where follower_id = u.id and followee_id = $1::uuid))
		  from users u
		 where u.display_name ilike '%' || replace(replace(replace($2, '\', '\\'), '%', '\%'), '_', '\_') || '%'
		   and ($1::uuid is null or u.id <> $1::uuid)
		 order by followers desc, u.display_name
		 limit $3`, nullable(viewerID), q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Profile{}
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.WalletAddress, &p.FollowerCount, &p.FollowingCount, &p.PostCount, &p.IsFollowing, &p.FollowsMe); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) UserExists(ctx context.Context, userID string) (bool, error) {
	var ok bool
	err := s.db.QueryRow(ctx, `select exists(select 1 from users where id = $1)`, userID).Scan(&ok)
	return ok, err
}

// ---- watch events ----

// maxWatchPerEvent caps one reported view so a stuck client can't inflate totals.
const maxWatchPerEvent = 10 * time.Minute

// RecordView adds one view of postID by userID.
func (s *Store) RecordView(ctx context.Context, userID, postID string, watch time.Duration, completed bool) error {
	ms := min(max(watch, 0), maxWatchPerEvent).Milliseconds()
	_, err := s.db.Exec(ctx, `
		insert into post_views (user_id, post_id, total_watch_ms, completed)
		values ($1, $2, $3, $4)
		on conflict (user_id, post_id) do update
		   set view_count = post_views.view_count + 1,
		       total_watch_ms = post_views.total_watch_ms + excluded.total_watch_ms,
		       completed = post_views.completed or excluded.completed,
		       last_seen_at = now()`,
		userID, postID, ms, completed)
	return err
}

// ---- markets cache ----

type CachedMarket struct {
	ID        string
	Question  *string
	Category  *string
	Phase     *string
	YesPrice  *float64
	NoPrice   *float64
	ImageURL  *string
	PostCount int
	UpdatedAt time.Time
}

func (s *Store) UpsertMarket(ctx context.Context, m CachedMarket) error {
	_, err := s.db.Exec(ctx, `
		insert into markets_cache (panta_market_id, question, category, phase, yes_price, no_price, image_url, updated_at)
		values ($1, $2, $3, $4, $5, $6, $7, now())
		on conflict (panta_market_id) do update set
		   question  = coalesce(excluded.question, markets_cache.question),
		   category  = coalesce(excluded.category, markets_cache.category),
		   phase     = coalesce(excluded.phase, markets_cache.phase),
		   yes_price = coalesce(excluded.yes_price, markets_cache.yes_price),
		   no_price  = coalesce(excluded.no_price, markets_cache.no_price),
		   image_url = coalesce(excluded.image_url, markets_cache.image_url),
		   updated_at = now()`,
		m.ID, m.Question, m.Category, m.Phase, m.YesPrice, m.NoPrice, m.ImageURL)
	return err
}

const marketCols = `mc.panta_market_id, mc.question, mc.category, mc.phase, mc.yes_price::float8, mc.no_price::float8,
		       mc.image_url, (select count(*) from posts p where p.panta_market_id = mc.panta_market_id), mc.updated_at`

func scanMarket(row pgx.Row) (CachedMarket, error) {
	var m CachedMarket
	err := row.Scan(&m.ID, &m.Question, &m.Category, &m.Phase, &m.YesPrice, &m.NoPrice, &m.ImageURL, &m.PostCount, &m.UpdatedAt)
	return m, err
}

func (s *Store) CachedMarketByID(ctx context.Context, id string) (CachedMarket, error) {
	m, err := scanMarket(s.db.QueryRow(ctx, `select `+marketCols+` from markets_cache mc where mc.panta_market_id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// ListMarkets returns open markets (primary or secondary) that have a
// question, optionally in one category: markets with posts first, then by
// most recently refreshed. offset paginates.
func (s *Store) ListMarkets(ctx context.Context, category string, offset, limit int) ([]CachedMarket, error) {
	rows, err := s.db.Query(ctx, `
		select `+marketCols+`
		  from markets_cache mc
		 where mc.phase in ('primary', 'secondary')
		   and coalesce(mc.question, '') <> ''
		   and ($1::text is null or mc.category = $1::text)
		 order by (select count(*) from posts p where p.panta_market_id = mc.panta_market_id) desc,
		          mc.updated_at desc, mc.panta_market_id
		 offset $2 limit $3`, nullable(category), offset, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CachedMarket{}
	for rows.Next() {
		m, err := scanMarket(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// PostedMarketIDs lists every market that has at least one post, so the
// catalog refresher keeps their categories current for ranking.
func (s *Store) PostedMarketIDs(ctx context.Context) ([]string, error) {
	rows, err := s.db.Query(ctx, `select distinct panta_market_id from posts`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CachedMarkets loads cached rows for the given market ids.
func (s *Store) CachedMarkets(ctx context.Context, ids []string) (map[string]CachedMarket, error) {
	out := map[string]CachedMarket{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `select `+marketCols+` from markets_cache mc where mc.panta_market_id = any($1::text[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		m, err := scanMarket(rows)
		if err != nil {
			return nil, err
		}
		out[m.ID] = m
	}
	return out, rows.Err()
}
