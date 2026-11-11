-- The customer console: an audit log of what people did in an account (each line tied to the lead, route or person
-- it touched), and invitations to join an account's team.
create table audit_log (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts(id) on delete cascade,
  user_id bigint references users(id) on delete set null,
  -- Kept as written at the time, so the line still reads right after the person leaves.
  who text not null check (length(who) between 1 and 80),
  action text not null check (action in (
    'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
    'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed')),
  target_kind text check (target_kind in ('lead', 'route', 'member', 'invite', 'key', 'ghl', 'plan')),
  target_id text check (length(target_id) <= 80),
  detail text not null default '' check (length(detail) <= 300),
  at timestamptz not null default now()
);
create index audit_log_account on audit_log (account_id, at desc);

create table invites (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz
);
create unique index invites_open_once on invites (account_id, email) where used_at is null and cancelled_at is null;
