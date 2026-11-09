-- One GHL sub-account per Fernway account, connected through GHL's OAuth (the Marketplace app). Tokens are stored
-- encrypted (AES-256-GCM, key in the box's env file, never in the database). GHL's refresh tokens work once: each
-- refresh returns a new one, saved in the same transaction, under a row lock so two workers never spend the same one.
create table ghl_connections (
  account_id bigint primary key references accounts (id) on delete cascade,
  location_id text not null,
  company_id text,
  user_id text,
  scopes text not null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  last_error text check (length(last_error) <= 300),
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'needs_reconnect') = (last_error is not null))
);

-- A location belongs to one Fernway account at a time.
create unique index ghl_connections_location on ghl_connections (location_id);
