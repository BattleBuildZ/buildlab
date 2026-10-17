-- BuildLab 0001: core schema — identity, projects, fabrication, hardware, printing, steps, plans.
-- Conventions
--   * Every private table carries owner_id (default auth.uid()) and an RLS policy scoped to it.
--   * Stable uuid primary keys; created_at / updated_at on every table.
--   * Constrained values use text + CHECK (easier to evolve than native enums).
--   * Dimensions: mm and inch are SEPARATE user-entered numeric columns. Nothing converts one to the other.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  theme_preference text not null default 'system' check (theme_preference in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text,
  type text not null default 'custom' check (type in ('custom','sourced')),
  status text not null default 'planning' check (status in ('planning','in_progress','completed','archived')),
  thumbnail_asset_id uuid,                 -- fk added after project_assets exists
  deleted_at timestamptz,                  -- soft delete; see docs/DELETION.md for permanent cleanup
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects(owner_id) where deleted_at is null;
create index projects_name_trgm on public.projects using gin (name gin_trgm_ops);

-- Future-ready collaboration; unused by the initial single-owner product.
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, member_id)
);

-- ---------------------------------------------------------------- project assets / documents
create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('thumbnail','piece_image','step_image','plan_pdf','drawing','print_file','other')),
  storage_bucket text not null default 'project-files',
  storage_path text not null,              -- original file; never destructively resized
  display_path text,                       -- optimized display copy (~640 px max dimension) for images
  original_filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  width_px integer,
  height_px integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);
create index project_assets_project_idx on public.project_assets(project_id);

alter table public.projects
  add constraint projects_thumbnail_fk foreign key (thumbnail_asset_id)
  references public.project_assets(id) on delete set null;

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid references public.project_assets(id) on delete set null,
  title text not null,
  doc_kind text not null default 'plan' check (doc_kind in ('plan','reference','other')),
  page_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_documents_project_idx on public.project_documents(project_id);

create table public.drawing_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid references public.project_documents(id) on delete set null,
  asset_id uuid references public.project_assets(id) on delete set null,  -- rendered page image
  page_key text not null,                  -- e.g. "A-01"
  title text,
  page_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, page_key)
);

-- ---------------------------------------------------------------- fabrication: assemblies, cut list, units
create table public.assemblies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  fabrication_type text not null check (fabrication_type in ('woodworking','metalworking','3d_printing','electronics')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assemblies_project_idx on public.assemblies(project_id, sort_order);

create table public.cut_list_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assembly_id uuid not null references public.assemblies(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  material text,
  quantity integer not null default 1 check (quantity >= 0 and quantity <= 1000),
  fabrication_note text,
  product_url text,
  drawing_page_id uuid references public.drawing_pages(id) on delete set null,
  plan_page_key text,
  reference_asset_id uuid references public.project_assets(id) on delete set null,
  needs_review boolean not null default false,   -- sourced-plan values the user must confirm
  review_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cut_list_items_assembly_idx on public.cut_list_items(assembly_id, sort_order);
create index cut_list_items_project_idx on public.cut_list_items(project_id);
create index cut_list_items_name_trgm on public.cut_list_items using gin (name gin_trgm_ops);

-- Labeled dimensions. mm and inch are independent, user-entered values; either may be null.
create table public.cut_item_dimensions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cut_list_item_id uuid not null references public.cut_list_items(id) on delete cascade,
  label text not null default 'length',    -- length, width, thickness, diameter, or custom
  mm numeric(12,3) check (mm is null or mm >= 0),
  inch numeric(12,4) check (inch is null or inch >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cut_item_dimensions_item_idx on public.cut_item_dimensions(cut_list_item_id, sort_order);

-- One row per physical unit so each tile completes independently.
create table public.cut_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cut_list_item_id uuid not null references public.cut_list_items(id) on delete cascade,
  unit_index integer not null check (unit_index >= 1),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cut_list_item_id, unit_index)
);

-- Keep cut_units in step with cut_list_items.quantity (owner_id copied from the item).
create or replace function public.sync_cut_units() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cut_units (owner_id, cut_list_item_id, unit_index)
  select new.owner_id, new.id, g
  from generate_series(1, new.quantity) g
  on conflict (cut_list_item_id, unit_index) do nothing;

  -- Shrinking quantity removes the highest-numbered units first.
  delete from public.cut_units where cut_list_item_id = new.id and unit_index > new.quantity;
  return new;
end $$;

create trigger cut_list_items_sync_units
after insert or update of quantity on public.cut_list_items
for each row execute function public.sync_cut_units();

-- ---------------------------------------------------------------- hardware (component link added in 0002)
create table public.hardware_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  quantity_required numeric(12,3) check (quantity_required is null or quantity_required >= 0),
  quantity_acquired numeric(12,3) check (quantity_acquired is null or quantity_acquired >= 0),
  notes text,
  product_url text,
  is_ready boolean not null default false,   -- "ready / acquired", not merely acknowledged
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hardware_items_project_idx on public.hardware_items(project_id, sort_order);

-- ---------------------------------------------------------------- printing
create table public.print_parts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  quantity integer check (quantity is null or quantity >= 1),
  material text,
  infill text,
  supports text,
  orientation text,
  notes text,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index print_parts_project_idx on public.print_parts(project_id, sort_order);

create table public.print_part_cut_items (
  print_part_id uuid not null references public.print_parts(id) on delete cascade,
  cut_list_item_id uuid not null references public.cut_list_items(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (print_part_id, cut_list_item_id)
);

create table public.print_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  print_part_id uuid not null references public.print_parts(id) on delete cascade,
  kind text not null check (kind in ('link','upload')),
  url text,                                 -- for kind = 'link'
  asset_id uuid references public.project_assets(id) on delete set null,  -- for kind = 'upload'
  filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'upload' and asset_id is not null))
);

-- ---------------------------------------------------------------- build steps
create table public.build_phases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index build_phases_project_idx on public.build_phases(project_id, sort_order);

create table public.build_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  phase_id uuid references public.build_phases(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  instructions text,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index build_steps_project_idx on public.build_steps(project_id, sort_order);

-- Links from a step to parts, hardware, drawing pages, or images. Exactly one target per row.
create table public.build_step_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  build_step_id uuid not null references public.build_steps(id) on delete cascade,
  cut_list_item_id uuid references public.cut_list_items(id) on delete cascade,
  hardware_item_id uuid references public.hardware_items(id) on delete cascade,
  drawing_page_id uuid references public.drawing_pages(id) on delete cascade,
  asset_id uuid references public.project_assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(cut_list_item_id, hardware_item_id, drawing_page_id, asset_id) = 1)
);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','projects','project_members','project_assets','project_documents','drawing_pages',
    'assemblies','cut_list_items','cut_item_dimensions','cut_units','hardware_items',
    'print_parts','print_files','build_phases','build_steps'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- new-user bootstrap
-- Creates the profile only. Projects stay empty: no sample or demo data is ever seeded.
-- (Default electronics categories are added in 0002.)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- Row Level Security
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_members','project_assets','project_documents','drawing_pages',
    'assemblies','cut_list_items','cut_item_dimensions','cut_units','hardware_items',
    'print_parts','print_part_cut_items','print_files','build_phases','build_steps','build_step_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (owner_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (owner_id = auth.uid())', t || '_delete', t);
  end loop;
end $$;
