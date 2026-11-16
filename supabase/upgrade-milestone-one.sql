-- Development upgrade only. Preserves existing recipes/accounts; does not import personal drafts.
-- Reviewed canonical migrations are embedded verbatim. Run the entire file as one transaction.
begin;
do $upgrade$
begin
 if to_regclass('public.recipes') is null or to_regclass('public.preferences') is null or to_regclass('public.saved_recipes') is null then
  raise exception 'Initial foundation schema is missing. Stop and review project setup.';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='recipes' and column_name='owner_id') then
 execute $personal$-- Personal recipe drafts preserve missing values and restrict catalog visibility.
alter table public.recipes add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.recipes add column if not exists category text check (category in ('breakfast', 'lunch', 'dinner', 'side'));
alter table public.recipes add column if not exists incomplete boolean not null default false;
alter table public.recipes alter column minutes drop not null;
alter table public.recipes alter column servings drop not null;
alter table public.recipes alter column difficulty drop not null;
drop policy if exists catalog_read on public.recipes;
create policy catalog_read on public.recipes for select to anon, authenticated
using (owner_id is null or (select auth.uid()) = owner_id);

drop policy if exists saves_insert on public.saved_recipes;
create policy saves_insert on public.saved_recipes for insert to authenticated
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.recipes where id = recipe_id
));
$personal$;
 end if;
 if to_regclass('public.profiles') is null then
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='recipes' and column_name='revision') then raise exception 'Partial domain migration detected. Stop and review migration history.'; end if;
 execute $domain$-- Additive domain foundation. No seed data or changes to existing recipe IDs.
alter table public.recipes add column revision bigint not null default 1 check (revision > 0);
alter table public.recipes add column updated_at timestamptz not null default now();
alter table public.recipes add column extraction_confidence text not null default 'unknown'
  check (extraction_confidence in ('unknown','confirmed','inferred','generated'));
alter table public.recipes add column content_permissions jsonb not null default '{"personalStorage":true,"redistribution":false}';
alter table public.recipes add column personal_modifications jsonb not null default '[]';
alter table public.recipes add column source_recipe_id uuid references public.recipes(id);
alter table public.saved_recipes add column revision bigint not null default 1 check (revision > 0);
alter table public.saved_recipes add column updated_at timestamptz not null default now();
alter table public.preferences add column id uuid not null unique default gen_random_uuid();

create table public.profiles (display_name text not null default '');
create table public.recipe_versions (
  recipe_id uuid not null references public.recipes(id),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  attribution jsonb not null default '{}',
  extraction_method text not null check (extraction_method in ('original','provider','imported','generated','manual')),
  confidence text not null default 'unknown' check (confidence in ('unknown','confirmed','inferred','generated')),
  permissions jsonb not null default '{"personalStorage":true,"redistribution":false}',
  modifications jsonb not null default '[]' check (jsonb_typeof(modifications) = 'array')
);
create table public.recipe_ingredients (
  recipe_version_id uuid not null,
  position integer not null check (position >= 0),
  raw_text text not null, normalized_name text, quantity numeric check (quantity > 0), unit text,
  notes text, confidence text not null default 'unknown' check (confidence in ('unknown','confirmed','inferred','generated'))
);
create table public.import_jobs (
  source_url text not null check (source_url ~ '^https?://'),
  state text not null default 'queued' check (state in ('queued','processing','needs_review','ready','link_only','failed')),
  extracted_fields jsonb not null default '{}', warnings jsonb not null default '[]',
  recipe_version_id uuid, attempts integer not null default 0 check (attempts >= 0), error_code text
);
create table public.plans (
  week_start date not null,
  grocery_state text not null default 'ready' check (grocery_state in ('ready','needs_review')),
  pending_groceries jsonb,
  check ((grocery_state='ready' and pending_groceries is null) or (grocery_state='needs_review' and pending_groceries is not null))
);
create table public.plan_slots (
  plan_id uuid not null, day date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner')),
  kind text not null check (kind in ('cook','leftover','eating_out','unplanned')),
  recipe_version_id uuid, prepared_slot_id uuid,
  servings numeric check (servings > 0), locked boolean not null default false,
  unique(plan_id, day, meal) deferrable initially deferred,
  check ((kind = 'cook' and recipe_version_id is not null and servings is not null and prepared_slot_id is null)
    or (kind = 'leftover' and prepared_slot_id is not null and recipe_version_id is null and servings is not null)
    or (kind in ('eating_out','unplanned') and recipe_version_id is null and prepared_slot_id is null))
);
create table public.pantry_items (
  name text not null, raw_text text not null, quantity numeric check (quantity >= 0), unit text,
  use_soon boolean not null default false, notes text
);
create table public.regular_purchases (
  name text not null, quantity numeric check (quantity > 0), unit text,
  cadence_weeks integer not null default 1 check (cadence_weeks > 0), enabled boolean not null default true
);
create table public.grocery_lists (
  plan_id uuid not null unique, state text not null default 'ready' check (state in ('ready','needs_review')),
  recovery_code text, check ((state = 'ready' and recovery_code is null) or (state = 'needs_review' and recovery_code is not null))
);
create table public.grocery_items (
  list_id uuid not null, name text not null, raw_text text not null,
  quantity numeric check (quantity > 0), unit text, section text, notes text,
  origin text not null check (origin in ('derived','manual','regular')),
  origin_key text, origins jsonb not null default '[]', checked boolean not null default false,
  overridden boolean not null default false, deleted boolean not null default false,
  unique(list_id, origin_key), check ((origin = 'derived' and origin_key is not null) or (origin <> 'derived' and origin_key is null))
);
create table public.price_estimates (
  grocery_item_id uuid not null, source text not null, store text, region text,
  currency text not null check (currency ~ '^[A-Z]{3}$'), observed_at timestamptz,
  package_quantity numeric check (package_quantity > 0), package_unit text,
  low_cents integer check (low_cents >= 0), high_cents integer check (high_cents >= low_cents),
  confidence text not null default 'unknown' check (confidence in ('unknown','low','medium','high')),
  check ((low_cents is null) = (high_cents is null))
);
create table public.cooking_events (
  recipe_version_id uuid not null, cooked_at timestamptz not null,
  prepared_servings numeric not null check (prepared_servings > 0), notes text
);
create table public.ratings (
  recipe_id uuid not null references public.recipes(id), stars integer not null check (stars between 1 and 5)
);
create table public.recipe_shares (
  recipe_version_id uuid not null, recipient_id uuid references auth.users(id) on delete cascade,
  token_hash text unique, expires_at timestamptz, revoked_at timestamptz,
  can_read boolean not null default true, can_save boolean not null default false,
  check (recipient_id is not null or token_hash is not null)
);
create table public.chat_threads (title text not null default 'New conversation');
create table public.chat_messages (
  thread_id uuid not null, role text not null check (role in ('user','assistant','tool')),
  content text not null, tool_outcome jsonb
);
create table public.mutations (
  operation_key text not null check (length(operation_key) between 8 and 128),
  action text not null, request jsonb not null, result jsonb not null,
  before_state jsonb, after_state jsonb, undone_by uuid
);

-- Common metadata is added before keys/policies so every domain row uses the same ownership model.
do $$
declare t text;
begin
  foreach t in array array['profiles','recipe_versions','recipe_ingredients','import_jobs','plans','plan_slots',
    'pantry_items','regular_purchases','grocery_lists','grocery_items','price_estimates','cooking_events',
    'ratings','recipe_shares','chat_threads','chat_messages','mutations'] loop
    execute format('alter table public.%I add column id uuid primary key default gen_random_uuid(),
      add column user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      add column revision bigint not null default 1 check (revision > 0),
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now(), add unique (id,user_id)', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create index on public.%I(user_id)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
  end loop;
end $$;


-- Constraints that use user_id must be declared after the shared columns above.
alter table public.profiles add unique(user_id);
alter table public.plans add unique(user_id,week_start);
alter table public.ratings add unique(user_id,recipe_id);
alter table public.mutations add unique(user_id,operation_key);
alter table public.recipe_ingredients add foreign key(recipe_version_id,user_id) references public.recipe_versions(id,user_id);
alter table public.import_jobs add foreign key(recipe_version_id,user_id) references public.recipe_versions(id,user_id);
alter table public.plan_slots add foreign key(plan_id,user_id) references public.plans(id,user_id) on delete cascade;
alter table public.plan_slots add foreign key(recipe_version_id,user_id) references public.recipe_versions(id,user_id);
alter table public.plan_slots add unique(id,plan_id,user_id);
alter table public.plan_slots add foreign key(prepared_slot_id,plan_id,user_id) references public.plan_slots(id,plan_id,user_id) deferrable initially deferred;
alter table public.grocery_lists add foreign key(plan_id,user_id) references public.plans(id,user_id) on delete cascade;
alter table public.grocery_items add foreign key(list_id,user_id) references public.grocery_lists(id,user_id) on delete cascade;
alter table public.price_estimates add foreign key(grocery_item_id,user_id) references public.grocery_items(id,user_id) on delete cascade;
alter table public.cooking_events add foreign key(recipe_version_id,user_id) references public.recipe_versions(id,user_id);
alter table public.recipe_shares add foreign key(recipe_version_id,user_id) references public.recipe_versions(id,user_id);
alter table public.chat_messages add foreign key(thread_id,user_id) references public.chat_threads(id,user_id) on delete cascade;
alter table public.mutations add foreign key(undone_by,user_id) references public.mutations(id,user_id) deferrable initially deferred;

create function public.enforce_record_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at then
    raise exception 'Immutable identity' using errcode = '23514';
  end if;
  if new.revision <> old.revision + 1 then raise exception 'Revision conflict' using errcode = '40001'; end if;
  new.updated_at = now();
  return new;
end $$;

create trigger preference_identity_guard before update on public.preferences
  for each row execute function public.enforce_record_revision();

create trigger saved_recipe_identity_guard before update on public.saved_recipes
  for each row execute function public.enforce_record_revision();

create function public.enforce_recipe_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id<>old.id or new.owner_id is distinct from old.owner_id or new.created_at<>old.created_at then
    raise exception 'Immutable identity' using errcode='23514';
  end if;
  if new.revision<>old.revision+1 then raise exception 'Revision conflict' using errcode='40001'; end if;
  new.updated_at=now(); return new;
end $$;
create trigger recipe_revision_guard before update on public.recipes
  for each row execute function public.enforce_recipe_revision();

do $$
declare t text;
begin
  foreach t in array array['profiles','import_jobs','plans','plan_slots','pantry_items','regular_purchases',
    'grocery_lists','grocery_items','price_estimates','ratings','recipe_shares','chat_threads','mutations'] loop
    execute format('create trigger revision_guard before update on public.%I for each row execute function public.enforce_record_revision()',t);
  end loop;
  -- Derived plan/list records and mutation receipts can only be written through transactional RPCs.
  foreach t in array array['profiles','pantry_items','regular_purchases','ratings','recipe_shares','chat_threads'] loop
    execute format('grant insert, update, delete on public.%I to authenticated',t);
    execute format('create policy owner_write on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
  end loop;
  -- Versioned recipe content, ingredients, cooking snapshots and messages are append-only.
  foreach t in array array['recipe_versions','recipe_ingredients','cooking_events','chat_messages'] loop
    execute format('grant insert on public.%I to authenticated',t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
  end loop;
end $$;

-- Recipe references must be accessible, including on direct Data API access.
drop policy owner_insert on public.recipe_versions;
create policy owner_insert on public.recipe_versions for insert to authenticated with check (
  user_id = (select auth.uid()) and exists(select 1 from public.recipes r where r.id = recipe_id
    and r.content_permissions->>'personalStorage'='true'
    and (permissions->>'redistribution' is distinct from 'true' or r.content_permissions->>'redistribution'='true')));
drop policy owner_write on public.ratings;
create policy owner_write on public.ratings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid())
    and exists(select 1 from public.recipes r where r.id = recipe_id));

-- Only the recipient can use this scoped read; no other private tables are returned.
create function public.read_shared_recipe(p_share_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('shareId',s.id,'canSave',s.can_save,'recipe',
    jsonb_build_object('title',v.snapshot->'title','description',v.snapshot->'description',
      'ingredients',v.snapshot->'ingredients','instructions',v.snapshot->'instructions','provenance',v.attribution))
  from public.recipe_shares s join public.recipe_versions v on v.id=s.recipe_version_id and v.user_id=s.user_id
  join public.recipes r on r.id=v.recipe_id
  where s.id=p_share_id and s.recipient_id=auth.uid() and s.can_read and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now()) and v.permissions->>'redistribution'='true'
    and r.content_permissions->>'redistribution'='true';
$$;
revoke all on function public.read_shared_recipe(uuid) from public, anon;
grant execute on function public.read_shared_recipe(uuid) to authenticated;
$domain$;
 end if;
 if to_regprocedure('public.apply_foundation_mutation(text,text,uuid,bigint,jsonb)') is null then
 execute $transaction$-- Private transactional entry points. All actor IDs come from Auth, never from API input.
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
$transaction$;
 end if;
 if to_regclass('public.recipe_collections') is null then
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='recipes' and column_name='equipment') then raise exception 'Partial library migration detected. Stop and review migration history.'; end if;
 execute $library$alter table public.recipes add column equipment jsonb not null default '[]';
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
$library$;
 end if;
 execute $libraryroutine$create or replace function public.apply_library_mutation(p_key text,p_action text,p_target uuid,p_revision bigint,p_payload jsonb)
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
$libraryroutine$;
 execute $catalogmigration$-- Original launch catalog, authorized October 27, 2026. Personal drafts are unchanged.
insert into public.recipes(id,title,description,cuisine,minutes,servings,difficulty,category,incomplete,ingredients,instructions,provenance,extraction_confidence,content_permissions,equipment,equipment_known,dietary_tags)
select (r->>'id')::uuid,r->>'title',r->>'description',r->>'cuisine',(r->>'minutes')::integer,(r->>'servings')::integer,r->>'difficulty',r->>'category',false,r->'ingredients',r->'instructions',r->'provenance','generated',r->'content_permissions',r->'equipment',true,r->'dietary_tags'
from jsonb_array_elements($catalog$[{"id":"50000000-0000-4000-8000-000000000001","title":"Lemon chickpea and spinach skillet","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Mediterranean","category":"dinner","minutes":20,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"chickpeas","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can chickpeas, drained and rinsed"},{"name":"spinach","quantity":100,"unit":"g","notes":"washed","confidence":"generated","raw":"100 g spinach, washed"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"lemon","quantity":0.5,"unit":"whole","notes":"juice to taste","confidence":"generated","raw":"0.5 whole lemon, juice to taste"}],"instructions":["Drain and rinse the chickpeas. Wash the spinach.","Warm the oil in a skillet over medium heat. Add chickpeas and 3 tablespoons water; cook for 5 minutes, stirring.","Add spinach and cook for 2 to 3 minutes until wilted and everything is hot. Add lemon juice to taste and divide into two portions."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000002","title":"Tomato white bean pasta","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Italian","category":"dinner","minutes":25,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free"],"ingredients":[{"name":"pasta","quantity":150,"unit":"g","notes":"dry; cook according to package","confidence":"generated","raw":"150 g pasta, dry; cook according to package"},{"name":"white beans","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can white beans, drained and rinsed"},{"name":"diced tomatoes","quantity":1,"unit":"400 g can","notes":null,"confidence":"generated","raw":"1 400 g can diced tomatoes"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"dried oregano","quantity":1,"unit":"tsp","notes":null,"confidence":"generated","raw":"1 tsp dried oregano"}],"instructions":["Cook the pasta according to its package directions.","Meanwhile, heat oil in another pan. Add tomatoes, beans and oregano; simmer for 10 minutes, stirring.","Drain pasta and combine with the hot sauce. Divide into two portions."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000003","title":"Black bean rice and avocado bowls","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Mexican","category":"dinner","minutes":30,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free"],"ingredients":[{"name":"rice","quantity":100,"unit":"g","notes":"dry","confidence":"generated","raw":"100 g rice, dry"},{"name":"black beans","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can black beans, drained and rinsed"},{"name":"avocado","quantity":1,"unit":"whole","notes":"slice just before serving","confidence":"generated","raw":"1 whole avocado, slice just before serving"},{"name":"salsa","quantity":4,"unit":"tbsp","notes":"check package ingredients","confidence":"generated","raw":"4 tbsp salsa, check package ingredients"}],"instructions":["Cook rice according to the package directions.","Warm the beans with 3 tablespoons water in a saucepan over medium heat for 5 minutes, stirring until hot.","Divide the rice and beans into two bowls. Top with avocado and salsa."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000004","title":"Roasted sweet potato and lentil plates","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Mediterranean","category":"dinner","minutes":40,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Oven","Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"sweet potato","quantity":400,"unit":"g","notes":"cut into 2 cm cubes","confidence":"generated","raw":"400 g sweet potato, cut into 2 cm cubes"},{"name":"cooked lentils","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can cooked lentils, drained and rinsed"},{"name":"spinach","quantity":100,"unit":"g","notes":"washed","confidence":"generated","raw":"100 g spinach, washed"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"lemon","quantity":0.5,"unit":"whole","notes":"juice to taste","confidence":"generated","raw":"0.5 whole lemon, juice to taste"}],"instructions":["Heat oven to 220 C / 425 F. Toss sweet potato cubes with oil on a baking tray.","Roast for 25 to 30 minutes until tender, turning once.","Heat lentils with 3 tablespoons water in a saucepan for 5 minutes. Add spinach and stir until wilted. Divide between two plates with the sweet potato and finish with lemon."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000005","title":"Broccoli pea and white bean rice","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Italian","category":"dinner","minutes":30,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"rice","quantity":100,"unit":"g","notes":"dry","confidence":"generated","raw":"100 g rice, dry"},{"name":"broccoli","quantity":200,"unit":"g","notes":"small florets","confidence":"generated","raw":"200 g broccoli, small florets"},{"name":"frozen peas","quantity":100,"unit":"g","notes":null,"confidence":"generated","raw":"100 g frozen peas"},{"name":"white beans","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can white beans, drained and rinsed"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"}],"instructions":["Cook rice according to its package directions.","Steam broccoli for 6 to 8 minutes until tender. Cook peas according to their package.","Heat beans with a splash of water until hot. Combine everything with olive oil and divide into two portions."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000006","title":"Pepper black bean tacos","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Mexican","category":"dinner","minutes":25,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free"],"ingredients":[{"name":"bell pepper","quantity":2,"unit":"whole","notes":"sliced","confidence":"generated","raw":"2 whole bell pepper, sliced"},{"name":"black beans","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can black beans, drained and rinsed"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"corn tortillas","quantity":4,"unit":"whole","notes":"check package ingredients","confidence":"generated","raw":"4 whole corn tortillas, check package ingredients"},{"name":"salsa","quantity":2,"unit":"tbsp","notes":null,"confidence":"generated","raw":"2 tbsp salsa"}],"instructions":["Cook sliced peppers in oil over medium heat for 8 to 10 minutes until tender.","Add beans with 3 tablespoons water. Cook for 5 minutes, stirring until hot.","Warm tortillas according to the package. Fill with the mixture and top with salsa; serve two tacos per portion."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000007","title":"Tomato red lentil soup","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Mediterranean","category":"dinner","minutes":35,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"red lentils","quantity":120,"unit":"g","notes":"dry; rinsed","confidence":"generated","raw":"120 g red lentils, dry; rinsed"},{"name":"diced tomatoes","quantity":1,"unit":"400 g can","notes":null,"confidence":"generated","raw":"1 400 g can diced tomatoes"},{"name":"carrot","quantity":1,"unit":"whole","notes":"finely diced","confidence":"generated","raw":"1 whole carrot, finely diced"},{"name":"water","quantity":600,"unit":"ml","notes":null,"confidence":"generated","raw":"600 ml water"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"ground cumin","quantity":0.5,"unit":"tsp","notes":null,"confidence":"generated","raw":"0.5 tsp ground cumin"}],"instructions":["Heat oil in a saucepan. Add diced carrot and cook over medium heat for 5 minutes, stirring.","Add lentils, tomatoes, water and cumin. Bring to a boil, then simmer gently for 20 to 25 minutes until lentils and carrot are tender.","Stir frequently toward the end and add water if needed. Divide into two portions; let soup cool slightly before eating."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000008","title":"Courgette chickpea tomato stew","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Italian","category":"dinner","minutes":30,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"zucchini","quantity":300,"unit":"g","notes":"cut into small cubes","confidence":"generated","raw":"300 g zucchini, cut into small cubes"},{"name":"chickpeas","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can chickpeas, drained and rinsed"},{"name":"diced tomatoes","quantity":1,"unit":"400 g can","notes":null,"confidence":"generated","raw":"1 400 g can diced tomatoes"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"dried oregano","quantity":1,"unit":"tsp","notes":null,"confidence":"generated","raw":"1 tsp dried oregano"}],"instructions":["Heat oil in a saucepan over medium heat. Add zucchini and cook for 5 minutes, stirring.","Add tomatoes, chickpeas and oregano. Simmer for 15 minutes until zucchini is tender and stew is hot.","Add a splash of water if needed. Divide into two portions."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000009","title":"Chickpea cucumber lunch bowls","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Mediterranean","category":"lunch","minutes":15,"servings":2,"difficulty":"simple","incomplete":false,"equipment":[],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"chickpeas","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can chickpeas, drained and rinsed"},{"name":"cucumber","quantity":200,"unit":"g","notes":"washed and diced","confidence":"generated","raw":"200 g cucumber, washed and diced"},{"name":"tomato","quantity":200,"unit":"g","notes":"washed and diced","confidence":"generated","raw":"200 g tomato, washed and diced"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"lemon","quantity":0.5,"unit":"whole","notes":"juice to taste","confidence":"generated","raw":"0.5 whole lemon, juice to taste"}],"instructions":["Drain and rinse the chickpeas. Wash and dice cucumber and tomato.","Combine in a bowl with oil and lemon juice to taste.","Divide into two portions. Keep any uneaten portion refrigerated promptly."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000010","title":"White bean tomato lunch salad","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"Italian","category":"lunch","minutes":15,"servings":2,"difficulty":"simple","incomplete":false,"equipment":[],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free","Gluten-free"],"ingredients":[{"name":"white beans","quantity":1,"unit":"400 g can","notes":"drained and rinsed","confidence":"generated","raw":"1 400 g can white beans, drained and rinsed"},{"name":"tomato","quantity":200,"unit":"g","notes":"washed and diced","confidence":"generated","raw":"200 g tomato, washed and diced"},{"name":"spinach","quantity":60,"unit":"g","notes":"washed and chopped","confidence":"generated","raw":"60 g spinach, washed and chopped"},{"name":"olive oil","quantity":1,"unit":"tbsp","notes":null,"confidence":"generated","raw":"1 tbsp olive oil"},{"name":"lemon","quantity":0.5,"unit":"whole","notes":"juice to taste","confidence":"generated","raw":"0.5 whole lemon, juice to taste"}],"instructions":["Drain and rinse beans. Wash and prepare tomato and spinach.","Combine ingredients with olive oil and lemon juice to taste.","Divide into two portions and refrigerate any uneaten portion promptly."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000011","title":"Banana cinnamon oatmeal","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"American","category":"breakfast","minutes":10,"servings":2,"difficulty":"simple","incomplete":false,"equipment":["Stovetop"],"equipment_known":true,"dietary_tags":["Vegetarian","Vegan","Dairy-free","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free"],"ingredients":[{"name":"rolled oats","quantity":80,"unit":"g","notes":null,"confidence":"generated","raw":"80 g rolled oats"},{"name":"water","quantity":400,"unit":"ml","notes":null,"confidence":"generated","raw":"400 ml water"},{"name":"banana","quantity":1,"unit":"whole","notes":"sliced","confidence":"generated","raw":"1 whole banana, sliced"},{"name":"ground cinnamon","quantity":0.5,"unit":"tsp","notes":null,"confidence":"generated","raw":"0.5 tsp ground cinnamon"}],"instructions":["Combine oats and water in a saucepan. Bring to a gentle simmer.","Cook for the time on the oat package, stirring often and adding water if needed.","Divide into two bowls and top with banana and cinnamon."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null},{"id":"50000000-0000-4000-8000-000000000012","title":"Berry yogurt breakfast bowls","description":"An original two-portion recipe for cooking for one. AI-generated and not kitchen-tested.","cuisine":"American","category":"breakfast","minutes":5,"servings":2,"difficulty":"simple","incomplete":false,"equipment":[],"equipment_known":true,"dietary_tags":["Vegetarian","Egg-free","Peanut-free","Tree nut-free","Sesame-free","Shellfish-free","Fish-free"],"ingredients":[{"name":"plain yogurt","quantity":300,"unit":"g","notes":null,"confidence":"generated","raw":"300 g plain yogurt"},{"name":"berries","quantity":150,"unit":"g","notes":"washed; use fresh berries","confidence":"generated","raw":"150 g berries, washed; use fresh berries"},{"name":"rolled oats","quantity":40,"unit":"g","notes":"ready-to-eat or prepare according to package","confidence":"generated","raw":"40 g rolled oats, ready-to-eat or prepare according to package"}],"instructions":["Wash berries. Use oats suitable for eating without cooking, or prepare them according to the package and cool.","Divide yogurt between two bowls.","Top with berries and oats. Refrigerate any uneaten portion promptly."],"extraction_confidence":"generated","content_permissions":{"personalStorage":true,"redistribution":true},"personal_modifications":[],"source_recipe_id":null,"provenance":{"source":"Table for One original starter catalog","url":null,"method":"generated","permission":"Original AI-generated recipe; personal storage and sharing allowed. Not kitchen-tested. Dietary tags reflect listed ingredients; check product labels."},"creator":null,"image_url":null,"image_permission":"none","nutrition":null,"estimated_additional_cost_cents":null,"cost_source":null}]$catalog$::jsonb) r
on conflict(id) do nothing;
create or replace function public.foundation_ready() returns text language sql immutable set search_path='' as $$ select '202610270004'::text; $$;
notify pgrst, 'reload schema';
$catalogmigration$;
end $upgrade$;
select public.foundation_ready() as expected_marker_202610270004;
commit;
