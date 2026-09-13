-- Vocal range (melody tessitura) and tempo for catalog songs.
alter table fuwari_songs add column if not exists vocal_min_note text not null default '';
alter table fuwari_songs add column if not exists vocal_max_note text not null default '';
alter table fuwari_songs add column if not exists bpm integer not null default 0;

update fuwari_songs set vocal_min_note = 'C4', vocal_max_note = 'A4', bpm = 80
  where id = 's_pd_sakura' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'C4', vocal_max_note = 'D5', bpm = 84
  where id = 's_pd_furusato' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'C4', vocal_max_note = 'C5', bpm = 120
  where id = 's_pd_haru' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'Bb3', vocal_max_note = 'Eb5', bpm = 66
  where id = 's_pd_oboro' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'A3', vocal_max_note = 'D5', bpm = 60
  where id = 's_pd_kojo' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'D4', vocal_max_note = 'D5', bpm = 80
  where id = 's_pd_hotaru' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'C4', vocal_max_note = 'C5', bpm = 100
  where id = 's_pd_haruogawa' and vocal_min_note = '';
update fuwari_songs set vocal_min_note = 'C4', vocal_max_note = 'D5', bpm = 88
  where id = 's_pd_momiji' and vocal_min_note = '';
