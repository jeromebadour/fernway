-- Plans and billing, through Stripe (test mode only). Stripe is the source of truth for a subscription; these columns
-- are Fernway's copy, refreshed from Stripe's own answer on every webhook, so events arriving out of order can't leave
-- an old state behind.
alter table accounts
  add column plan text check (plan in ('starter', 'growth', 'scale')),
  add column stripe_customer_id text unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  add column stripe_subscription_id text unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  add column billing_status text check (billing_status in
    ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  add column period_start timestamptz,
  add column period_end timestamptz,
  add column cancel_at_period_end boolean not null default false,
  -- The lead that moved this account's owner to Customer in Fernway's own GHL (once, on the first paid invoice).
  add column customer_shipment_id bigint references shipments(id);

-- Every Stripe event Fernway has handled, once: a repeat of the same event is answered without doing anything again.
create table stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null check (length(type) between 1 and 100),
  account_id bigint references accounts(id) on delete set null,
  received_at timestamptz not null default now()
);
create index stripe_events_account on stripe_events (account_id, received_at desc);

-- Invoices as Stripe last reported them, so the Billing page lists them without a call to Stripe.
create table stripe_invoices (
  id text primary key check (id ~ '^in_[A-Za-z0-9]+$'),
  account_id bigint not null references accounts(id) on delete cascade,
  number text check (length(number) <= 60),
  status text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  attempted_unpaid boolean not null default false,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  plan text check (plan in ('starter', 'growth', 'scale')),
  period_start timestamptz,
  period_end timestamptz,
  hosted_url text check (hosted_url like 'https://%'),
  pdf_url text check (pdf_url like 'https://%'),
  created_at timestamptz not null
);
create index stripe_invoices_account on stripe_invoices (account_id, created_at desc);

-- A lead that comes from a Stripe payment (the move to Customer) is its own source.
alter table shipments drop constraint shipments_source_check;
alter table shipments add constraint shipments_source_check
  check (source in ('form', 'embed', 'wordpress', 'laravel', 'api', 'import', 'demo', 'stripe'));
