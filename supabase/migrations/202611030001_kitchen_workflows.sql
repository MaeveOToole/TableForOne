-- Additive upgrade for existing October 27 databases. Does not replace recipes,
-- account preferences, saved recipes or shopping lists.
alter table public.pantry_items add column if not exists staple boolean not null default false;

create or replace function public.apply_kitchen_mutation(p_key text,p_action text,p_target uuid,p_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); receipt public.mutations; input jsonb; result jsonb; before_document jsonb;
 pantry public.pantry_items; purchase public.regular_purchases; grocery public.grocery_lists;
 item public.grocery_items; current_plan public.plans; current_slot public.plan_slots;
begin
 if actor is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_key is null or length(p_key) not between 8 and 128 or p_action is null or p_target is null
  or p_revision is null or p_revision<0 or p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise exception 'Invalid mutation' using errcode='22023';
 end if;
 input:=jsonb_build_object('action',p_action,'target',p_target,'revision',p_revision,'payload',p_payload);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_key,0));
 select * into receipt from public.mutations where user_id=actor and operation_key=p_key;
 if found then
  if receipt.request<>input then raise exception 'Idempotency conflict' using errcode='P0002'; end if;
  return receipt.result;
 end if;
 if p_action in ('pantry.upsert','pantry.delete') then
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':pantry:'||p_target::text,0));
  select * into pantry from public.pantry_items where id=p_target and user_id=actor for update;
  if coalesce(pantry.revision,0)<>p_revision or (pantry.id is null and exists(select 1 from public.pantry_items where id=p_target)) then
   raise exception 'Revision conflict' using errcode='40001';
  end if;
  before_document:=case when pantry.id is null then null else to_jsonb(pantry) end;
  if p_action='pantry.delete' then
   if pantry.id is null then raise exception 'Not found' using errcode='P0001'; end if;
   delete from public.pantry_items where id=p_target and user_id=actor;
   result:=jsonb_build_object('deleted',true,'id',p_target);
  else
   if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 200
    or length(coalesce(p_payload->>'unit',''))>80 or length(coalesce(p_payload->>'notes',''))>2000 then
    raise exception 'Invalid pantry item' using errcode='22023';
   end if;
   if pantry.id is null then
    insert into public.pantry_items(id,user_id,name,raw_text,quantity,unit,use_soon,staple,notes)
    values(p_target,actor,trim(p_payload->>'name'),trim(p_payload->>'name'),(p_payload->>'quantity')::numeric,
      p_payload->>'unit',(p_payload->>'useSoon')::boolean,(p_payload->>'staple')::boolean,p_payload->>'notes') returning * into pantry;
   else
    update public.pantry_items set name=trim(p_payload->>'name'),raw_text=trim(p_payload->>'name'),quantity=(p_payload->>'quantity')::numeric,
     unit=p_payload->>'unit',use_soon=(p_payload->>'useSoon')::boolean,staple=(p_payload->>'staple')::boolean,notes=p_payload->>'notes',revision=revision+1
     where id=p_target and user_id=actor returning * into pantry;
   end if;
   result:=to_jsonb(pantry);
  end if;
 elsif p_action in ('regular.upsert','regular.delete') then
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':regular:'||p_target::text,0));
  select * into purchase from public.regular_purchases where id=p_target and user_id=actor for update;
  if coalesce(purchase.revision,0)<>p_revision or (purchase.id is null and exists(select 1 from public.regular_purchases where id=p_target)) then
   raise exception 'Revision conflict' using errcode='40001';
  end if;
  before_document:=case when purchase.id is null then null else to_jsonb(purchase) end;
  if p_action='regular.delete' then
   if purchase.id is null then raise exception 'Not found' using errcode='P0001'; end if;
   delete from public.regular_purchases where id=p_target and user_id=actor;
   result:=jsonb_build_object('deleted',true,'id',p_target);
  else
   if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 200 or length(coalesce(p_payload->>'unit',''))>80
    or (p_payload->>'cadenceWeeks')::int not between 1 and 52 then raise exception 'Invalid regular purchase' using errcode='22023'; end if;
   if purchase.id is null then
    insert into public.regular_purchases(id,user_id,name,quantity,unit,cadence_weeks,enabled)
    values(p_target,actor,trim(p_payload->>'name'),(p_payload->>'quantity')::numeric,p_payload->>'unit',(p_payload->>'cadenceWeeks')::int,(p_payload->>'enabled')::boolean)
    returning * into purchase;
   else
    update public.regular_purchases set name=trim(p_payload->>'name'),quantity=(p_payload->>'quantity')::numeric,unit=p_payload->>'unit',
     cadence_weeks=(p_payload->>'cadenceWeeks')::int,enabled=(p_payload->>'enabled')::boolean,revision=revision+1
     where id=p_target and user_id=actor returning * into purchase;
   end if;
   result:=to_jsonb(purchase);
  end if;
 elsif p_action='regular.include' then
  select * into grocery from public.grocery_lists where id=p_target and user_id=actor for update;
  if grocery.id is null then raise exception 'Not found' using errcode='P0001'; end if;
  if grocery.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
  if grocery.state<>'ready' then raise exception 'List needs review' using errcode='40001'; end if;
  select * into purchase from public.regular_purchases where id=(p_payload->>'purchaseId')::uuid and user_id=actor;
  if purchase.id is null then raise exception 'Not found' using errcode='P0001'; end if;
  before_document:=public.plan_document(grocery.plan_id);
  select * into item from public.grocery_items where list_id=grocery.id and user_id=actor and origin='regular'
    and origins @> jsonb_build_array(jsonb_build_object('regularPurchaseId',purchase.id)) for update;
  if item.id is null and (p_payload->>'included')::boolean then
   insert into public.grocery_items(user_id,list_id,name,raw_text,quantity,unit,origin,origins)
   values(actor,grocery.id,purchase.name,trim(concat(purchase.quantity,' ',purchase.unit,' ',purchase.name)),purchase.quantity,purchase.unit,'regular',
    jsonb_build_array(jsonb_build_object('regularPurchaseId',purchase.id,'cadenceWeeks',purchase.cadence_weeks))) returning * into item;
  elsif item.id is not null then
   update public.grocery_items set deleted=not (p_payload->>'included')::boolean,revision=revision+1 where id=item.id and user_id=actor returning * into item;
  end if;
  update public.grocery_lists set revision=revision+1 where id=grocery.id and user_id=actor;
  result:=public.plan_document(grocery.plan_id);
 elsif p_action='plan.lock' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':plan:'||p_target::text,0));
  select * into current_plan from public.plans where id=p_target and user_id=actor for update;
  if current_plan.id is null then raise exception 'Not found' using errcode='P0001'; end if;
  if current_plan.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
  select * into current_slot from public.plan_slots where id=(p_payload->>'slotId')::uuid and plan_id=p_target and user_id=actor for update;
  if current_slot.id is null then raise exception 'Not found' using errcode='P0001'; end if;
  if current_slot.revision<>(p_payload->>'slotRevision')::bigint or p_payload->>'slotRevision' is null then raise exception 'Revision conflict' using errcode='40001'; end if;
  before_document:=public.plan_document(p_target);
  update public.plan_slots set locked=(p_payload->>'locked')::boolean,revision=revision+1 where id=current_slot.id and user_id=actor;
  update public.plans set revision=revision+1 where id=p_target and user_id=actor;
  result:=public.plan_document(p_target);
 else raise exception 'Unsupported action' using errcode='22023';
 end if;
 insert into public.mutations(user_id,operation_key,action,request,result,before_state,after_state)
 values(actor,p_key,p_action,input,result,before_document,result);
 return result;
end $$;
revoke all on function public.apply_kitchen_mutation(text,text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.apply_kitchen_mutation(text,text,uuid,bigint,jsonb) to authenticated;
create or replace function public.kitchen_ready() returns boolean language sql immutable set search_path='' as $$select true$$;
revoke all on function public.kitchen_ready() from public,anon;
grant execute on function public.kitchen_ready() to authenticated;
notify pgrst,'reload schema';
