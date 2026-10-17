-- BuildLab 0002: electronics inventory, audited stock movements, test procedures/runs, project links.
-- Electronics works with zero projects; project_components is the only bridge and is optional.

-- ---------------------------------------------------------------- categories & locations
create table public.component_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  is_custom boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.component_storage_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.component_storage_locations(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  kind text not null default 'bin' check (kind in ('cabinet','drawer','bin','shelf','box','other')),
  notes text,
  qr_token uuid not null default gen_random_uuid() unique,   -- payload for the printable QR label
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- components
create table public.electronic_components (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  category_id uuid references public.component_categories(id) on delete set null,
  manufacturer text,
  part_number text,                          -- exact part number; variant matters
  variant text,
  description text,
  notes text,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),  -- maintained ONLY by stock movements
  min_stock_threshold integer check (min_stock_threshold is null or min_stock_threshold >= 0),
  condition text not null default 'unknown' check (condition in ('new','good','used','damaged','unknown')),
  storage_location_id uuid references public.component_storage_locations(id) on delete set null,
  operating_voltage_min numeric(6,2),
  operating_voltage_max numeric(6,2),
  logic_level_voltage numeric(6,2),          -- e.g. 3.3 or 5; null = unknown
  interfaces text[] not null default '{}',   -- I2C, SPI, UART, GPIO, ADC, PWM, ...
  specs jsonb not null default '{}'::jsonb,  -- free-form technical specs
  unverified_fields text[] not null default '{}',  -- spec keys the user has NOT verified against documentation
  track_individual_units boolean not null default false,
  test_status text not null default 'not_tested' check (test_status in ('passed','failed','inconclusive','not_tested')),
  last_tested_at timestamptz,
  retest_interval_days integer check (retest_interval_days is null or retest_interval_days > 0),
  qr_token uuid not null default gen_random_uuid() unique,
  archived_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (operating_voltage_min is null or operating_voltage_max is null or operating_voltage_min <= operating_voltage_max)
);
create index electronic_components_owner_idx on public.electronic_components(owner_id) where archived_at is null;
create index electronic_components_search_idx on public.electronic_components using gin (search_vector);
create index electronic_components_part_trgm on public.electronic_components using gin (part_number gin_trgm_ops);
create index electronic_components_name_trgm on public.electronic_components using gin (name gin_trgm_ops);
create index electronic_components_location_idx on public.electronic_components(storage_location_id);

create or replace function public.components_search_vector() returns trigger
language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.part_number,'') || ' ' || coalesce(new.variant,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.manufacturer,'') || ' ' || array_to_string(new.interfaces, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.description,'') || ' ' || coalesce(new.notes,'')), 'C');
  return new;
end $$;
create trigger electronic_components_search_vector
before insert or update on public.electronic_components
for each row execute function public.components_search_vector();

-- Optional per-unit tracking, for parts that need separate test histories.
create table public.component_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  component_id uuid not null references public.electronic_components(id) on delete cascade,
  label text not null,                        -- serial, sticker, or "unit 3"
  condition text not null default 'unknown' check (condition in ('new','good','used','damaged','unknown')),
  storage_location_id uuid references public.component_storage_locations(id) on delete set null,
  test_status text not null default 'not_tested' check (test_status in ('passed','failed','inconclusive','not_tested')),
  last_tested_at timestamptz,
  notes text,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (component_id, label)
);

create table public.component_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  component_id uuid not null references public.electronic_components(id) on delete cascade,
  kind text not null check (kind in ('photo','datasheet','pinout','wiring','document','other')),
  title text,
  storage_bucket text default 'component-files',
  storage_path text,                          -- uploaded file
  display_path text,                          -- optimized display copy for images
  external_url text,                          -- or a link to manufacturer documentation
  original_filename text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  -- Provenance. Anything not explicitly verified is labelled as such in the UI.
  verified boolean not null default false,
  source_url text,
  variant text,                               -- exact component variant the diagram applies to
  target_board text,                          -- e.g. "ESP32-S3" for wiring diagrams
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index component_assets_component_idx on public.component_assets(component_id, kind);

-- ---------------------------------------------------------------- audited stock movements
create table public.component_stock_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  component_id uuid not null references public.electronic_components(id) on delete cascade,
  unit_id uuid references public.component_units(id) on delete set null,
  movement_type text not null check (movement_type in ('initial','addition','consumption','adjustment')),
  quantity_delta integer not null check (quantity_delta <> 0),
  quantity_after integer,                     -- filled by trigger
  reason text,
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  check (movement_type <> 'consumption' or quantity_delta < 0),
  check (movement_type not in ('initial','addition') or quantity_delta > 0)
);
create index component_stock_movements_component_idx on public.component_stock_movements(component_id, created_at desc);

-- on-hand quantity changes ONLY through movements; the row is locked so concurrent writes serialize.
create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur integer;
begin
  select quantity_on_hand into cur from public.electronic_components
   where id = new.component_id and owner_id = new.owner_id for update;
  if not found then raise exception 'component not found for this owner'; end if;
  if cur + new.quantity_delta < 0 then
    raise exception 'insufficient stock: % on hand, change of %', cur, new.quantity_delta using errcode = '23514';
  end if;
  new.quantity_after := cur + new.quantity_delta;
  update public.electronic_components set quantity_on_hand = new.quantity_after where id = new.component_id;
  return new;
end $$;
create trigger component_stock_movements_apply
before insert on public.component_stock_movements
for each row execute function public.apply_stock_movement();

-- Direct edits to quantity_on_hand are rejected; the audit trail is the only writer.
create or replace function public.guard_quantity_on_hand() returns trigger
language plpgsql as $$
begin
  if new.quantity_on_hand is distinct from old.quantity_on_hand and pg_trigger_depth() < 2 then
    raise exception 'quantity_on_hand can only change through component_stock_movements';
  end if;
  return new;
end $$;
create trigger electronic_components_guard_qty
before update of quantity_on_hand on public.electronic_components
for each row execute function public.guard_quantity_on_hand();

-- ---------------------------------------------------------------- test procedures (versioned, immutable versions)
create table public.test_procedures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  component_id uuid references public.electronic_components(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  supported_variant text,                     -- exact part/variant this procedure covers
  current_version_id uuid,                    -- fk added below
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.test_procedure_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  procedure_id uuid not null references public.test_procedures(id) on delete cascade,
  version integer not null check (version >= 1),
  -- definition: equipment[], wiring[{pin,connects_to}], supply_voltage{min,max}, logic_level_voltage,
  --   steps[{n,instruction,measurement?{key,unit,expected_min,expected_max}}], evaluation_rules, troubleshooting
  definition jsonb not null,
  verified boolean not null default false,    -- unverified procedures are MANUAL ONLY
  execution_mode text not null default 'manual_only' check (execution_mode in ('manual_only','automatable')),
  change_note text,
  created_at timestamptz not null default now(),
  unique (procedure_id, version),
  -- an unverified procedure can never be flagged automatable
  check (execution_mode = 'manual_only' or verified)
);
alter table public.test_procedures
  add constraint test_procedures_current_version_fk foreign key (current_version_id)
  references public.test_procedure_versions(id) on delete set null;

create table public.test_fixtures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  fixture_uid text not null,                  -- identifier the firmware reports
  firmware_version text,
  protocol_version text,
  capabilities jsonb not null default '[]'::jsonb,   -- test ids this fixture's circuitry supports
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fixture_uid)
);

create table public.test_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  component_id uuid not null references public.electronic_components(id) on delete cascade,
  unit_id uuid references public.component_units(id) on delete set null,
  procedure_version_id uuid references public.test_procedure_versions(id) on delete restrict,
  procedure_version_number integer,           -- snapshot, survives procedure edits
  criteria_snapshot jsonb,                    -- pass/fail criteria exactly as used for this run
  source text not null default 'manual' check (source in ('manual','automated')),
  outcome text not null check (outcome in ('passed','failed','inconclusive','not_tested')),
  performed_at timestamptz not null default now(),
  notes text,
  troubleshooting_notes text,
  fixture_id uuid references public.test_fixtures(id) on delete set null,
  fixture_firmware_version text,
  request_id text,                            -- idempotency key for automated retries
  errors jsonb,
  created_at timestamptz not null default now(),
  check (source = 'manual' or (fixture_id is not null and request_id is not null)),
  unique (fixture_id, request_id)
);
create index test_runs_component_idx on public.test_runs(component_id, performed_at desc);

create table public.test_measurements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  test_run_id uuid not null references public.test_runs(id) on delete cascade,
  key text not null,
  label text,
  unit text,
  value_numeric numeric,
  value_text text,
  expected_min numeric,
  expected_max numeric,
  passed boolean,                             -- null when no documented range exists
  source text not null default 'user_entered' check (source in ('user_entered','instrument')),
  photo_asset_id uuid references public.component_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  check (value_numeric is not null or value_text is not null)
);
create index test_measurements_run_idx on public.test_measurements(test_run_id);

-- Latest status follows the newest meaningful run; older failures are never deleted.
create or replace function public.apply_latest_test_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare latest record;
begin
  if new.outcome = 'not_tested' then return new; end if;
  if new.unit_id is not null then
    select outcome, performed_at into latest from public.test_runs
     where unit_id = new.unit_id and outcome <> 'not_tested' order by performed_at desc, created_at desc limit 1;
    update public.component_units set test_status = latest.outcome, last_tested_at = latest.performed_at where id = new.unit_id;
  end if;
  select outcome, performed_at into latest from public.test_runs
   where component_id = new.component_id and outcome <> 'not_tested' order by performed_at desc, created_at desc limit 1;
  update public.electronic_components set test_status = latest.outcome, last_tested_at = latest.performed_at
   where id = new.component_id;
  return new;
end $$;
create trigger test_runs_latest_status
after insert on public.test_runs
for each row execute function public.apply_latest_test_status();

-- ---------------------------------------------------------------- project integration (optional bridge)
create table public.project_components (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  component_id uuid not null references public.electronic_components(id) on delete restrict,
  hardware_item_id uuid references public.hardware_items(id) on delete set null,
  assembly_id uuid references public.assemblies(id) on delete set null,
  build_step_id uuid references public.build_steps(id) on delete set null,
  quantity_required integer not null default 1 check (quantity_required >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  quantity_consumed integer not null default 0 check (quantity_consumed >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, component_id, hardware_item_id)
);
create index project_components_component_idx on public.project_components(component_id);

alter table public.hardware_items
  add column component_id uuid references public.electronic_components(id) on delete set null;

-- Consumption is explicit: only this function deducts stock, and only when the user confirms.
-- Adding or reserving a component never calls it.
create or replace function public.confirm_component_consumption(p_project_component_id uuid, p_quantity integer, p_reason text default null)
returns public.project_components language plpgsql security invoker set search_path = public as $$
declare pc public.project_components;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  select * into pc from public.project_components where id = p_project_component_id for update;
  if not found then raise exception 'project component not found'; end if;
  insert into public.component_stock_movements (owner_id, component_id, movement_type, quantity_delta, reason, project_id)
  values (pc.owner_id, pc.component_id, 'consumption', -p_quantity, coalesce(p_reason, 'Confirmed consumption for project'), pc.project_id);
  update public.project_components
     set quantity_consumed = quantity_consumed + p_quantity,
         quantity_reserved = greatest(quantity_reserved - p_quantity, 0)
   where id = pc.id returning * into pc;
  return pc;
end $$;

-- ---------------------------------------------------------------- default categories for new users
create or replace function public.seed_default_categories(p_owner uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.component_categories (owner_id, name, sort_order)
  select p_owner, c.name, c.ord from (values
    ('Sensors',1),('Microcontrollers & dev boards',2),('Integrated circuits',3),
    ('Resistors, capacitors, diodes & transistors',4),('LEDs & displays',5),
    ('Motors, servos & actuators',6),('Communication modules',7),
    ('Connectors, wires & breadboard accessories',8),('Power supplies & power management',9),('Other',10)
  ) as c(name, ord)
  on conflict (owner_id, name) do nothing
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  perform public.seed_default_categories(new.id);   -- categories only; never projects or sample data
  return new;
end $$;

-- ---------------------------------------------------------------- updated_at + RLS
do $$
declare t text;
begin
  foreach t in array array[
    'component_categories','component_storage_locations','electronic_components','component_units',
    'component_assets','test_procedures','test_fixtures','project_components'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;

  foreach t in array array[
    'component_categories','component_storage_locations','electronic_components','component_units',
    'component_assets','component_stock_movements','test_procedures','test_procedure_versions',
    'test_fixtures','test_runs','test_measurements','project_components'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (owner_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid())', t || '_insert', t);
  end loop;

  -- Mutable tables: update + delete. Immutable history (stock movements, procedure versions,
  -- test runs, test measurements) gets neither, so earlier results can never be altered or lost.
  foreach t in array array[
    'component_categories','component_storage_locations','electronic_components','component_units',
    'component_assets','test_procedures','test_fixtures','project_components'
  ] loop
    execute format('create policy %I on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (owner_id = auth.uid())', t || '_delete', t);
  end loop;
end $$;
