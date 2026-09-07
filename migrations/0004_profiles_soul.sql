-- Public card is addressed by XProof soul ID: /c/{soul_id}
alter table fuwari_profiles add column if not exists soul_id text not null default '';
create unique index if not exists fuwari_profiles_soul_id_uk
  on fuwari_profiles (soul_id)
  where soul_id <> '';
