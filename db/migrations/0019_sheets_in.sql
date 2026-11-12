-- Google Sheets in (plan step 8): the linked sheet's tab "Leads in" is read every minute; each new row with an email or
-- a phone becomes a lead on the route the owner picked (none: off), and Fernway writes the waybill, state and a note
-- back into that row. A row is one lead: the same row read again gives the same waybill (its idempotency key).
alter table sheet_links add column in_route text check (in_route is null or in_route ~ '^[a-z0-9-]{1,40}$');
alter table sheet_links add column in_read_at timestamptz;
alter table sheet_links add column in_error text;

alter table shipments drop constraint shipments_source_check;
alter table shipments add constraint shipments_source_check
  check (source in ('form', 'embed', 'wordpress', 'laravel', 'api', 'import', 'demo', 'stripe', 'workflow', 'sheet'));

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'lead.resent', 'leads.resent', 'route.made', 'route.changed', 'ghl.connected', 'ghl.disconnected',
  'member.invited', 'member.joined', 'member.role', 'member.removed', 'invite.cancelled', 'key.made', 'key.revoked', 'plan.changed',
  'form.made', 'form.changed', 'form.revoked', 'score.on', 'score.off', 'sheet.linked', 'sheet.unlinked', 'sheet.in.on', 'sheet.in.off'));
