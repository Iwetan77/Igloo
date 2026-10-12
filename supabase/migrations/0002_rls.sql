-- Row Level Security

alter table users enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table likes enable row level security;
alter table shares enable row level security;
alter table positions_cache enable row level security;

create policy "public read comments" on comments for select to anon, authenticated using (true);
create policy "public read likes" on likes for select to anon, authenticated using (true);
