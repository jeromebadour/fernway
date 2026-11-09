-- The delivery engine: every lead is a shipment with a waybill number, and every step it takes is a scan.
-- Accounts and routes are the smallest version the engine needs; sign-up, plans and the GHL connection extend them.

create table accounts (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

-- Where a kind of lead goes in GHL: which pipeline and stage, with which tags. Settings draws these as routes.
create table routes (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{1,40}$'),
  label text not null check (length(label) between 1 and 80),
  pipeline_id text,
  stage_id text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (account_id, key),
  check ((pipeline_id is null) = (stage_id is null))
);

-- Waybill numbers: "FW 24 00817" is year 24, number 817. One sequence; it stops at 99999 rather than wrap.
create sequence waybill_seq minvalue 1 maxvalue 99999 no cycle;

create table shipments (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts (id) on delete cascade,
  route_id bigint not null references routes (id),
  waybill_year smallint not null check (waybill_year between 0 and 99),
  waybill_seq integer not null check (waybill_seq between 1 and 99999),
  -- The same lead sent twice (a double click, a retried form post) is one shipment, never two.
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  source text not null check (source in ('form', 'embed', 'wordpress', 'laravel', 'api', 'import', 'demo')),
  contact jsonb not null,
  state text not null check (state in ('picked_up', 'in_transit', 'waiting', 'signed', 'held', 'returned')),
  tries smallint not null default 0 check (tries between 0 and 8),
  next_try_at timestamptz,
  ghl_contact_id text,
  ghl_opportunity_id text,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waybill_year, waybill_seq),
  unique (account_id, idempotency_key),
  check ((state = 'held') = (hold_reason is not null))
);

create index shipments_due on shipments (next_try_at) where state in ('picked_up', 'waiting', 'in_transit');
create index shipments_account_recent on shipments (account_id, created_at desc);

-- Every step a shipment takes, with what was sent and what GHL answered. Only ever added to, never changed.
create table scans (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references shipments (id) on delete cascade,
  kind text not null check (kind in ('picked_up', 'checked', 'handed', 'signed', 'retry_scheduled', 'held', 'returned', 'resent')),
  at timestamptz not null default now(),
  try smallint check (try between 1 and 8),
  step text check (step in ('contact', 'opportunity')),
  sent jsonb,
  answer_status smallint,
  answer_excerpt text check (length(answer_excerpt) <= 500),
  note text check (length(note) <= 300)
);

create index scans_by_shipment on scans (shipment_id, id);

-- The receipt can't be rewritten: the app may add scans but never change or remove them.
revoke update, delete on scans from fernway_app;
