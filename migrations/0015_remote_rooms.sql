create table if not exists fuwari_remote_rooms (
  code text primary key,
  scene text not null default 'talk',
  host_at bigint not null,
  pad_at bigint not null default 0
);
