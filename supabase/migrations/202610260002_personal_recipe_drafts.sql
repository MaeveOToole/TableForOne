-- Personal recipe drafts preserve missing values and restrict catalog visibility.
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
