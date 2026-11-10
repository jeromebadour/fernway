-- People and their sign-ins. A person belongs to an account (the business) through a membership with a role; the
-- account's owner signs up with it. Passwords are kept only as scrypt hashes; sessions and email links only as SHA-256
-- hashes of their secret, so a copy of the database opens no account and no link.
alter table accounts add column trial_ends_at timestamptz;

create table users (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  name text not null check (length(name) between 1 and 80),
  password_hash text not null check (password_hash like 'scrypt$%'),
  email_confirmed_at timestamptz,
  time_zone text not null default 'UTC' check (length(time_zone) between 1 and 64),
  created_at timestamptz not null default now(),
  password_changed_at timestamptz not null default now()
);

create table memberships (
  user_id bigint not null references users(id) on delete cascade,
  account_id bigint not null references accounts(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, account_id)
);
create index memberships_account on memberships (account_id);

create table sessions (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  device text not null default '' check (length(device) <= 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_why text check (ended_why in ('signed_out', 'signed_out_elsewhere', 'password_changed', 'expired', 'account_deleted'))
);
create index sessions_user on sessions (user_id);

-- One-time links sent by email: confirm an address, reset a password.
create table email_links (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('confirm', 'reset')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index email_links_user on email_links (user_id, purpose);
