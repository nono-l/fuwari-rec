-- Songs a signed-in user marked as "I can sing this" (public on /c/{soulId}).
create table if not exists fuwari_singable (
  user_id text not null,
  song_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index if not exists fuwari_singable_song_idx on fuwari_singable (song_id);
create index if not exists fuwari_singable_user_at_idx on fuwari_singable (user_id, created_at desc);
