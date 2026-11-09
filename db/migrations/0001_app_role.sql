-- The app's own role. It reads and writes rows; it never owns or changes tables (only the owner does, through
-- migrations). Its password is set by db/migrate.sh from the environment.
do $$
begin
  if not exists (select from pg_roles where rolname = 'fernway_app') then
    create role fernway_app login;
  end if;
  execute format('grant connect on database %I to fernway_app', current_database());
end
$$;

revoke create on schema public from public;
grant usage on schema public to fernway_app;
alter default privileges in schema public grant select, insert, update, delete on tables to fernway_app;
alter default privileges in schema public grant usage, select on sequences to fernway_app;
