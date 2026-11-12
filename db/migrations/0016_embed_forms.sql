-- Embed forms (plan step 8): a Fernway form that drops into any GHL funnel or outside website with one line of code.
-- Each form has a public key (it sits in the page's code, so it is not a secret), sends to one of the account's routes,
-- asks for the fields its owner chose, and may be shown only on the sites its owner listed.
create table embed_forms (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts(id) on delete cascade,
  key text not null unique check (key ~ '^fwf_[a-z2-7]{20}$'),
  label text not null check (length(label) between 1 and 80),
  route_key text not null check (length(route_key) between 1 and 40),
  fields text[] not null check (fields <@ array['firstName', 'lastName', 'email', 'phone', 'companyName', 'message']
    and 'email' = any (fields) and cardinality(fields) between 1 and 6),
  theme text not null default 'light' check (theme in ('light', 'dark', 'auto')),
  button text not null default 'Send' check (length(button) between 1 and 30),
  -- The sites allowed to show it (host names, "*.example.com" for every subdomain); none means any site.
  sites text[] not null default '{}' check (cardinality(sites) <= 10),
  made_by text not null check (length(made_by) between 1 and 80),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index embed_forms_account on embed_forms (account_id);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
  'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed',
  'form.made', 'form.changed', 'form.revoked'));
alter table audit_log drop constraint audit_log_target_kind_check;
alter table audit_log add constraint audit_log_target_kind_check check (target_kind in ('lead', 'route', 'member', 'invite', 'key', 'ghl', 'plan', 'form'));
