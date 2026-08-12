-- Hobby connector secrets (per signed-in user). Never commit values.
create table if not exists grokbuild_external_connector (
  user_id     text not null,
  app_id      text not null,
  proxy_url   text not null default '',
  api_key     text not null default '',
  basic_user  text not null default '',
  basic_pass  text not null default '',
  namespace   text not null default 'default',
  setup_url   text not null default '',
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, app_id)
);
