alter table fuwari_songs add column if not exists mgmt_no text not null default '';

update fuwari_songs
set mgmt_no = karaoke_no
where mgmt_no = '' and karaoke_no <> '';

create unique index if not exists fuwari_songs_mgmt_uk
  on fuwari_songs (lower(mgmt_no))
  where mgmt_no <> '';
