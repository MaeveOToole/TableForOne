begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','one@example.test'),
 ('10000000-0000-4000-8000-000000000002','two@example.test');
select is((select count(*)::integer from public.preferences),2,'Preferences initialized for both accounts');
insert into public.recipes(id,owner_id,title,description,cuisine,minutes,servings,difficulty,ingredients,instructions,incomplete)
values ('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Private draft','Summary','Not recorded',null,null,null,'[]','[]',true);
set local role anon;
select is((select count(*)::integer from public.recipes where id='90000000-0000-4000-8000-000000000001'),0,'Anonymous users cannot read private drafts');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.preferences),1,'Account sees only its preferences');
select is((select count(*)::integer from public.recipes where id='90000000-0000-4000-8000-000000000001'),1,'Owner can read private drafts');
insert into public.saved_recipes(user_id,recipe_id) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.saved_recipes),1,'Owner can read saved recipe');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.saved_recipes),0,'Second account cannot read first account saves');
select is((select count(*)::integer from public.recipes where id='90000000-0000-4000-8000-000000000001'),0,'Second account cannot read private drafts');
select throws_ok($$insert into public.saved_recipes(user_id,recipe_id) values ('10000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001')$$,'42501',null,'Cannot save another account private draft');
select throws_ok($$insert into public.saved_recipes(user_id,recipe_id) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')$$,'42501',null,'Cannot save as another user');
select results_eq($$update public.preferences set revision=2 where user_id='10000000-0000-4000-8000-000000000001' returning user_id$$,array[]::uuid[],'Cannot change another user preferences');
select throws_ok($$update public.preferences set revision=1 where user_id='10000000-0000-4000-8000-000000000002'$$,'23514',null,'Revision must advance');
select * from finish();
rollback;
