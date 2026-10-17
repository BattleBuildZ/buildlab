-- Behavioural tests for migrations 0001-0002. Run on the stubbed scratch DB; raises on any failure.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- fresh accounts: profile + default categories, zero projects
do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles created';
  assert (select count(*) from public.projects) = 0, 'no seeded projects';
  assert (select count(*) from public.component_categories where owner_id = '00000000-0000-0000-0000-00000000000a') = 10, 'default categories';
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

insert into public.projects (id, name) values ('10000000-0000-0000-0000-000000000001', 'Test build');
insert into public.assemblies (id, project_id, name, fabrication_type)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Frame', 'woodworking');
insert into public.cut_list_items (id, project_id, assembly_id, name, quantity)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Leg', 4);
insert into public.cut_item_dimensions (cut_list_item_id, label, mm, inch)
  values ('30000000-0000-0000-0000-000000000001', 'length', 300, null);   -- mm only: inch must stay null

do $$ begin
  assert (select count(*) from public.cut_units) = 4, 'one unit per quantity';
  assert (select inch from public.cut_item_dimensions) is null, 'inch never auto-filled from mm';
end $$;
update public.cut_units set completed_at = now() where unit_index = 2;
update public.cut_list_items set quantity = 6 where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.cut_units) = 6, 'units grow with quantity';
  assert (select count(*) from public.cut_units where completed_at is not null) = 1, 'completion preserved on growth';
end $$;
update public.cut_list_items set quantity = 3 where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.cut_units) = 3, 'units shrink with quantity';
  assert (select count(*) from public.cut_units where completed_at is not null) = 1, 'completed unit 2 survives shrink';
end $$;

-- print part must link / file constraint
insert into public.print_parts (id, project_id, name) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Case');
do $$ begin
  begin
    insert into public.print_files (print_part_id, kind) values ('40000000-0000-0000-0000-000000000001', 'link');
    raise exception 'link without url should fail';
  exception when check_violation then null; end;
end $$;

-- electronics: stock via movements only
insert into public.electronic_components (id, name, part_number, quantity_on_hand)
  values ('50000000-0000-0000-0000-000000000001', 'HC-SR04 ultrasonic', 'HC-SR04', 0);
insert into public.component_stock_movements (component_id, movement_type, quantity_delta, reason)
  values ('50000000-0000-0000-0000-000000000001', 'initial', 5, 'bought');
do $$ begin
  assert (select quantity_on_hand from public.electronic_components) = 5, 'movement applied';
  begin
    update public.electronic_components set quantity_on_hand = 99;
    raise exception 'direct qty edit should fail';
  exception when raise_exception then
    if sqlerrm like 'direct qty%' then raise; end if;
  end;
  begin
    insert into public.component_stock_movements (component_id, movement_type, quantity_delta)
      values ('50000000-0000-0000-0000-000000000001', 'consumption', -9);
    raise exception 'overdraw should fail';
  exception when check_violation then null; end;
  assert (select quantity_on_hand from public.electronic_components) = 5, 'quantity unchanged after rejects';
end $$;

-- movements are immutable (no update / delete policy => no rows affected)
update public.component_stock_movements set quantity_delta = 100;
delete from public.component_stock_movements;
do $$ begin assert (select count(*) from public.component_stock_movements) = 1 and
  (select quantity_delta from public.component_stock_movements) = 5, 'audit trail immutable'; end $$;

-- assigning to a project does NOT deduct stock; explicit confirmation does
insert into public.project_components (id, project_id, component_id, quantity_required, quantity_reserved)
  values ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001', 2, 2);
do $$ begin assert (select quantity_on_hand from public.electronic_components) = 5, 'assignment/reservation deducts nothing'; end $$;
select public.confirm_component_consumption('60000000-0000-0000-0000-000000000001', 2, 'used in build');
do $$ begin
  assert (select quantity_on_hand from public.electronic_components) = 3, 'consumption deducts';
  assert (select quantity_consumed from public.project_components) = 2, 'consumed tracked';
  assert (select quantity_reserved from public.project_components) = 0, 'reservation released';
end $$;

-- testing: a later pass updates latest status but keeps the earlier failure
insert into public.test_procedures (id, component_id, name) values ('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Echo range');
insert into public.test_procedure_versions (id, procedure_id, version, definition)
  values ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001', 1, '{"steps":[]}');
do $$ begin
  begin
    insert into public.test_procedure_versions (procedure_id, version, definition, execution_mode, verified)
      values ('70000000-0000-0000-0000-000000000001', 2, '{}', 'automatable', false);
    raise exception 'unverified automatable must fail';
  exception when check_violation then null; end;
end $$;
insert into public.test_runs (id, component_id, procedure_version_id, procedure_version_number, outcome, performed_at)
  values ('80000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',1,'failed', now() - interval '2 days');
insert into public.test_measurements (test_run_id, key, unit, value_numeric, expected_min, expected_max, passed)
  values ('80000000-0000-0000-0000-000000000001','echo_distance','cm', 12.0, 99, 101, false);
do $$ begin assert (select test_status from public.electronic_components) = 'failed', 'status failed'; end $$;
insert into public.test_runs (component_id, procedure_version_id, procedure_version_number, outcome, performed_at)
  values ('50000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',1,'passed', now());
insert into public.test_runs (component_id, outcome, performed_at)
  values ('50000000-0000-0000-0000-000000000001','not_tested', now() + interval '1 hour');
do $$ begin
  assert (select test_status from public.electronic_components) = 'passed', 'latest = passed';
  assert (select count(*) from public.test_runs where outcome = 'failed') = 1, 'earlier failure preserved';
  assert (select count(*) from public.test_measurements) = 1, 'measurements preserved';
end $$;
delete from public.test_runs;
do $$ begin assert (select count(*) from public.test_runs) = 3, 'test history cannot be deleted'; end $$;

-- automated runs need an idempotency key; retries cannot duplicate
insert into public.test_fixtures (id, name, fixture_uid) values ('90000000-0000-0000-0000-000000000001','Bench 1','fx-1');
insert into public.test_runs (component_id, source, outcome, fixture_id, request_id)
  values ('50000000-0000-0000-0000-000000000001','automated','passed','90000000-0000-0000-0000-000000000001','req-1');
do $$ begin
  begin
    insert into public.test_runs (component_id, source, outcome, fixture_id, request_id)
      values ('50000000-0000-0000-0000-000000000001','automated','passed','90000000-0000-0000-0000-000000000001','req-1');
    raise exception 'duplicate request should fail';
  exception when unique_violation then null; end;
  begin
    insert into public.test_runs (component_id, source, outcome) values ('50000000-0000-0000-0000-000000000001','automated','passed');
    raise exception 'automated run without fixture should fail';
  exception when check_violation then null; end;
end $$;

-- RLS isolation: user B sees none of A's data and cannot write into it
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.projects) = 0, 'B sees no projects';
  assert (select count(*) from public.electronic_components) = 0, 'B sees no components';
  assert (select count(*) from public.test_runs) = 0, 'B sees no test runs';
  begin
    insert into public.projects (owner_id, name) values ('00000000-0000-0000-0000-00000000000a', 'spoof');
    raise exception 'spoofed owner should fail';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
\echo ALL BEHAVIOUR TESTS PASSED
