-- A lead's message (the Contact sales form, or any sender's "message") reaches GHL as a note on the contact: GHL's
-- contact upsert has no field for free text. The note is its own step, between the contact and the opportunity, and
-- its id is kept so a retry never adds the same message twice.
alter table shipments add column ghl_note_id text;
alter table scans drop constraint scans_step_check;
alter table scans add constraint scans_step_check check (step in ('contact', 'note', 'opportunity'));
