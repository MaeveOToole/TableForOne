alter table public.recipes add column equipment jsonb not null default '[]';
alter table public.recipes add column equipment_known boolean not null default false;
alter table public.recipes add column dietary_tags jsonb not null default '[]';
alter table public.recipes add column creator text;
alter table public.recipes add column image_url text;
alter table public.recipes add column image_permission text not null default 'none' check(image_permission in ('none','licensed','generated'));
alter table public.recipes add column nutrition jsonb;
alter table public.recipes add column estimated_additional_cost_cents integer check(estimated_additional_cost_cents>=0);
alter table public.recipes add column cost_source text;
create table public.recipe_collections (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80),revision bigint not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id),unique(user_id,name)
);
alter table public.recipe_collections enable row level security;
revoke all on public.recipe_collections from anon,authenticated;
grant select on public.recipe_collections to authenticated;
create policy owner_read on public.recipe_collections for select to authenticated using(user_id=(select auth.uid()));
create trigger revision_guard before update on public.recipe_collections for each row execute function public.enforce_record_revision();
alter table public.saved_recipes add column collection_id uuid;
alter table public.saved_recipes add column planned_week date;
alter table public.saved_recipes add foreign key(collection_id,user_id) references public.recipe_collections(id,user_id);
create table public.weekly_budgets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 week_start date not null,ceiling_cents integer not null check(ceiling_cents between 0 and 1000000),currency text not null default 'USD' check(currency='USD'),
 revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,week_start)
);
alter table public.weekly_budgets enable row level security;
revoke all on public.weekly_budgets from anon,authenticated;
grant select on public.weekly_budgets to authenticated;
create policy owner_read on public.weekly_budgets for select to authenticated using(user_id=(select auth.uid()));
create trigger revision_guard before update on public.weekly_budgets for each row execute function public.enforce_record_revision();
create function public.apply_library_mutation(p_key text,p_action text,p_target uuid,p_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.mutations; input jsonb; output jsonb;
 source public.recipes; copied public.recipes; before_document jsonb;
begin
 if actor is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_key is null or length(p_key) not between 8 and 128 or p_revision is null or p_revision<0 or p_target is null or p_payload is null
 then raise exception 'Invalid mutation' using errcode='22023'; end if;
 input:=jsonb_build_object('action',p_action,'target',p_target,'revision',p_revision,'payload',p_payload);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_key,0));
 select * into receipt from public.mutations where user_id=actor and operation_key=p_key;
 if found then
  if receipt.request<>input then raise exception 'Idempotency conflict' using errcode='P0002'; end if;
  return receipt.result;
 end if;
 if p_action='budget.set' then
  if p_target<>actor then raise exception 'Not found' using errcode='P0001'; end if;
  if p_revision=0 then
   insert into public.weekly_budgets(user_id,week_start,ceiling_cents) values(actor,(p_payload->>'weekStart')::date,(p_payload->>'ceilingCents')::integer) returning to_jsonb(weekly_budgets) into output;
  else
   select to_jsonb(b) into before_document from public.weekly_budgets b where user_id=actor and week_start=(p_payload->>'weekStart')::date;
   update public.weekly_budgets set ceiling_cents=(p_payload->>'ceilingCents')::integer,revision=revision+1
    where user_id=actor and week_start=(p_payload->>'weekStart')::date and revision=p_revision returning to_jsonb(weekly_budgets) into output;
   if not found then raise exception 'Revision conflict' using errcode='40001'; end if;
  end if;
 elsif p_action='collection.create' then
  if p_revision<>0 then raise exception 'Revision conflict' using errcode='40001'; end if;
  insert into public.recipe_collections(id,user_id,name) values(p_target,actor,p_payload->>'name') returning to_jsonb(recipe_collections) into output;
 elsif p_action='saved.organize' then
  select to_jsonb(s) into before_document from public.saved_recipes s where recipe_id=p_target and user_id=actor;
  update public.saved_recipes set collection_id=(p_payload->>'collectionId')::uuid,planned_week=(p_payload->>'plannedWeek')::date,revision=revision+1
   where recipe_id=p_target and user_id=actor and revision=p_revision returning to_jsonb(saved_recipes) into output;
  if not found then raise exception 'Revision conflict' using errcode='40001'; end if;
 elsif p_action in ('recipe.copy','recipe.edit') then
  if p_action='recipe.copy' then
   if p_revision<>0 then raise exception 'Revision conflict' using errcode='40001'; end if;
   select * into source from public.recipes where id=(p_payload->>'sourceId')::uuid and (owner_id is null or owner_id=actor);
   if not found or source.content_permissions->>'personalStorage' is distinct from 'true' then raise exception 'Not found' using errcode='P0001'; end if;
   copied:=source;copied.id:=p_target;copied.owner_id:=actor;copied.source_recipe_id:=source.id;
   copied.created_at:=now();copied.updated_at:=now();copied.revision:=1;
  else
   select * into copied from public.recipes where id=p_target and owner_id=actor for update;
   if not found then raise exception 'Not found' using errcode='P0001'; end if;
   if copied.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
   before_document:=to_jsonb(copied);copied.revision:=copied.revision+1;
  end if;
  copied.title:=p_payload->>'title';copied.description:=p_payload->>'description';
  copied.ingredients:=p_payload->'ingredients';copied.instructions:=p_payload->'instructions';
  if copied.title is null or jsonb_typeof(copied.ingredients) is distinct from 'array' or jsonb_typeof(copied.instructions) is distinct from 'array'
   then raise exception 'Invalid recipe' using errcode='22023'; end if;
  copied.personal_modifications:=copied.personal_modifications||jsonb_build_array(jsonb_build_object('method','manual','note',p_payload->>'note','at',now()));
  copied.dietary_tags:='[]';copied.equipment_known:=false;copied.nutrition:=null;copied.estimated_additional_cost_cents:=null;copied.cost_source:=null;
  copied.extraction_confidence:='unknown';
  copied.incomplete:=jsonb_array_length(copied.ingredients)=0 or jsonb_array_length(copied.instructions)=0;
  if p_action='recipe.copy' then insert into public.recipes select copied.*;
  else update public.recipes set title=copied.title,description=copied.description,ingredients=copied.ingredients,instructions=copied.instructions,
   personal_modifications=copied.personal_modifications,revision=copied.revision,incomplete=copied.incomplete,
   dietary_tags=copied.dietary_tags,equipment_known=false,nutrition=null,estimated_additional_cost_cents=null,cost_source=null,extraction_confidence='unknown'
   where id=p_target and owner_id=actor; end if;
  select * into copied from public.recipes where id=p_target and owner_id=actor;
  insert into public.saved_recipes(user_id,recipe_id) values(actor,p_target) on conflict(user_id,recipe_id) do nothing;
  insert into public.recipe_versions(user_id,recipe_id,snapshot,attribution,extraction_method,confidence,permissions,modifications)
   values(actor,p_target,to_jsonb(copied),copied.provenance,'manual','unknown',copied.content_permissions,copied.personal_modifications);
  output:=to_jsonb(copied);
 else raise exception 'Unsupported action' using errcode='22023'; end if;
 insert into public.mutations(user_id,operation_key,action,request,result,before_state,after_state)
  values(actor,p_key,p_action,input,output,before_document,output);
 return output;
end $$;
revoke all on function public.apply_library_mutation(text,text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.apply_library_mutation(text,text,uuid,bigint,jsonb) to authenticated;
