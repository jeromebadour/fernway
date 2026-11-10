-- Keys for Fernway's own API (POST /api/v1/leads). Only a hash of the secret is kept: a key is shown once, when it is
-- made, and can't be read back. The prefix is kept so a key can be named in lists without being usable.
create table api_keys (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts(id) on delete cascade,
  prefix text not null unique check (prefix ~ '^[a-z0-9]{8}$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_account on api_keys (account_id);
