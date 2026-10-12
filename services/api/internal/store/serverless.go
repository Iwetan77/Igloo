package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// State that used to live in process memory. On serverless hosting every
// request may land on a different instance, so the buy flow's sessions and
// the rate limiter's counters are kept in Postgres (migration 0007).

// OrderSessionTTL bounds how long a quote can be carried through build,
// submit and verify.
const OrderSessionTTL = 30 * time.Minute

type OrderSession struct {
	QuoteID   string
	Wallet    string
	MarketID  string
	OrderID   string
	Signature string
	CreatedAt time.Time
}

// PutOrderSession records a fresh quote, replacing any earlier session with
// the same quote id, and clears out expired sessions.
func (s *Store) PutOrderSession(ctx context.Context, quoteID, wallet, marketID string) error {
	_, err := s.db.Exec(ctx, `
		with cleanup as (
		  delete from order_sessions where created_at < now() - make_interval(secs => $4)
		)
		insert into order_sessions (quote_id, wallet_address, panta_market_id)
		values ($1, $2, $3)
		on conflict (quote_id) do update
		   set wallet_address = excluded.wallet_address, panta_market_id = excluded.panta_market_id,
		       order_id = null, signature = null, created_at = now()`,
		quoteID, wallet, marketID, OrderSessionTTL.Seconds())
	return err
}

const orderSessionCols = `quote_id, wallet_address, panta_market_id, coalesce(order_id, ''), coalesce(signature, ''), created_at`

func scanOrderSession(row pgx.Row) (OrderSession, error) {
	var o OrderSession
	err := row.Scan(&o.QuoteID, &o.Wallet, &o.MarketID, &o.OrderID, &o.Signature, &o.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return o, ErrNotFound
	}
	return o, err
}

// OrderSessionByQuote returns an unexpired session, or ErrNotFound.
func (s *Store) OrderSessionByQuote(ctx context.Context, quoteID string) (OrderSession, error) {
	return scanOrderSession(s.db.QueryRow(ctx, `select `+orderSessionCols+` from order_sessions
		 where quote_id = $1 and created_at > now() - make_interval(secs => $2)`, quoteID, OrderSessionTTL.Seconds()))
}

// OrderSessionBySignature returns the unexpired session a signature was submitted for, or ErrNotFound.
func (s *Store) OrderSessionBySignature(ctx context.Context, signature string) (OrderSession, error) {
	return scanOrderSession(s.db.QueryRow(ctx, `select `+orderSessionCols+` from order_sessions
		 where signature = $1 and created_at > now() - make_interval(secs => $2)`, signature, OrderSessionTTL.Seconds()))
}

func (s *Store) SetOrderSessionOrder(ctx context.Context, quoteID, orderID string) error {
	_, err := s.db.Exec(ctx, `update order_sessions set order_id = $2 where quote_id = $1`, quoteID, orderID)
	return err
}

func (s *Store) SetOrderSessionSignature(ctx context.Context, quoteID, signature string) error {
	_, err := s.db.Exec(ctx, `update order_sessions set signature = $2 where quote_id = $1`, quoteID, signature)
	return err
}

// RateWindow allows at most N events per D.
type RateWindow struct {
	N int
	D time.Duration
}

// AllowRate records an event for key if every window has room; otherwise it
// reports how long until the fullest window frees a slot. A per-key advisory
// lock makes concurrent requests for one key count one at a time, so two
// instances can't both let the Nth request through.
func (s *Store) AllowRate(ctx context.Context, key string, windows []RateWindow) (bool, time.Duration, error) {
	allowed := false
	var wait time.Duration
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 7))`, key); err != nil {
			return err
		}
		longest := time.Duration(0)
		wait = 0
		for _, w := range windows {
			longest = max(longest, w.D)
			// Seconds until the oldest event counted against this window ages
			// out, or null if the window still has room.
			var secs *float64
			if err := tx.QueryRow(ctx, `
				select extract(epoch from (make_interval(secs => $2) - (now() - at)))
				  from rate_events
				 where key = $1 and at > now() - make_interval(secs => $2)
				 order by at desc
				 offset $3 - 1 limit 1`, key, w.D.Seconds(), w.N).Scan(&secs); err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if secs != nil && *secs > 0 {
				wait = max(wait, time.Duration(*secs*float64(time.Second)))
			}
		}
		if wait > 0 {
			return nil
		}
		if _, err := tx.Exec(ctx, `
			with cleanup as (
			  delete from rate_events where key = $1 and at < now() - make_interval(secs => $2)
			)
			insert into rate_events (key) values ($1)`, key, longest.Seconds()); err != nil {
			return err
		}
		allowed = true
		return nil
	})
	return allowed, wait, err
}
