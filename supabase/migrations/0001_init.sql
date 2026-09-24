-- Igloo initial schema (verbatim from IGLOO_CONTRACT.md Section 2)

create table users (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text unique not null,
  wallet_address text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  panta_market_id text not null,
  author_user_id uuid not null references users(id),
  video_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_user_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid references users(id),
  created_at timestamptz not null default now()
);

-- optional, only if time allows: speeds up reloading a user's positions
-- without re-hitting Panta every time
create table positions_cache (
  wallet_address text not null,
  panta_market_id text not null,
  shares_yes numeric not null default 0,
  shares_no numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (wallet_address, panta_market_id)
);

-- Enable Supabase Realtime replication on comments and likes
alter publication supabase_realtime add table comments, likes;
