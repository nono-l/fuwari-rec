alter table fuwari_remote_rooms add column if not exists scenes_json text not null default '[]';
