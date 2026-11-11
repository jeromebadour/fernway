-- The operator console: Fernway's own staff (who may open /operator, and as what), what they did there, and incidents
-- (a watcher that went wrong: when it opened, when it cleared, who acknowledged it).
create table staff (
  user_id bigint primary key references users(id) on delete cascade,
  role text not null check (role in ('owner', 'support', 'viewer')),
  added_by bigint references users(id) on delete set null,
  added_at timestamptz not null default now()
);

create table operator_audit (
  id bigint generated always as identity primary key,
  user_id bigint references users(id) on delete set null,
  -- Kept as written at the time, so the line still reads right after the person leaves.
  who text not null check (length(who) between 1 and 80),
  action text not null check (action in (
    'staff.added', 'staff.role', 'staff.removed', 'account.synced', 'account.trial_extended',
    'incident.acknowledged', 'incident.noted')),
  account_id bigint references accounts(id) on delete set null,
  target text check (length(target) <= 80),
  detail text not null default '' check (length(detail) <= 300),
  at timestamptz not null default now()
);
create index operator_audit_latest on operator_audit (at desc);
-- Written once, never changed: the app may add a line, not edit or remove one.
revoke update, delete on operator_audit from fernway_app;

create table incidents (
  id bigint generated always as identity primary key,
  watcher text not null check (watcher ~ '^[a-z_]{1,40}$'),
  level text not null check (level in ('warn', 'down')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  -- What the watcher read when it opened, and the worst it read while open.
  first_reading text not null check (length(first_reading) <= 200),
  worst_reading text not null check (length(worst_reading) <= 200),
  acknowledged_by bigint references users(id) on delete set null,
  acknowledged_at timestamptz,
  note text check (length(note) <= 500)
);
-- One open incident per watcher.
create unique index incidents_open_once on incidents (watcher) where closed_at is null;
create index incidents_latest on incidents (opened_at desc);
