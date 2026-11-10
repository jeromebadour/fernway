-- Booking a demo: a route can name a GHL calendar, and a lead sent on it carries the time the visitor picked. The
-- appointment is its own step (after the contact and its note, before the opportunity), its id kept so a retry never
-- books twice.
alter table routes add column calendar_id text;
alter table shipments add column booking_start timestamptz;
alter table shipments add column ghl_appointment_id text;
alter table scans drop constraint scans_step_check;
alter table scans add constraint scans_step_check check (step in ('contact', 'note', 'appointment', 'opportunity'));
