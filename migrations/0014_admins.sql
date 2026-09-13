-- Built-in admins. Default identity is the linked account for
-- touko5536@gmail.com (always admin in code even without a row).
create table if not exists fuwari_admins (
  email text primary key,
  user_id text not null default '',
  granted_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists fuwari_admins_user_idx on fuwari_admins (user_id);
