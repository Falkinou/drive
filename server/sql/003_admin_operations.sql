create table if not exists admin_audit_log (
  id bigserial primary key,
  technician_code citext not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on admin_audit_log(created_at desc);
create index if not exists admin_audit_actor_idx on admin_audit_log(technician_code, created_at desc);
create index if not exists activity_technician_created_idx on activity_log(technician_code, created_at desc);
create index if not exists activity_created_idx on activity_log(created_at desc);
create index if not exists visits_site_date_idx on visits(site_id, visited_at desc);
create index if not exists visits_date_idx on visits(visited_at desc);
create index if not exists login_logs_created_idx on login_logs(created_at desc);
