create table if not exists fuwari_scenes (
  user_id text primary key,
  payload_json text not null default '{}',
  updated_at timestamptz not null default now()
);
