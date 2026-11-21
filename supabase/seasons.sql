-- Item seasons. Apply after cook.sql; safe to run again.
--
-- A season is LWW metadata like shelf_life_days, written by the client's items
-- sheet. The create command does not carry it: the client pushes a sheet with
-- the season right after the create lands. Merging keeps the target's season,
-- as absorb_item keeps its shelf_life_days; copying an item to another
-- household carries it.
begin;

-- Null, or exactly {"from", "to"} with whole months 1-12. from > to runs past December.
create or replace function private.season_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return true; end if;
  if jsonb_typeof(p) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['from', 'to'] then
    return false;
  end if;
  if jsonb_typeof(p -> 'from') <> 'number' or jsonb_typeof(p -> 'to') <> 'number' then return false; end if;
  return (p ->> 'from')::numeric in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
     and (p ->> 'to')::numeric in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
end;
$$;

-- items_v2's CHECK calls this as the writing role.
grant execute on function private.season_valid(jsonb) to authenticated;

alter table public.items_v2 add column if not exists season jsonb check (private.season_valid(season));

grant insert (season), update (season) on public.items_v2 to authenticated;

create or replace function private.bring_items(p_source uuid, p_target uuid, p_salt text, p_mover uuid)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_plan   jsonb;
  v_step   jsonb;
  v_src    public.items_v2;
  v_match  uuid;
  v_map    jsonb := '{}';
  v_bag    public.bag_entries;
  v_event  uuid;
  v_merged integer := 0;
  v_copied integer := 0;
  v_bags   integer := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object('src', s.id, 'matches', (
           select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'unit', t.unit)), '[]')
             from public.items_v2 t
            where t.household_id = p_target and t.deleted_at is null and t.merged_into is null
              and private.item_names(t.name, t.aliases) && private.item_names(s.name, s.aliases)))
         order by s.id), '[]')
    into v_plan
    from public.items_v2 s
   where s.household_id = p_source and s.deleted_at is null and s.merged_into is null;

  for v_step in select value from jsonb_array_elements(v_plan) loop
    select * into v_src from public.items_v2 where id = (v_step ->> 'src')::uuid;
    if jsonb_array_length(v_step -> 'matches') = 1 and v_step #>> '{matches,0,unit}' = v_src.unit then
      v_match := (v_step #>> '{matches,0,id}')::uuid;
      perform private.absorb_item(v_match, v_src);
      v_merged := v_merged + 1;
    else
      v_match := private.uuid_for('move:' || p_salt || ':' || v_src.id);
      insert into public.items_v2 (id, household_id, name, aliases, tags, unit, default_amount,
                                shelf_life_days, season, amount, to_buy, best_before, updated_at)
      values (v_match, p_target, v_src.name, v_src.aliases, v_src.tags, v_src.unit,
              v_src.default_amount, v_src.shelf_life_days, v_src.season, v_src.amount, v_src.to_buy,
              v_src.best_before, v_src.updated_at);
      v_copied := v_copied + 1;
    end if;
    v_map := v_map || jsonb_build_object(v_src.id::text, v_match);
  end loop;

  for v_bag in
    select b.* from public.bag_entries b
      join public.command_log l on l.command_id = b.opened_by
     where b.household_id = p_source and b.state = 'open' and l.actor = p_mover
       and v_map ? private.resolve_id(b.item_id)::text
     order by b.id
  loop
    v_match := (v_map ->> private.resolve_id(v_bag.item_id)::text)::uuid;
    v_event := private.uuid_for('move-event:' || p_salt || ':' || v_bag.purchase_event);
    insert into public.item_events (id, household_id, item_id, kind, qty, occurred_at, actor, origin)
    values (v_event, p_target, v_match, 'purchase', v_bag.qty, v_bag.bought_at, p_mover, 'import');
    insert into public.bag_entries (id, household_id, item_id, qty, from_list, state, bought_at,
                                    purchase_event)
    values (private.uuid_for('move-bag:' || p_salt || ':' || v_bag.id), p_target, v_match,
            v_bag.qty, v_bag.from_list, 'open', v_bag.bought_at, v_event);
    v_bags := v_bags + 1;
  end loop;

  return jsonb_build_object('merged', v_merged, 'copied', v_copied, 'bag', v_bags);
end;
$$;

commit;
