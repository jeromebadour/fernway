-- Fernway inside GHL's workflows (step 7, part 3).
--
-- A trigger: when someone puts "Fernway lead" as a workflow's trigger, GHL tells Fernway (created, changed, deleted)
-- and gives the address to call when it should fire. Fernway keeps one row per such workflow trigger and, when one of
-- the account's leads is held, returned or signed for, sends it there once.
create table workflow_triggers (
  id text primary key check (length(id) between 1 and 120),
  account_id bigint not null references accounts(id) on delete cascade,
  location_id text not null check (length(location_id) between 1 and 80),
  workflow_id text not null check (length(workflow_id) between 1 and 120),
  -- Which of held, returned, signed the workflow wants; all three when it chose none.
  events text[] not null check (events <@ array['held', 'returned', 'signed'] and cardinality(events) between 1 and 3),
  target_url text not null check (target_url like 'https://%' or target_url like 'http://%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflow_triggers_account on workflow_triggers (account_id);

-- Each lead sent to each trigger, once per kind of arrival, with retries like the alert emails.
create table trigger_sends (
  id bigint generated always as identity primary key,
  trigger_id text not null references workflow_triggers(id) on delete cascade,
  shipment_id bigint not null references shipments(id) on delete cascade,
  event text not null check (event in ('held', 'returned', 'signed')),
  tries smallint not null default 0,
  next_at timestamptz not null default now(),
  sent_at timestamptz,
  given_up_at timestamptz,
  last_status smallint,
  created_at timestamptz not null default now(),
  unique (trigger_id, shipment_id, event)
);
create index trigger_sends_due on trigger_sends (next_at) where sent_at is null and given_up_at is null;

-- A lead can come from a GHL workflow ("Track with Fernway"); it remembers which, so that workflow's own trigger is
-- never fired by the lead it made (no loop).
alter table shipments drop constraint shipments_source_check;
alter table shipments add constraint shipments_source_check
  check (source in ('form', 'embed', 'wordpress', 'laravel', 'api', 'import', 'demo', 'stripe', 'workflow'));
alter table shipments add column via_workflow text check (length(via_workflow) <= 120);

