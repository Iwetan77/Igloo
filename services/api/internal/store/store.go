// Package store reads and writes the app's social data (users, posts,
// comments, likes, shares) in the Supabase Postgres schema from
// supabase/migrations.
package store

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID            string    `json:"id"`
	PrivyUserID   string    `json:"privy_user_id"`
	WalletAddress string    `json:"wallet_address"`
	DisplayName   *string   `json:"display_name"`
	CreatedAt     time.Time `json:"created_at"`
}

type Post struct {
	ID            string    `json:"id"`
	PantaMarketID string    `json:"panta_market_id"`
	VideoURL      string    `json:"video_url"`
	Caption       *string   `json:"caption"`
	AuthorUserID  string    `json:"author_user_id"`
	QuotedPostID  *string   `json:"quoted_post_id"`
	CreatedAt     time.Time `json:"created_at"`
}

type Author struct {
	ID            string
	DisplayName   *string
	WalletAddress string
	Username      *string
	AvatarURL     *string
}

type FeedPost struct {
	Post
	Author       Author
	Quoted       *QuotedPost // nil for originals, or when the quoted post was deleted
	LikeCount    int
	CommentCount int
	ShareCount   int
	QuoteCount   int
	LikedByMe    bool
}

// QuotedPost is the compact view of the post a quote points at.
type QuotedPost struct {
	ID        string
	VideoURL  string
	Caption   *string
	CreatedAt time.Time
	Author    Author
}

type Comment struct {
	ID        string
	Body      string
	CreatedAt time.Time
	Author    Author
}

// Cursor is a keyset position in the feed: the next page holds posts strictly
// after (CreatedAt, ID) in (created_at desc, id desc) order.
type Cursor struct {
	CreatedAt time.Time
	ID        string
}

func (c Cursor) Encode() string {
	return base64.RawURLEncoding.EncodeToString([]byte(c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID))
}

func DecodeCursor(s string) (*Cursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	ts, id, ok := strings.Cut(string(b), "|")
	if !ok || !IsUUID(id) {
		return nil, errors.New("malformed cursor")
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return nil, err
	}
	return &Cursor{CreatedAt: t, ID: id}, nil
}

type Store struct {
	db *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	// Supabase's transaction pooler (port 6543) does not support prepared
	// statements; the simple protocol works against both pooler and direct.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to database: %w", err)
	}
	return &Store{db: pool}, nil
}

func (s *Store) Close() { s.db.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.db.Ping(ctx) }

// UpsertUser creates the user or updates its wallet. A nil displayName keeps
// the stored one.
func (s *Store) UpsertUser(ctx context.Context, privyUserID, wallet string, displayName *string) (User, error) {
	var u User
	err := s.db.QueryRow(ctx, `
		insert into users (privy_user_id, wallet_address, display_name)
		values ($1, $2, $3)
		on conflict (privy_user_id) do update
		   set wallet_address = excluded.wallet_address,
		       display_name   = coalesce(excluded.display_name, users.display_name)
		returning id, privy_user_id, wallet_address, display_name, created_at`,
		privyUserID, wallet, displayName,
	).Scan(&u.ID, &u.PrivyUserID, &u.WalletAddress, &u.DisplayName, &u.CreatedAt)
	return u, err
}

func (s *Store) UserByPrivyID(ctx context.Context, privyUserID string) (User, error) {
	var u User
	err := s.db.QueryRow(ctx, `
		select id, privy_user_id, wallet_address, display_name, created_at
		  from users where privy_user_id = $1`, privyUserID,
	).Scan(&u.ID, &u.PrivyUserID, &u.WalletAddress, &u.DisplayName, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// CreatePost inserts a post. quotedPostID is nil for an original post.
func (s *Store) CreatePost(ctx context.Context, authorID, marketID, videoURL string, caption, quotedPostID *string) (Post, error) {
	var p Post
	err := s.db.QueryRow(ctx, `
		insert into posts (panta_market_id, author_user_id, video_url, caption, quoted_post_id)
		values ($1, $2, $3, $4, $5)
		returning id, panta_market_id, video_url, caption, author_user_id, quoted_post_id, created_at`,
		marketID, authorID, videoURL, caption, quotedPostID,
	).Scan(&p.ID, &p.PantaMarketID, &p.VideoURL, &p.Caption, &p.AuthorUserID, &p.QuotedPostID, &p.CreatedAt)
	return p, err
}

// PostMarket returns the market a post is on, or ErrNotFound.
func (s *Store) PostMarket(ctx context.Context, postID string) (string, error) {
	var m string
	err := s.db.QueryRow(ctx, `select panta_market_id from posts where id = $1`, postID).Scan(&m)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return m, err
}

func (s *Store) PostExists(ctx context.Context, postID string) (bool, error) {
	var ok bool
	err := s.db.QueryRow(ctx, `select exists(select 1 from posts where id = $1)`, postID).Scan(&ok)
	return ok, err
}

// FeedQuery selects a chronological (newest-first) page of posts.
type FeedQuery struct {
	ViewerID      string // "" for anonymous; drives liked_by_me and FollowingOnly
	Cursor        *Cursor
	Limit         int
	MarketID      string // only posts on this Panta market
	AuthorID      string // only posts by this user
	FollowingOnly bool   // only posts by users ViewerID follows
	LikedBy       string // only posts this user liked
}

// feedSelect is every column a feed row needs; $1 is the viewer id (or null).
const feedSelect = `
		select p.id, p.panta_market_id, p.video_url, p.caption, p.author_user_id, p.quoted_post_id, p.created_at,
		       u.id, u.display_name, u.wallet_address, u.username, u.avatar_url,
		       q.id, q.video_url, q.caption, q.created_at, qu.id, qu.display_name, qu.wallet_address, qu.username, qu.avatar_url,
		       (select count(*) from likes    l where l.post_id = p.id),
		       (select count(*) from comments c where c.post_id = p.id),
		       (select count(*) from shares   s where s.post_id = p.id),
		       (select count(*) from posts   qp where qp.quoted_post_id = p.id),
		       ($1::uuid is not null and exists(
		           select 1 from likes l where l.post_id = p.id and l.user_id = $1::uuid))
		  from posts p
		  join users u on u.id = p.author_user_id
		  left join posts q  on q.id  = p.quoted_post_id
		  left join users qu on qu.id = q.author_user_id`

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Feed returns up to q.Limit posts after q.Cursor (nil = newest first).
func (s *Store) Feed(ctx context.Context, q FeedQuery) ([]FeedPost, error) {
	var curTime *time.Time
	var curID *string
	if q.Cursor != nil {
		curTime, curID = &q.Cursor.CreatedAt, &q.Cursor.ID
	}
	rows, err := s.db.Query(ctx, feedSelect+`
		 where ($2::timestamptz is null or (p.created_at, p.id) < ($2::timestamptz, $3::uuid))
		   and ($5::text is null or p.panta_market_id = $5::text)
		   and ($6::uuid is null or p.author_user_id = $6::uuid)
		   and (not $7::boolean or exists(
		         select 1 from follows f where f.follower_id = $1::uuid and f.followee_id = p.author_user_id))
		   and ($8::uuid is null or exists(select 1 from likes lb where lb.post_id = p.id and lb.user_id = $8::uuid))
		 order by p.created_at desc, p.id desc
		 limit $4`,
		nullable(q.ViewerID), curTime, curID, q.Limit, nullable(q.MarketID), nullable(q.AuthorID), q.FollowingOnly, nullable(q.LikedBy))
	if err != nil {
		return nil, err
	}
	return scanFeed(rows)
}

// PostsByID hydrates the given posts, returned in the order of ids.
func (s *Store) PostsByID(ctx context.Context, viewerID string, ids []string) ([]FeedPost, error) {
	if len(ids) == 0 {
		return []FeedPost{}, nil
	}
	rows, err := s.db.Query(ctx, feedSelect+` where p.id = any($2::uuid[])`, nullable(viewerID), ids)
	if err != nil {
		return nil, err
	}
	got, err := scanFeed(rows)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]FeedPost, len(got))
	for _, p := range got {
		byID[p.ID] = p
	}
	out := make([]FeedPost, 0, len(ids))
	for _, id := range ids {
		if p, ok := byID[id]; ok {
			out = append(out, p)
		}
	}
	return out, nil
}

func scanFeed(rows pgx.Rows) ([]FeedPost, error) {
	defer rows.Close()
	out := []FeedPost{}
	for rows.Next() {
		var f FeedPost
		var qID, qVideo, qAuthorID, qAuthorWallet *string
		var qCaption, qAuthorName, qAuthorUsername, qAuthorAvatar *string
		var qCreated *time.Time
		if err := rows.Scan(&f.ID, &f.PantaMarketID, &f.VideoURL, &f.Caption, &f.AuthorUserID, &f.QuotedPostID, &f.CreatedAt,
			&f.Author.ID, &f.Author.DisplayName, &f.Author.WalletAddress, &f.Author.Username, &f.Author.AvatarURL,
			&qID, &qVideo, &qCaption, &qCreated, &qAuthorID, &qAuthorName, &qAuthorWallet, &qAuthorUsername, &qAuthorAvatar,
			&f.LikeCount, &f.CommentCount, &f.ShareCount, &f.QuoteCount, &f.LikedByMe); err != nil {
			return nil, err
		}
		if qID != nil {
			f.Quoted = &QuotedPost{ID: *qID, VideoURL: *qVideo, Caption: qCaption, CreatedAt: *qCreated,
				Author: Author{ID: *qAuthorID, DisplayName: qAuthorName, WalletAddress: *qAuthorWallet,
					Username: qAuthorUsername, AvatarURL: qAuthorAvatar}}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) ListComments(ctx context.Context, postID string) ([]Comment, error) {
	rows, err := s.db.Query(ctx, `
		select c.id, c.body, c.created_at, u.id, u.display_name, u.wallet_address, u.username, u.avatar_url
		  from comments c
		  join users u on u.id = c.author_user_id
		 where c.post_id = $1
		 order by c.created_at asc, c.id asc`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Comment{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.Body, &c.CreatedAt, &c.Author.ID, &c.Author.DisplayName, &c.Author.WalletAddress,
			&c.Author.Username, &c.Author.AvatarURL); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) CreateComment(ctx context.Context, postID, authorID, body string) (Comment, error) {
	var c Comment
	err := s.db.QueryRow(ctx, `
		with ins as (
		  insert into comments (post_id, author_user_id, body) values ($1, $2, $3)
		  returning id, body, created_at, author_user_id
		)
		select ins.id, ins.body, ins.created_at, u.id, u.display_name, u.wallet_address, u.username, u.avatar_url
		  from ins join users u on u.id = ins.author_user_id`,
		postID, authorID, body,
	).Scan(&c.ID, &c.Body, &c.CreatedAt, &c.Author.ID, &c.Author.DisplayName, &c.Author.WalletAddress,
		&c.Author.Username, &c.Author.AvatarURL)
	return c, err
}

// ToggleLike likes the post if the user hasn't, otherwise unlikes it.
func (s *Store) ToggleLike(ctx context.Context, postID, userID string) (bool, int, error) {
	var liked bool
	var count int
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from likes where post_id = $1 and user_id = $2`, postID, userID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			if _, err := tx.Exec(ctx, `
				insert into likes (post_id, user_id) values ($1, $2)
				on conflict do nothing`, postID, userID); err != nil {
				return err
			}
			liked = true
		}
		return tx.QueryRow(ctx, `select count(*) from likes where post_id = $1`, postID).Scan(&count)
	})
	return liked, count, err
}

func (s *Store) AddShare(ctx context.Context, postID, userID string) (int, error) {
	var count int
	err := s.db.QueryRow(ctx, `
		with ins as (insert into shares (post_id, user_id) values ($1, $2) returning post_id)
		select count(*) + 1 from shares where post_id = $1`, postID, userID).Scan(&count)
	return count, err
}

// IsUUID reports whether s is a canonical 8-4-4-4-12 hex UUID.
func IsUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, r := range s {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || r >= 'A' && r <= 'F') {
				return false
			}
		}
	}
	return true
}
