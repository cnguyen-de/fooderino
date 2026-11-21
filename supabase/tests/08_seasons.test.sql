\o /dev/null

select test.user('s-ann') as ann, test.user('s-ben') as ben \gset
select test.household(:'ann', 'Season Ann') as ha \gset
select test.household(:'ben', 'Season Ben') as hb \gset
select test.item(:'ann', :'ha', 'Grünkohl', 0, 1) as kale \gset
select test.item(:'ann', :'ha', 'Wildgulasch') as game \gset
select test.item(:'ann', :'ha', 'Salt', 1) as salt \gset

select test.eq((select season from public.items_v2 where id = :'kale'), null::jsonb,
               'a created item has no season until a sheet sets one');

begin;
select test.act_as(:'ann');
insert into public.items_v2 (id, household_id, name, season, updated_at)
values (:'kale', :'ha', 'Grünkohl', '{"from": 11, "to": 2}', now() + interval '1 second')
on conflict (id) do update set season = excluded.season, updated_at = excluded.updated_at;
update public.items_v2 set season = '{"from": 10, "to": 12}', updated_at = now() + interval '1 second' where id = :'game';
select test.throws(format('update public.items_v2 set season = %L where id = %L', s, :'salt'), '23514', 'season ' || s || ' is refused')
  from unnest(array['{"from": 0, "to": 2}', '{"from": 1, "to": 13}', '{"from": 1.5, "to": 3}', '{"from": "1", "to": 3}',
                    '{"from": 1}', '{"from": 1, "to": 3, "note": "x"}', '[1, 3]', '"summer"']) s;
commit;
select test.eq((select season from public.items_v2 where id = :'kale'), '{"from": 11, "to": 2}'::jsonb,
               'a member''s items sheet upsert sets a season that runs past December');
select test.eq((select season from public.items_v2 where id = :'game'), '{"from": 10, "to": 12}'::jsonb,
               'a member sets a season by hand on an item the calendar does not know');

select seq as seq_before from public.items_v2 where id = :'kale' \gset
begin;
select test.act_as(:'ann');
update public.items_v2 set season = null, updated_at = now() - interval '1 day' where id = :'kale';
commit;
select test.eq((select season from public.items_v2 where id = :'kale'), '{"from": 11, "to": 2}'::jsonb,
               'stamp_lww drops an older sheet''s season');
begin;
select test.act_as(:'ann');
update public.items_v2 set season = null, updated_at = now() + interval '1 minute' where id = :'kale';
commit;
select test.eq((select season is null and seq > :'seq_before'::bigint from public.items_v2 where id = :'kale'), true,
               'a newer sheet clears the season and takes a new seq');
update public.items_v2 set season = '{"from": 11, "to": 2}' where id = :'kale';

-- Ben's household holds Wildgulasch already, with its own season, and no kale.
select test.item(:'ben', :'hb', 'wildgulasch') as ben_game \gset
update public.items_v2 set season = '{"from": 9, "to": 1}' where id = :'ben_game';
select test.share(:'hb', :'ben', 's-ben-token');
select public.move_household(test.id('s-ann-joins-ben'), :'ann', 'join', '{"token": "s-ben-token", "bring": true}') as joined \gset
select test.eq(:'joined'::jsonb ->> 'merged', '1', 'join with bring merges the shared item');
select test.eq((select season from public.items_v2 where id = :'ben_game'), '{"from": 9, "to": 1}'::jsonb,
               'a merge keeps the target''s season');
select test.eq((select season from public.items_v2
                 where id = private.uuid_for('move:' || test.id('s-ann-joins-ben') || ':' || :'kale')),
               '{"from": 11, "to": 2}'::jsonb, 'an item copied to another household keeps its season');

\i /repo/supabase/seasons.sql
select test.eq((select season from public.items_v2 where id = :'game'), '{"from": 10, "to": 12}'::jsonb,
               'seasons.sql runs again without touching stored seasons');
