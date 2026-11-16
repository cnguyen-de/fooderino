-- Run ONLY after the app has run on the v2 tables for at least two weeks and
-- supabase/verify-v2.sql still reports clean. Until then the legacy tables
-- are the rollback path.
--
-- public.users stays: it still holds the server-owned `ai` / `free_ai_calls`
-- quota written by /api/recipe.
drop table if exists public.invites;
drop table if exists public.items;
drop table if exists public.logs;
drop table if exists public.recipes;
drop table if exists public.lists;
