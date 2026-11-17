-- Run ONLY after the app has run on the v2 tables for at least two weeks and
-- supabase/verify-v2.sql still reports clean. Until then the legacy tables
-- are the rollback path.
--
-- public.users and public.settings are not dropped here. The app no longer
-- reads them, but confirm no auth trigger writes to public.users first.
drop function if exists private.legacy_census();
drop function if exists private.legacy_household(public.lists);
drop table if exists public.invites;
drop table if exists public.items;
drop table if exists public.logs;
drop table if exists public.recipes;
drop table if exists public.lists;
