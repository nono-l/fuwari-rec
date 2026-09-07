-- Public singer profiles (range, FX, XProof-linked identities).
create table if not exists fuwari_profiles (
  user_id text primary key,
  slug text not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  is_public boolean not null default true,
  x_handle text not null default '',
  youtube_json text not null default '[]',
  identities_json text not null default '[]',
  xproof_linked boolean not null default false,
  xproof_linked_at timestamptz,
  range_min_note text not null default '',
  range_max_note text not null default '',
  range_span integer not null default 0,
  range_published_at timestamptz,
  fx_json text not null default '[]',
  updated_at timestamptz not null default now()
);
create unique index if not exists fuwari_profiles_slug_lower_idx
  on fuwari_profiles (lower(slug));
