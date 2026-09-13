alter table fuwari_songs add column if not exists original_code text not null default '';
alter table fuwari_songs add column if not exists arrangement text not null default '';

create index if not exists fuwari_songs_original_idx
  on fuwari_songs (lower(original_code))
  where original_code <> '';
