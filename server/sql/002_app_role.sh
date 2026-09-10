#!/bin/sh
set -eu

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=app_password="$APP_DB_PASSWORD" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'drive_app') then
    create role drive_app login;
  end if;
end
$$;

alter role drive_app with
  login
  password :'app_password'
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication;

select format('grant connect on database %I to drive_app', current_database()) \gexec
grant usage on schema public to drive_app;
grant select, insert, update, delete on all tables in schema public to drive_app;
grant usage, select on all sequences in schema public to drive_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to drive_app;
alter default privileges in schema public
  grant usage, select on sequences to drive_app;
SQL
