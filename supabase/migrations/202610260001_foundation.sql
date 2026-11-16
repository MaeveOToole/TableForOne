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
