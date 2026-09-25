package store

import (
	"context"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/rank"
)

// candidateWindow bounds how far back For You looks, and maxCandidates how
// many posts it scores per request.
const (
	candidateWindow = 30 * 24 * time.Hour
	maxCandidates   = 500
)

// ForYouCandidates returns the ranking signals for recent posts as seen by
// viewerID ("" = anonymous) at asOf. Views after asOf are ignored so a
// paginated session ranks consistently while the user watches.
func (s *Store) ForYouCandidates(ctx context.Context, viewerID string, asOf time.Time, seed string) ([]rank.Candidate, error) {
	rows, err := s.db.Query(ctx, `
		with maxw as (
		  select coalesce(max(weight), 0)::float8 as m from user_interests where user_id = $1::uuid
		)
		select p.id, p.author_user_id, p.panta_market_id,
		       coalesce(ui.weight::float8 / nullif((select m from maxw), 0), 0),
		       ($1::uuid is not null and exists(select 1 from follows f where f.follower_id = $1::uuid and f.followee_id = p.author_user_id)),
		       ($1::uuid is not null and exists(select 1 from follows f where f.follower_id = p.author_user_id and f.followee_id = $1::uuid)),
		       (select count(*) from likes l join follows f on f.followee_id = l.user_id
		         where l.post_id = p.id and f.follower_id = $1::uuid),
		       (select count(*) from likes    l where l.post_id = p.id),
		       (select count(*) from comments c where c.post_id = p.id),
		       (select count(*) from shares   s where s.post_id = p.id),
		       (select count(*) from posts   qp where qp.quoted_post_id = p.id),
		       (select count(*) from post_views v where v.post_id = p.id and v.completed),
		       extract(epoch from ($2::timestamptz - p.created_at)) / 3600.0,
		       mc.yes_price::float8,
		       coalesce(mv.last_seen_at <= $2::timestamptz, false),
		       coalesce(mv.completed and mv.last_seen_at <= $2::timestamptz, false),
		       ('x' || substr(md5($3::text || p.id::text), 1, 8))::bit(32)::bigint / 4294967295.0
		  from posts p
		  left join markets_cache mc  on mc.panta_market_id = p.panta_market_id
		  left join user_interests ui on ui.user_id = $1::uuid and ui.category = mc.category
		  left join post_views mv     on mv.user_id = $1::uuid and mv.post_id = p.id
		 where p.created_at <= $2::timestamptz
		   and p.created_at > $2::timestamptz - make_interval(secs => $4::float8)
		   and ($1::uuid is null or p.author_user_id <> $1::uuid)
		 order by p.created_at desc
		 limit $5`,
		nullable(viewerID), asOf, seed, candidateWindow.Seconds(), maxCandidates)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []rank.Candidate
	for rows.Next() {
		var c rank.Candidate
		if err := rows.Scan(&c.PostID, &c.AuthorID, &c.MarketID,
			&c.Interest, &c.Following, &c.FollowsBack, &c.FriendsLiked,
			&c.Likes, &c.Comments, &c.Shares, &c.Quotes, &c.Completions,
			&c.AgeHours, &c.YesPrice, &c.Seen, &c.Finished, &c.Jitter); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
