-- Quote posts: a post can reference another post (a quote/stitch).
-- quoted_post_id is null for original posts.

alter table posts
  add column quoted_post_id uuid references posts(id) on delete set null;

create index posts_quoted_post_id_idx on posts (quoted_post_id);
