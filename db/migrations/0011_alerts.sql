-- Alert emails: one row per email to send, made once (a lead held or returned tells each person once; Monday's summary
-- once a week), then sent by the worker with retries. A row that keeps failing is given up after 8 tries and kept.
create table alerts (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null check (kind in ('held', 'returned', 'weekly')),
  shipment_id bigint references shipments(id) on delete cascade,
  week date,
  created_at timestamptz not null default now(),
  next_at timestamptz not null default now(),
  tries smallint not null default 0 check (tries between 0 and 8),
  sent_at timestamptz,
  given_up_at timestamptz,
  last_error text check (length(last_error) <= 300),
  check ((kind = 'weekly') = (week is not null and shipment_id is null)),
  check ((kind <> 'weekly') = (shipment_id is not null))
);
create unique index alerts_once_per_lead on alerts (user_id, kind, shipment_id) where shipment_id is not null;
create unique index alerts_once_a_week on alerts (user_id, week) where week is not null;
create index alerts_due on alerts (next_at) where sent_at is null and given_up_at is null;
