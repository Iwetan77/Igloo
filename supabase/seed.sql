-- Demo seed data for the live feed. Safe to run twice (fixed UUIDs + on conflict do nothing).
-- Run in the Supabase SQL editor after applying the migrations (0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006).

insert into users (id, privy_user_id, wallet_address, display_name, onboarded_at, username, bio)
values (
  '00000000-0000-0000-0000-000000000001',
  'did:privy:demo-seed',
  'Demo1111111111111111111111111111111111111111',
  'Igloo Demo',
  now(),
  'igloo',
  'Sharing takes on the markets that matter.'
)
on conflict (privy_user_id) do nothing;

-- Onboarding interests for the demo user.
insert into user_interests (user_id, category, weight, source)
values
  ('00000000-0000-0000-0000-000000000001', 'crypto', 1, 'onboarding'),
  ('00000000-0000-0000-0000-000000000001', 'gaming', 1, 'onboarding'),
  ('00000000-0000-0000-0000-000000000001', 'sports', 1, 'onboarding')
on conflict (user_id, category) do nothing;

insert into posts (id, panta_market_id, author_user_id, video_url, caption)
values
  (
    '00000000-0000-0000-0000-000000000011',
    'GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V',
    '00000000-0000-0000-0000-000000000001',
    'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',
    'Rockstar says November 19th is locked in. I''m not so sure.'
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    'BpPmo7wHrh8bi3ea2ohiVy64sxEnSTufx67zTA9ntnfT',
    '00000000-0000-0000-0000-000000000001',
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    'The run has been wild, but a $1B cap is a big ask.'
  ),
  (
    '00000000-0000-0000-0000-000000000013',
    '1Nm7PCxoHUwGk1J9NoSfy26TQZkitwDf6mamFTZDn1r',
    '00000000-0000-0000-0000-000000000001',
    'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
    'Last time it broke $81k it didn''t hold for long.'
  ),
  (
    '00000000-0000-0000-0000-000000000014',
    'C2XGH1Z6YivhXMqRRBhKDHnFZTAoqkRcwBFTEZ7bdUrr',
    '00000000-0000-0000-0000-000000000001',
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    'Witty Cruz has been on fire since GW1.'
  )
on conflict (id) do nothing;

-- Quote post: the demo user quotes the GTA 6 post (same market, its own video and caption).
insert into posts (id, panta_market_id, author_user_id, video_url, caption, quoted_post_id)
values (
  '00000000-0000-0000-0000-000000000015',
  'GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V',
  '00000000-0000-0000-0000-000000000001',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4',
  'Counterpoint: this one actually ships on time.',
  '00000000-0000-0000-0000-000000000011'
)
on conflict (id) do nothing;

-- Additional takes on the same markets.
insert into posts (id, panta_market_id, author_user_id, video_url, caption)
values
  (
    '00000000-0000-0000-0000-000000000016',
    '69A5oC4BXuHC1hG6EVpLZbgSH4GQGVBMgQKwHz3YhbZk',
    '00000000-0000-0000-0000-000000000001',
    'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4',
    'We''ve been grinding sideways. A drop under $58k changes everything.'
  ),
  (
    '00000000-0000-0000-0000-000000000017',
    'BpPmo7wHrh8bi3ea2ohiVy64sxEnSTufx67zTA9ntnfT',
    '00000000-0000-0000-0000-000000000001',
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4',
    'Everyone''s chasing the $1B cap. I''m fading it.'
  ),
  (
    '00000000-0000-0000-0000-000000000018',
    'GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V',
    '00000000-0000-0000-0000-000000000001',
    'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
    'Rockstar''s last three games all slipped. Bet on the delay.'
  )
on conflict (id) do nothing;

-- Quote post: the demo user quotes the $ANSEM post.
insert into posts (id, panta_market_id, author_user_id, video_url, caption, quoted_post_id)
values (
  '00000000-0000-0000-0000-000000000019',
  'BpPmo7wHrh8bi3ea2ohiVy64sxEnSTufx67zTA9ntnfT',
  '00000000-0000-0000-0000-000000000001',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'That''s a lot of hopium for one coin.',
  '00000000-0000-0000-0000-000000000012'
)
on conflict (id) do nothing;

insert into comments (id, post_id, author_user_id, body)
values
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'No way Rockstar hits that date.'
  ),
  (
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000013',
    '00000000-0000-0000-0000-000000000001',
    'It always breaks $81k and sells off.'
  )
on conflict (id) do nothing;

insert into likes (post_id, user_id)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001')
on conflict (post_id, user_id) do nothing;
