-- Onboarding interests + learned preferences
create table if not exists user_interests (
  user_id uuid not null references users(id) on delete cascade,
  category text not null,
  weight numeric not null default 1,
  source text not null default 'onboarding' check (source in ('onboarding','learned')),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table users add column if not exists onboarded_at timestamptz;


-- Follows (friends = mutual follows)
create table if not exists follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on follows (followee_id);


-- Watch signals for the For You algorithm (one row per user+post)
create table if not exists post_views (
  user_id uuid not null references users(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  view_count int not null default 1,
  total_watch_ms bigint not null default 0,
  completed boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists post_views_post_idx on post_views (post_id);


-- Cached Panta market info (the backend fills it; used for ranking by category)
create table if not exists markets_cache (
  panta_market_id text primary key,
  question text,
  category text,
  phase text,
  yes_price numeric,
  no_price numeric,
  image_url text,
  updated_at timestamptz not null default now()
);


create index if not exists posts_created_at_idx on posts (created_at desc);
create index if not exists posts_market_idx on posts (panta_market_id);


alter table user_interests enable row level security;
alter table follows enable row level security;
alter table post_views enable row level security;
alter table markets_cache enable row level security;
