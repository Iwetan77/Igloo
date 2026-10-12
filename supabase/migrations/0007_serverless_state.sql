-- In-progress buys: quote -> build -> submit -> verify can hit different serverless instances.
create table if not exists order_sessions (
  quote_id text primary key,
  wallet_address text not null,
  panta_market_id text not null,
  order_id text,
  signature text unique,
  created_at timestamptz not null default now()
);
create index if not exists order_sessions_created_idx on order_sessions (created_at);


-- Per-user rate-limit events, shared across instances.
create table if not exists rate_events (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_key_at_idx on rate_events (key, at desc);


alter table order_sessions enable row level security;
alter table rate_events enable row level security;
