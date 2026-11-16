-- Additive domain foundation. No seed data or changes to existing recipe IDs.
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
