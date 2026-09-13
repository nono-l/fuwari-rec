alter table fuwari_songs add column if not exists platforms_json text not null default '[]';
