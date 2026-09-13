create unique index if not exists fuwari_songs_karaoke_uk
  on fuwari_songs (lower(karaoke_no))
  where karaoke_no <> '';
