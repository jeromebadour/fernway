-- What GHL tells Fernway by itself (its signed webhooks): a stage moved by sales, a deal won or lost, a meeting moved
-- or cancelled, a contact or deal deleted, the app uninstalled. Each event is kept once (GHL may send one twice), with
-- a short summary in Fernway's words, never the whole payload (it carries the contact's details). Kept 30 days.
create table ghl_events (
  id bigint generated always as identity primary key,
  webhook_id text not null unique check (length(webhook_id) between 1 and 120),
  type text not null check (length(type) between 1 and 60),
  location_id text check (length(location_id) <= 80),
  account_id bigint references accounts(id) on delete set null,
  -- How many of the account's leads it touched, and what Fernway made of it.
  leads integer not null default 0,
  summary text not null default '' check (length(summary) <= 300),
  received_at timestamptz not null default now()
);
create index ghl_events_account on ghl_events (account_id, received_at desc);
create index ghl_events_latest on ghl_events (received_at desc);

-- A lead's waybill also shows what happened to it in GHL afterwards.
alter table scans drop constraint scans_kind_check;
alter table scans add constraint scans_kind_check check (kind in (
  'picked_up', 'checked', 'handed', 'signed', 'retry_scheduled', 'held', 'returned', 'resent', 'ghl_moved', 'ghl_changed', 'ghl_deleted'));

-- GHL itself (an uninstall) can disconnect an account; the audit line is written as "GHL".
