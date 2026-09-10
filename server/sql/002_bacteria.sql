alter table bacteria_sessions add column if not exists winner integer;
alter table bacteria_sessions add column if not exists ended_at timestamptz;
alter table bacteria_sessions add column if not exists last_move jsonb;

create unique index if not exists bacteria_active_code_unique
  on bacteria_sessions(code)
  where status in ('waiting', 'playing');
