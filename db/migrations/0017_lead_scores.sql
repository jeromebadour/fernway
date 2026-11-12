-- Claude score (plan step 8): a short read of each new lead by Claude, a score from 1 to 5 with its reasons, shown in
-- the console and written back to the lead's GHL contact as a note and a tag (fernway-score-<n>), so a GHL workflow
-- can act on it. Off until an owner or admin turns it on; only leads picked up after that are scored. What Fernway
-- spends on Claude is kept per month and stops at a cap.
alter table accounts add column score_since timestamptz;

create table lead_scores (
  shipment_id bigint primary key references shipments(id) on delete cascade,
  account_id bigint not null references accounts(id) on delete cascade,
  state text not null default 'waiting' check (state in ('waiting', 'scored', 'skipped', 'failed')),
  score smallint check (score between 1 and 5),
  summary text check (length(summary) <= 300),
  signals text[] not null default '{}' check (cardinality(signals) <= 3),
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  tries smallint not null default 0,
  next_at timestamptz not null default now(),
  last_error text,
  scored_at timestamptz,
  -- The note and tag on the GHL contact, once the lead is signed for.
  ghl_state text not null default 'waiting' check (ghl_state in ('waiting', 'written', 'skipped', 'failed')),
  ghl_note_id text,
  ghl_tries smallint not null default 0,
  ghl_next_at timestamptz not null default now(),
  ghl_error text,
  ghl_written_at timestamptz,
  created_at timestamptz not null default now()
);
create index lead_scores_due on lead_scores (next_at) where state = 'waiting';
create index lead_scores_ghl_due on lead_scores (ghl_next_at) where state = 'scored' and ghl_state = 'waiting';
create index lead_scores_account on lead_scores (account_id, created_at);

-- Every call to Claude, priced, per calendar month (UTC): the cap is checked against it before each call.
create table claude_spend (
  month date primary key,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  spent_usd numeric(12, 6) not null default 0
);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
  'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed',
  'form.made', 'form.changed', 'form.revoked', 'score.on', 'score.off'));
alter table audit_log drop constraint audit_log_target_kind_check;
alter table audit_log add constraint audit_log_target_kind_check check (target_kind in ('lead', 'route', 'member', 'invite', 'key', 'ghl', 'plan', 'form', 'score'));
