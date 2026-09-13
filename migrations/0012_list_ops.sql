-- Proxy singing-list operators (soul-ID invite, max 20 including pending).
alter table fuwari_singable add column if not exists source text not null default 'self';
alter table fuwari_singable add column if not exists added_by text not null default '';

alter table fuwari_profiles add column if not exists ops_public text not null default 'hide';

create table if not exists fuwari_list_ops (
  owner_id text not null,
  op_id text not null,
  status text not null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (owner_id, op_id)
);
create index if not exists fuwari_list_ops_op_idx
  on fuwari_list_ops (op_id, status);
create index if not exists fuwari_list_ops_owner_status_idx
  on fuwari_list_ops (owner_id, status);

create table if not exists fuwari_list_audit (
  id text primary key,
  owner_id text not null,
  actor_id text not null,
  action text not null,
  song_id text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists fuwari_list_audit_owner_at_idx
  on fuwari_list_audit (owner_id, created_at desc);
create index if not exists fuwari_list_audit_owner_song_idx
  on fuwari_list_audit (owner_id, song_id);
create index if not exists fuwari_list_audit_actor_add_idx
  on fuwari_list_audit (actor_id, action, created_at desc);
