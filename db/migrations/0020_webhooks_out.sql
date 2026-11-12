-- Signed webhooks out (plan step 8): an account's own endpoints hear about its leads (picked up, signed for, held,
-- returned, scored). Each delivery is signed with the endpoint's secret (HMAC-SHA256 over the time and the body, kept
-- sealed with FERNWAY_TOKEN_KEY), kept with what was sent and what came back, and tried again on the leads' own clock.
create table webhook_endpoints (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  url text not null check (length(url) between 10 and 500),
  events text[] not null check (cardinality(events) between 1 and 5
    and events <@ array['lead.picked_up', 'lead.signed', 'lead.held', 'lead.returned', 'lead.scored']),
  secret_sealed text not null,
  made_by text not null check (length(made_by) between 1 and 80),
  created_at timestamptz not null default now()
);
create index webhook_endpoints_account on webhook_endpoints (account_id);

create table webhook_deliveries (
  id bigint generated always as identity primary key,
  endpoint_id bigint not null references webhook_endpoints(id) on delete cascade,
  account_id bigint not null references accounts(id) on delete cascade,
  event text not null check (event in ('lead.picked_up', 'lead.signed', 'lead.held', 'lead.returned', 'lead.scored', 'fernway.test')),
  shipment_id bigint references shipments(id) on delete cascade,
  -- The exact bytes sent every time (text, not jsonb, so key order and spacing never change between tries).
  body text not null,
  state text not null default 'waiting' check (state in ('waiting', 'delivered', 'failed')),
  tries smallint not null default 0,
  next_at timestamptz not null default now(),
  last_status smallint,
  last_answer text,
  last_ms integer,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
-- Each lead's event reaches each endpoint once (tests have no lead).
create unique index webhook_deliveries_once on webhook_deliveries (endpoint_id, shipment_id, event) where shipment_id is not null;
create index webhook_deliveries_due on webhook_deliveries (next_at) where state = 'waiting';
create index webhook_deliveries_account on webhook_deliveries (account_id, created_at desc);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
  'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed',
  'form.made', 'form.changed', 'form.revoked', 'score.on', 'score.off', 'sheet.linked', 'sheet.unlinked', 'sheet.in.on', 'sheet.in.off',
  'hook.made', 'hook.changed', 'hook.removed', 'hook.resent'));
alter table audit_log drop constraint audit_log_target_kind_check;
alter table audit_log add constraint audit_log_target_kind_check check (target_kind in ('lead', 'route', 'member', 'invite', 'key', 'ghl', 'plan', 'form', 'score', 'sheet', 'hook'));
