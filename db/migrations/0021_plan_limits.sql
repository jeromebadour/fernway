-- Plan limits (step 11): an API key is either for the account's own code (the API, on Scale) or for Fernway for
-- WordPress (every plan). A WordPress key's leads are always marked as from WordPress, whatever the call says, so the
-- plan line can't be crossed by claiming a source. Keys made before this, for a WordPress site, are labelled so by
-- integrations/wordpress/box/connect.sh ("... WordPress").
alter table api_keys add column kind text not null default 'api' check (kind in ('api', 'wordpress'));
update api_keys set kind = 'wordpress' where label ilike '%wordpress%';
