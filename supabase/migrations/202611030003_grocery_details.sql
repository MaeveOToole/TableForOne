-- Add section/note editing without replacing existing shopping rows.
create or replace function public.apply_grocery_details_mutation(p_key text,p_target uuid,p_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.mutations; input jsonb; result jsonb;
 grocery public.grocery_lists; item public.grocery_items; before_document jsonb;
begin
 if actor is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_key is null or length(p_key) not between 8 and 128 or p_target is null or p_revision is null or p_revision<1
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid mutation' using errcode='22023'; end if;
 input:=jsonb_build_object('action','grocery.details','target',p_target,'revision',p_revision,'payload',p_payload);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_key,0));
 select * into receipt from public.mutations where user_id=actor and operation_key=p_key;
 if found then
  if receipt.request<>input then raise exception 'Idempotency conflict' using errcode='P0002'; end if;
  return receipt.result;
 end if;
 select * into grocery from public.grocery_lists where id=(p_payload->>'listId')::uuid and user_id=actor for update;
 if grocery.id is null then raise exception 'Not found' using errcode='P0001'; end if;
 if grocery.state<>'ready' then raise exception 'List needs review' using errcode='40001'; end if;
 select * into item from public.grocery_items where id=p_target and list_id=grocery.id and user_id=actor for update;
 if item.id is null then raise exception 'Not found' using errcode='P0001'; end if;
 if item.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
 if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 200 or length(coalesce(p_payload->>'rawText',''))>2000
  or length(coalesce(p_payload->>'unit',''))>80 or length(coalesce(p_payload->>'section',''))>80
  or length(coalesce(p_payload->>'notes',''))>2000 then raise exception 'Invalid details' using errcode='22023'; end if;
 before_document:=to_jsonb(item);
 update public.grocery_items set name=p_payload->>'name',raw_text=p_payload->>'rawText',quantity=(p_payload->>'quantity')::numeric,
  unit=p_payload->>'unit',checked=(p_payload->>'checked')::boolean,deleted=(p_payload->>'deleted')::boolean,
  section=nullif(trim(p_payload->>'section'),''),notes=nullif(trim(p_payload->>'notes'),''),
  overridden=overridden or (origin in ('derived','regular') and (quantity is distinct from (p_payload->>'quantity')::numeric
   or unit is distinct from p_payload->>'unit' or name is distinct from p_payload->>'name' or raw_text is distinct from p_payload->>'rawText')),
  revision=revision+1 where id=p_target and user_id=actor returning * into item;
 update public.grocery_lists set revision=revision+1 where id=grocery.id and user_id=actor returning * into grocery;
 result:=jsonb_build_object('item',to_jsonb(item),'listRevision',grocery.revision,'state',grocery.state);
 insert into public.mutations(user_id,operation_key,action,request,result,before_state,after_state)
 values(actor,p_key,'grocery.details',input,result,before_document,result);
 return result;
end $$;
revoke all on function public.apply_grocery_details_mutation(text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.apply_grocery_details_mutation(text,uuid,bigint,jsonb) to authenticated;
create or replace function public.grocery_details_ready() returns boolean language sql immutable set search_path='' as $$select true$$;
revoke all on function public.grocery_details_ready() from public,anon;
grant execute on function public.grocery_details_ready() to authenticated;
notify pgrst,'reload schema';
