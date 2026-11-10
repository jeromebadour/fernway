-- The rest of the account area: two-step sign-in, preferences, who made an API key. A two-step secret is kept only
-- sealed (AES-256-GCM, key on the box); recovery codes only as SHA-256 hashes, each spent once.
alter table users
  add column totp_sealed text check (totp_sealed like 'v1.%'),
  add column totp_pending_sealed text check (totp_pending_sealed like 'v1.%'),
  add column totp_enabled_at timestamptz,
  -- The last 30-second step a code was accepted for: the same code (or an older one) never works twice.
  add column totp_last_step bigint,
  add column date_style text not null default 'day-month' check (date_style in ('day-month', 'month-day', 'iso')),
  add column clock text not null default '24h' check (clock in ('24h', '12h')),
  add column email_held boolean not null default true,
  add column email_returned boolean not null default true,
  add column email_weekly boolean not null default false,
  add constraint users_totp_on check ((totp_enabled_at is null) = (totp_sealed is null));

create table recovery_codes (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index recovery_codes_user on recovery_codes (user_id);

-- Who made each key in the app (keys made by the box's tool have none).
alter table api_keys add column made_by bigint references users(id) on delete set null;

-- A session can now also be ended from another device, one at a time, and by turning two-step sign-in on.
alter table sessions drop constraint sessions_ended_why_check;
alter table sessions add constraint sessions_ended_why_check check (ended_why in
  ('signed_out', 'signed_out_elsewhere', 'signed_out_from_device', 'password_changed', 'two_step_changed', 'expired', 'account_deleted'));

-- The lead that moved an account to Customer may go (with the account, or by hand) without blocking anything.
alter table accounts drop constraint accounts_customer_shipment_id_fkey;
alter table accounts add constraint accounts_customer_shipment_id_fkey foreign key (customer_shipment_id) references shipments(id) on delete set null;
