-- Community listen/subscribe URLs on a song (signed-in users add).
create table if not exists fuwari_song_links (
  id text primary key,
  song_id text not null,
  url text not null,
  service text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists fuwari_song_links_song_url_idx
  on fuwari_song_links (song_id, url);
create index if not exists fuwari_song_links_song_at_idx
  on fuwari_song_links (song_id, created_at desc);
