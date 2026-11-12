-- Google Sheets (plan step 8): an account links one Google Sheet (shared with Fernway's service account), and every
-- lead picked up after that becomes a row on the tab "Fernway leads", rewritten whenever what it shows changes.
create table sheet_links (
  account_id bigint primary key references accounts(id) on delete cascade,
  spreadsheet_id text not null check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,100}$'),
  title text not null check (length(title) between 1 and 200),
  made_by text not null check (length(made_by) between 1 and 80),
  since timestamptz not null default now(),
  last_ok_at timestamptz,
  last_error text
);

-- Each lead's row: where it is (found again by its waybill before a rewrite), what it last showed, and its retries.
create table sheet_rows (
  shipment_id bigint primary key references shipments(id) on delete cascade,
  account_id bigint not null references accounts(id) on delete cascade,
  row_number integer check (row_number > 1),
  printed text,
  written_at timestamptz,
  tries smallint not null default 0,
  next_at timestamptz not null default now(),
  last_error text,
  given_up_at timestamptz
);
create index sheet_rows_account on sheet_rows (account_id, next_at);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
  'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed',
  'form.made', 'form.changed', 'form.revoked', 'score.on', 'score.off', 'sheet.linked', 'sheet.unlinked'));
alter table audit_log drop constraint audit_log_target_kind_check;
alter table audit_log add constraint audit_log_target_kind_check check (target_kind in ('lead', 'route', 'member', 'invite', 'key', 'ghl', 'plan', 'form', 'score', 'sheet'));
