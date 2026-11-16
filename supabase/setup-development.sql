-- One-time setup for the empty Table for One development project.
-- Creates schema, ownership policies and six development-only recipe fixtures.
-- Run in Supabase SQL Editor. Do not run on production or an initialized database.
-- Canonical inputs: supabase/migrations/202610260001_foundation.sql and supabase/seed.sql.

begin;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text not null, cuisine text not null,
  minutes integer not null check (minutes > 0), servings integer not null check (servings > 0),
  difficulty text not null check (difficulty in ('simple','moderate')),
  ingredients jsonb not null, instructions jsonb not null, provenance jsonb not null,
  created_at timestamptz not null default now()
);
create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"people":1,"cookingSessions":3,"portions":2,"maxMinutes":60,"weeklyBudgetCents":15000,"currency":"USD","timeZone":"America/New_York","cuisines":["Mexican","Italian","Mediterranean"]}',
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.saved_recipes (
  id uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.recipes enable row level security;
alter table public.preferences enable row level security;
alter table public.saved_recipes enable row level security;
create policy catalog_read on public.recipes for select to anon, authenticated using (true);
create policy preferences_read on public.preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy preferences_update on public.preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saves_read on public.saved_recipes for select to authenticated using ((select auth.uid()) = user_id);
create policy saves_insert on public.saved_recipes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saves_delete on public.saved_recipes for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.recipes, public.preferences, public.saved_recipes from anon, authenticated;
grant select on public.recipes to anon, authenticated;
grant select, update on public.preferences to authenticated;
grant select, insert, delete on public.saved_recipes to authenticated;
create function public.initialize_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.preferences(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.initialize_user() from public;
create trigger initialize_user after insert on auth.users for each row execute function public.initialize_user();
create function public.enforce_preference_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then raise exception 'Revision must increment by one' using errcode = '23514'; end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger preference_revision before update on public.preferences for each row execute function public.enforce_preference_revision();


-- Development fixtures only, not a licensed launch catalog.
insert into public.recipes (id,title,description,cuisine,minutes,servings,difficulty,ingredients,instructions,provenance)
select (r->>'id')::uuid,r->>'title',r->>'description',r->>'cuisine',(r->>'minutes')::int,(r->>'servings')::int,r->>'difficulty',r->'ingredients',r->'instructions',r->'provenance'
from (values 
('{"id": "00000000-0000-4000-8000-000000000001", "title": "Lemon chickpea skillet", "description": "A simple two-portion dinner for an easier week.", "cuisine": "Mediterranean", "minutes": 20, "servings": 2, "difficulty": "simple", "ingredients": [{"raw": "1 tbsp olive oil", "name": "1 tbsp olive oil", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 can chickpeas, drained", "name": "1 can chickpeas, drained", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "2 cups spinach", "name": "2 cups spinach", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 lemon", "name": "1 lemon", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1/2 cup water", "name": "1/2 cup water", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}], "instructions": ["Warm olive oil in a skillet over medium heat.", "Add drained chickpeas and water. Simmer for 5 minutes.", "Stir in spinach until wilted. Add lemon juice to taste and divide into two portions."], "provenance": {"source": "Table for One development kitchen", "url": null, "permission": "Original AI-generated development fixture; not kitchen-tested.", "method": "generated"}}'::jsonb),
('{"id": "00000000-0000-4000-8000-000000000002", "title": "Tomato and white bean pasta", "description": "A simple two-portion dinner for an easier week.", "cuisine": "Italian", "minutes": 25, "servings": 2, "difficulty": "simple", "ingredients": [{"raw": "150 g dried pasta", "name": "150 g dried pasta", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 can white beans, drained", "name": "1 can white beans, drained", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 can diced tomatoes", "name": "1 can diced tomatoes", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 tbsp olive oil", "name": "1 tbsp olive oil", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}], "instructions": ["Cook pasta according to package directions.", "Warm olive oil, tomatoes and beans in a separate pan; simmer for 10 minutes.", "Drain pasta, combine with the sauce and divide into two portions."], "provenance": {"source": "Table for One development kitchen", "url": null, "permission": "Original AI-generated development fixture; not kitchen-tested.", "method": "generated"}}'::jsonb),
('{"id": "00000000-0000-4000-8000-000000000003", "title": "Black bean rice bowls", "description": "A simple two-portion dinner for an easier week.", "cuisine": "Mexican", "minutes": 25, "servings": 2, "difficulty": "simple", "ingredients": [{"raw": "1/2 cup dry rice", "name": "1/2 cup dry rice", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 can black beans, drained", "name": "1 can black beans, drained", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 avocado", "name": "1 avocado", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1/2 cup salsa", "name": "1/2 cup salsa", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}], "instructions": ["Cook rice according to package directions.", "Heat drained beans in a pan with a splash of water until steaming.", "Divide rice and beans between two bowls; top with sliced avocado and salsa."], "provenance": {"source": "Table for One development kitchen", "url": null, "permission": "Original AI-generated development fixture; not kitchen-tested.", "method": "generated"}}'::jsonb),
('{"id": "00000000-0000-4000-8000-000000000004", "title": "Roasted sweet potato and lentils", "description": "A simple two-portion dinner for an easier week.", "cuisine": "Mediterranean", "minutes": 40, "servings": 2, "difficulty": "simple", "ingredients": [{"raw": "1 sweet potato", "name": "1 sweet potato", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 tbsp olive oil", "name": "1 tbsp olive oil", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 can lentils, drained", "name": "1 can lentils, drained", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "2 cups spinach", "name": "2 cups spinach", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}], "instructions": ["Heat oven to 425 F. Cut sweet potato into small cubes and toss with olive oil.", "Roast for 25 to 30 minutes until tender.", "Heat lentils and spinach in a pan until steaming and wilted, then serve with sweet potato."], "provenance": {"source": "Table for One development kitchen", "url": null, "permission": "Original AI-generated development fixture; not kitchen-tested.", "method": "generated"}}'::jsonb),
('{"id": "00000000-0000-4000-8000-000000000005", "title": "Broccoli and pea rice", "description": "A simple two-portion dinner for an easier week.", "cuisine": "Italian", "minutes": 30, "servings": 2, "difficulty": "simple", "ingredients": [{"raw": "1/2 cup dry rice", "name": "1/2 cup dry rice", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "2 cups broccoli florets", "name": "2 cups broccoli florets", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 cup frozen peas", "name": "1 cup frozen peas", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 tbsp olive oil", "name": "1 tbsp olive oil", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}], "instructions": ["Cook rice according to package directions.", "Steam broccoli until tender, about 6 to 8 minutes. Cook peas according to package directions.", "Combine rice and vegetables with olive oil and season to taste."], "provenance": {"source": "Table for One development kitchen", "url": null, "permission": "Original AI-generated development fixture; not kitchen-tested.", "method": "generated"}}'::jsonb),
('{"id": "00000000-0000-4000-8000-000000000006", "title": "Pepper and black bean skillet", "description": "A simple two-portion dinner for an easier week.", "cuisine": "Mexican", "minutes": 20, "servings": 2, "difficulty": "simple", "ingredients": [{"raw": "2 bell peppers", "name": "2 bell peppers", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 can black beans, drained", "name": "1 can black beans, drained", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "1 tbsp olive oil", "name": "1 tbsp olive oil", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}, {"raw": "4 small tortillas", "name": "4 small tortillas", "quantity": null, "unit": null, "notes": "Development sample; normalization pending."}], "instructions": ["Slice peppers and cook in olive oil over medium heat for 8 to 10 minutes.", "Add beans and a splash of water. Heat until steaming.", "Warm tortillas according to package directions and fill with the bean mixture."], "provenance": {"source": "Table for One development kitchen", "url": null, "permission": "Original AI-generated development fixture; not kitchen-tested.", "method": "generated"}}'::jsonb)) as fixtures(r)
on conflict (id) do nothing;


notify pgrst, 'reload schema';
commit;

select count(*) as development_recipe_count from public.recipes;
