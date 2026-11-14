-- Stripe payments in (Growth and up): an account links its own Stripe account by pasting the signing secret of a
-- Stripe webhook that points at its own Fernway address. Each paid checkout then becomes a lead on the route it picks.
-- One link per account. The secret is kept sealed with FERNWAY_TOKEN_KEY; the address's token is public by design
-- (it only names the link, the signature is what is checked).
create table stripe_links (
  account_id bigint primary key references accounts(id) on delete cascade,
  token text not null unique check (token ~ '^stin_[A-Za-z0-9_-]{24}$'),
  secret_sealed text not null,
  route_key text not null check (length(route_key) between 1 and 40),
  made_by text not null check (length(made_by) between 1 and 80),
  created_at timestamptz not null default now(),
  -- The last call Stripe made, as the console shows it: when, and what Fernway did with it.
  last_at timestamptz,
  last_result text check (length(last_result) <= 300)
);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
  'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed',
  'form.made', 'form.changed', 'form.revoked', 'score.on', 'score.off', 'sheet.linked', 'sheet.unlinked', 'sheet.in.on', 'sheet.in.off',
  'hook.made', 'hook.changed', 'hook.removed', 'hook.resent', 'stripe.linked', 'stripe.changed', 'stripe.unlinked'));
alter table audit_log drop constraint audit_log_target_kind_check;
alter table audit_log add constraint audit_log_target_kind_check check (target_kind in ('lead', 'route', 'member', 'invite', 'key', 'ghl', 'plan', 'form', 'score', 'sheet', 'hook', 'stripe'));
