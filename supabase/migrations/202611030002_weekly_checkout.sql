-- Additive weekly totals. Separate from budget ceilings and grocery items.
create table if not exists public.weekly_checkouts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 week_start date not null, actual_cents integer check(actual_cents between 0 and 1000000),
 tax_cents integer check(tax_cents between 0 and 1000000), fee_cents integer check(fee_cents between 0 and 1000000),
 currency text not null default 'USD' check(currency='USD'), revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,week_start)
);
alter table public.weekly_checkouts enable row level security;
revoke all on public.weekly_checkouts from public,anon,authenticated;
grant select on public.weekly_checkouts to authenticated;
drop policy if exists owner_read on public.weekly_checkouts;
create policy owner_read on public.weekly_checkouts for select to authenticated using(user_id=(select auth.uid()));
drop trigger if exists revision_guard on public.weekly_checkouts;
create trigger revision_guard before update on public.weekly_checkouts for each row execute function public.enforce_record_revision();

create or replace function public.checkout_document(p_week date) returns jsonb
language sql security invoker set search_path='' as $$
 select case when auth.uid() is null then null else coalesce(
  (select jsonb_build_object('weekStart',week_start,'revision',revision,'actualCents',actual_cents,'taxCents',tax_cents,'feeCents',fee_cents,'currency',currency)
   from public.weekly_checkouts where user_id=auth.uid() and week_start=p_week),
  jsonb_build_object('weekStart',p_week,'revision',0,'actualCents',null,'taxCents',null,'feeCents',null,'currency','USD')) end;
$$;
revoke all on function public.checkout_document(date) from public,anon;
grant execute on function public.checkout_document(date) to authenticated;

create or replace function public.apply_checkout_mutation(p_key text,p_week date,p_revision bigint,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.mutations; current_checkout public.weekly_checkouts;
 input jsonb; result jsonb; before_document jsonb;
begin
 if actor is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_key is null or length(p_key) not between 8 and 128 or p_week is null or p_revision is null or p_revision<0
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid mutation' using errcode='22023'; end if;
 input:=jsonb_build_object('action','checkout.set','weekStart',p_week,'revision',p_revision,'payload',p_payload);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_key,0));
 select * into receipt from public.mutations where user_id=actor and operation_key=p_key;
 if found then
  if receipt.request<>input then raise exception 'Idempotency conflict' using errcode='P0002'; end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':checkout:'||p_week::text,0));
 select * into current_checkout from public.weekly_checkouts where user_id=actor and week_start=p_week for update;
 if coalesce(current_checkout.revision,0)<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
 before_document:=public.checkout_document(p_week);
 if current_checkout.id is null then
  insert into public.weekly_checkouts(user_id,week_start,actual_cents,tax_cents,fee_cents)
  values(actor,p_week,(p_payload->>'actualCents')::integer,(p_payload->>'taxCents')::integer,(p_payload->>'feeCents')::integer);
 else
  update public.weekly_checkouts set actual_cents=(p_payload->>'actualCents')::integer,tax_cents=(p_payload->>'taxCents')::integer,
   fee_cents=(p_payload->>'feeCents')::integer,revision=revision+1 where user_id=actor and week_start=p_week;
 end if;
 result:=public.checkout_document(p_week);
 insert into public.mutations(user_id,operation_key,action,request,result,before_state,after_state)
 values(actor,p_key,'checkout.set',input,result,before_document,result);
 return result;
end $$;
revoke all on function public.apply_checkout_mutation(text,date,bigint,jsonb) from public,anon;
grant execute on function public.apply_checkout_mutation(text,date,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
