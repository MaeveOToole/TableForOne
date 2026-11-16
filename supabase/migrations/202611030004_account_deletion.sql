-- Install cleanup only. Applying this migration does not delete any account.
-- Runs inside the Auth deletion transaction; any failed constraint rolls it back.
create or replace function public.cleanup_deleted_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.chat_messages where user_id=old.id;
 delete from public.chat_threads where user_id=old.id;
 delete from public.recipe_shares where user_id=old.id or recipient_id=old.id;
 delete from public.cooking_events where user_id=old.id;
 delete from public.ratings where user_id=old.id;
 delete from public.import_jobs where user_id=old.id;
 delete from public.price_estimates where user_id=old.id;
 delete from public.grocery_items where user_id=old.id;
 delete from public.grocery_lists where user_id=old.id;
 delete from public.plan_slots where user_id=old.id;
 delete from public.plans where user_id=old.id;
 delete from public.recipe_ingredients where user_id=old.id;
 delete from public.recipe_versions where user_id=old.id;
 delete from public.saved_recipes where user_id=old.id;
 delete from public.recipe_collections where user_id=old.id;
 delete from public.weekly_checkouts where user_id=old.id;
 delete from public.weekly_budgets where user_id=old.id;
 delete from public.pantry_items where user_id=old.id;
 delete from public.regular_purchases where user_id=old.id;
 delete from public.mutations where user_id=old.id;
 -- Independent copies keep their content; remove their pointer to a deleted source.
 update public.recipes set source_recipe_id=null,revision=revision+1
  where source_recipe_id in (select id from public.recipes where owner_id=old.id);
 delete from public.recipes where owner_id=old.id;
 -- Profiles/preferences and other Auth relationships use existing cascades.
 return old;
end $$;
revoke all on function public.cleanup_deleted_account() from public,anon,authenticated;
drop trigger if exists account_cleanup on auth.users;
create trigger account_cleanup before delete on auth.users
 for each row execute function public.cleanup_deleted_account();

create or replace function public.account_deletion_ready() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_trigger
  where tgrelid='auth.users'::regclass and tgname='account_cleanup' and tgenabled='O')
$$;
revoke all on function public.account_deletion_ready() from public,anon;
grant execute on function public.account_deletion_ready() to authenticated;
notify pgrst,'reload schema';
