-- Private transactional entry points. All actor IDs come from Auth, never from API input.
create function public.plan_document(p_plan_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('id',p.id,'revision',p.revision,'weekStart',p.week_start,
    'groceryState',p.grocery_state,'slots',coalesce((select jsonb_agg(to_jsonb(s) order by s.day,s.meal)
      from public.plan_slots s where s.plan_id=p.id),'[]'::jsonb),
    'groceries',jsonb_build_object('id',g.id,'revision',g.revision,'state',g.state,
      'recoveryCode',g.recovery_code,'items',case when p.grocery_state='needs_review' then '[]'::jsonb
        else coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.grocery_items i
          where i.list_id=g.id and not i.deleted),'[]'::jsonb) end),
    'recovery',case when p.grocery_state='needs_review' then
      jsonb_build_object('action','repair_groceries','message','Your plan is saved. Review or retry groceries before shopping.') else null end)
  from public.plans p left join public.grocery_lists g on g.plan_id=p.id
  where p.id=p_plan_id and p.user_id=auth.uid();
$$;
revoke all on function public.plan_document(uuid) from public, anon;
grant execute on function public.plan_document(uuid) to authenticated;

create function public.apply_foundation_mutation(p_key text, p_action text, p_target uuid,
  p_revision bigint, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); receipt public.mutations; current_plan public.plans;
  grocery public.grocery_lists; plan_revision bigint; document jsonb; input jsonb;
  item jsonb; slot jsonb; projection jsonb; before_document jsonb; after_document jsonb; recovery text := null;
  result jsonb; edited_item public.grocery_items;
begin
  if actor is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_key is null or length(p_key) not between 8 and 128 or p_action is null or p_target is null
    or p_revision is null or p_revision < 0 or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Invalid mutation' using errcode='22023';
  end if;
  input := jsonb_build_object('action',p_action,'target',p_target,'revision',p_revision,'payload',p_payload);
  -- Serialize identical keys before checking receipts; different requests cannot steal a key.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_key,0));
  select * into receipt from public.mutations where user_id=actor and operation_key=p_key;
  if found then
    if receipt.request <> input then raise exception 'Idempotency conflict' using errcode='P0002'; end if;
    return receipt.result;
  end if;

  if p_action='preferences.update' then
    select to_jsonb(p) into before_document from public.preferences p where user_id=actor;
    update public.preferences set preferences=p_payload, revision=revision+1
      where user_id=actor and user_id=p_target and revision=p_revision
      returning jsonb_build_object('preferences',preferences,'revision',revision) into result;
    if not found then raise exception 'Revision conflict' using errcode='40001'; end if;
  elsif p_action in ('saved.add','saved.remove') then
    -- Per-user/recipe lock also serializes distinct operation keys for the same save.
    perform pg_advisory_xact_lock(hashtextextended(actor::text || ':saved:' || p_target::text,0));
    select to_jsonb(s) into before_document from public.saved_recipes s where user_id=actor and recipe_id=p_target;
    if p_action='saved.add' then
      if not exists(select 1 from public.recipes where id=p_target and (owner_id is null or owner_id=actor)) then
        raise exception 'Not found' using errcode='P0001';
      end if;
      insert into public.saved_recipes(user_id,recipe_id) values(actor,p_target)
        on conflict(user_id,recipe_id) do nothing;
    else
      delete from public.saved_recipes where user_id=actor and recipe_id=p_target;
    end if;
    result := jsonb_build_object('saved',p_action='saved.add','recipeId',p_target);
  elsif p_action='grocery.edit' then
    select * into grocery from public.grocery_lists where id=(p_payload->>'listId')::uuid and user_id=actor for update;
    if not found then raise exception 'Not found' using errcode='P0001'; end if;
    select * into edited_item from public.grocery_items where id=p_target and user_id=actor and list_id=grocery.id for update;
    before_document := case when edited_item.id is null then null else to_jsonb(edited_item) end;
    if not found then
      if p_revision<>0 or exists(select 1 from public.grocery_items where id=p_target) then
        raise exception 'Revision conflict' using errcode='40001';
      end if;
      insert into public.grocery_items(id,user_id,list_id,name,raw_text,quantity,unit,origin,checked,deleted)
        values(p_target,actor,grocery.id,p_payload->>'name',p_payload->>'rawText',(p_payload->>'quantity')::numeric,
          p_payload->>'unit','manual',coalesce((p_payload->>'checked')::boolean,false),coalesce((p_payload->>'deleted')::boolean,false))
        returning * into edited_item;
    else
      if edited_item.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
      update public.grocery_items set name=p_payload->>'name',raw_text=p_payload->>'rawText',
        quantity=(p_payload->>'quantity')::numeric,unit=p_payload->>'unit',checked=(p_payload->>'checked')::boolean,
        deleted=(p_payload->>'deleted')::boolean,overridden=overridden or
          (origin='derived' and (quantity is distinct from (p_payload->>'quantity')::numeric
            or unit is distinct from p_payload->>'unit' or name is distinct from p_payload->>'name'
            or raw_text is distinct from p_payload->>'rawText')),
        revision=revision+1 where id=p_target returning * into edited_item;
    end if;
    update public.grocery_lists set revision=revision+1 where id=grocery.id returning * into grocery;
    result := jsonb_build_object('item',to_jsonb(edited_item),'listRevision',grocery.revision,'state',grocery.state);
  elsif p_action in ('plan.commit','plan.repair') then
    perform pg_advisory_xact_lock(hashtextextended(actor::text || ':plan:' || p_target::text,0));
    select * into current_plan from public.plans where id=p_target and user_id=actor for update;
    if not found then
      if p_revision<>0 or p_action='plan.repair' or exists(select 1 from public.plans where id=p_target) then
        raise exception 'Revision conflict' using errcode='40001';
      end if;
      insert into public.plans(id,user_id,week_start) values(p_target,actor,(p_payload->>'weekStart')::date)
        returning * into current_plan;
      before_document := null;
    else
      if current_plan.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
      before_document := public.plan_document(p_target) || jsonb_build_object('pendingGroceries',current_plan.pending_groceries,
        'storedItems',coalesce((select jsonb_agg(to_jsonb(i)) from public.grocery_items i
          join public.grocery_lists l on l.id=i.list_id where l.plan_id=p_target and i.user_id=actor),'[]'::jsonb));
    end if;
    if p_action='plan.commit' then
      if jsonb_typeof(p_payload->'slots') is distinct from 'array'
        or jsonb_typeof(p_payload->'groceries') is distinct from 'array'
        or jsonb_array_length(p_payload->'slots')>42 or jsonb_array_length(p_payload->'groceries')>500 then
        raise exception 'Invalid plan' using errcode='22023';
      end if;
      -- Do not remove a locked slot or change its content through replacement.
      if exists(select 1 from public.plan_slots s where s.plan_id=p_target and s.locked
        and not exists(select 1 from jsonb_array_elements(p_payload->'slots') j where
          (j->>'id')::uuid=s.id and (j->>'day')::date=s.day and j->>'meal'=s.meal
          and j->>'kind'=s.kind and (j->>'recipeVersionId')::uuid is not distinct from s.recipe_version_id
          and (j->>'preparedSlotId')::uuid is not distinct from s.prepared_slot_id
          and (j->>'servings')::numeric is not distinct from s.servings and (j->>'locked')::boolean)) then
        raise exception 'Locked slot conflict' using errcode='40001';
      end if;
      for slot in select value from jsonb_array_elements(p_payload->'slots') loop
        if exists(select 1 from public.plan_slots where id=(slot->>'id')::uuid and (user_id<>actor or plan_id<>p_target)) then
          raise exception 'Slot not found' using errcode='P0001';
        end if;
        if (slot->>'day')::date not between (p_payload->>'weekStart')::date and (p_payload->>'weekStart')::date+6 then
          raise exception 'Slot outside week' using errcode='22023';
        end if;
        insert into public.plan_slots(id,user_id,plan_id,day,meal,kind,recipe_version_id,prepared_slot_id,servings,locked)
          values((slot->>'id')::uuid,actor,p_target,(slot->>'day')::date,slot->>'meal',slot->>'kind',
            (slot->>'recipeVersionId')::uuid,(slot->>'preparedSlotId')::uuid,(slot->>'servings')::numeric,
            coalesce((slot->>'locked')::boolean,false))
          on conflict(id) do update set day=excluded.day,meal=excluded.meal,kind=excluded.kind,
            recipe_version_id=excluded.recipe_version_id,prepared_slot_id=excluded.prepared_slot_id,
            servings=excluded.servings,locked=excluded.locked,revision=public.plan_slots.revision+1;
      end loop;
      delete from public.plan_slots s where plan_id=p_target and user_id=actor and not exists(
        select 1 from jsonb_array_elements(p_payload->'slots') j where (j->>'id')::uuid=s.id);
      if exists(select 1 from public.plan_slots l left join public.plan_slots c on c.id=l.prepared_slot_id
        and c.plan_id=l.plan_id where l.plan_id=p_target and l.kind='leftover'
          and (c.id is null or c.kind<>'cook' or c.day>l.day)) then
        raise exception 'Invalid leftover source' using errcode='22023';
      end if;
      projection := p_payload->'groceries';
    else
      if current_plan.grocery_state<>'needs_review' then raise exception 'No repair required' using errcode='22023'; end if;
      projection := current_plan.pending_groceries;
    end if;
    -- Grocery failure rolls back only this block. The new plan/pending projection survives.
    begin
      select * into grocery from public.grocery_lists where plan_id=p_target and user_id=actor for update;
      if coalesce(grocery.revision,0) <> (p_payload->>'groceryRevision')::bigint
        or p_payload->>'groceryRevision' is null then raise exception 'Grocery revision conflict' using errcode='40001'; end if;
      if grocery.id is null then
        insert into public.grocery_lists(user_id,plan_id) values(actor,p_target) returning * into grocery;
      end if;
      for item in select value from jsonb_array_elements(projection) loop
        insert into public.grocery_items(user_id,list_id,name,raw_text,quantity,unit,origin,origin_key,origins)
          values(actor,grocery.id,item->>'name',item->>'rawText',(item->>'quantity')::numeric,
            item->>'unit','derived',item->>'originKey',coalesce(item->'origins','[]'::jsonb))
        on conflict(list_id,origin_key) do update set
          name=excluded.name,raw_text=excluded.raw_text,quantity=excluded.quantity,unit=excluded.unit,origins=excluded.origins,
          checked=case when public.grocery_items.quantity is distinct from excluded.quantity
            or public.grocery_items.unit is distinct from excluded.unit then false else public.grocery_items.checked end,
          revision=public.grocery_items.revision+1
        where not public.grocery_items.overridden and not public.grocery_items.deleted;
      end loop;
      delete from public.grocery_items i where i.list_id=grocery.id and i.origin='derived'
        and not i.overridden and not i.deleted and not exists(
          select 1 from jsonb_array_elements(projection) j where j->>'originKey'=i.origin_key);
      if grocery.revision is not null then
        update public.grocery_lists set state='ready',recovery_code=null,revision=revision+1 where id=grocery.id;
      end if;
    exception when others then
      recovery := case when sqlstate='40001' then 'GROCERY_REVISION_CONFLICT' else 'GROCERY_UPDATE_FAILED' end;
      select * into grocery from public.grocery_lists where plan_id=p_target and user_id=actor;
      if grocery.id is null then
        insert into public.grocery_lists(user_id,plan_id,state,recovery_code)
          values(actor,p_target,'needs_review',recovery) returning * into grocery;
      else
        update public.grocery_lists set state='needs_review',recovery_code=recovery,revision=revision+1 where id=grocery.id;
      end if;
    end;
    update public.plans set week_start=case when p_action='plan.commit' then (p_payload->>'weekStart')::date else week_start end,
      grocery_state=case when recovery is null then 'ready' else 'needs_review' end,
      pending_groceries=case when recovery is null then null else projection end,
      revision=revision+1 where id=p_target and user_id=actor;
    result := public.plan_document(p_target);
    after_document := result || jsonb_build_object('pendingGroceries',case when recovery is null then null else projection end,
      'storedItems',coalesce((select jsonb_agg(to_jsonb(i)) from public.grocery_items i
        join public.grocery_lists l on l.id=i.list_id where l.plan_id=p_target and i.user_id=actor),'[]'::jsonb));
  else
    raise exception 'Unsupported action' using errcode='22023';
  end if;
  insert into public.mutations(user_id,operation_key,action,request,result,before_state,after_state)
    values(actor,p_key,p_action,input,result,before_document,coalesce(after_document,result));
  return result;
end $$;
revoke all on function public.apply_foundation_mutation(text,text,uuid,bigint,jsonb) from public, anon;
grant execute on function public.apply_foundation_mutation(text,text,uuid,bigint,jsonb) to authenticated;

create function public.foundation_ready() returns text language sql immutable set search_path = '' as $$
  select '202610270002'::text;
$$;
revoke all on function public.foundation_ready() from public;
grant execute on function public.foundation_ready() to anon, authenticated;
notify pgrst, 'reload schema';
