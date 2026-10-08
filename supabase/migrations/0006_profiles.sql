-- Profiles: usernames, bios, avatars (idempotent)

alter table users add column if not exists username text;
alter table users add column if not exists bio text;
alter table users add column if not exists avatar_url text;
create unique index if not exists users_username_lower_key on users (lower(username));
alter table users drop constraint if exists users_username_format;
alter table users add constraint users_username_format
  check (username is null or username ~ '^[a-z0-9_.]{3,20}$');
alter table users drop constraint if exists users_bio_length;
alter table users add constraint users_bio_length check (bio is null or char_length(bio) <= 160);


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- The backend uses end_time to hide finished markets
alter table markets_cache add column if not exists end_time timestamptz;
