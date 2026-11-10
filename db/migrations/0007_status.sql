-- The status page: how long GHL took to answer each call, and the box's own runs (backups, restore tests) recorded
-- where the app can read them.
alter table scans add column answer_ms integer check (answer_ms >= 0);

-- Written as the database owner by scripts/deploy.sh (each deploy) and ops/backup.sh and ops/restore-test.sh (one row
-- per run, pass or fail). The app only reads them.
create table ops_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('deploy', 'backup', 'offsite', 'restore_test')),
  ok boolean not null,
  at timestamptz not null default now(),
  detail text not null default '' check (length(detail) <= 300)
);
create index ops_runs_latest on ops_runs (kind, at desc);
revoke insert, update, delete on ops_runs from fernway_app;
