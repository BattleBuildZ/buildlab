# BuildLab

Workshop project management: projects, cut lists (mm and inch kept separate), hardware, 3D print checklists, build steps, plus an
electronics inventory with manual testing. Next.js (App Router) + Supabase + Vercel.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: auth, shell, dashboard, create / two-step soft delete, settings, theme | built |
| 2 | Project tracking: summary progress, hardware checklist, cut list (mm and in, per-unit tiles, By Group / By Size), build steps with phases, search | built (no new SQL needed) |
| 3 | Assets and print checklist | not built |
| 4 | Electronics inventory | not built (schema ready) |
| 5 | Manual test bench, calculator, converter | not built (schema ready) |
| 6 | Project / electronics integration | not built |
| 7 | Automated test bench | later |

Plan-PDF extraction for **Sourced** projects is not implemented. Sourced projects are created empty.

## Project workspace (Phase 2)

- **Cut list** is the workbench cut list: every piece has a quantity and labelled dimensions; mm and in are separate boxes and never converted.
  Inches accept a decimal (23.625) or a fraction (23 5/8). Each unit is its own tile; By Group and By Size views; Print button.
- **Progress** counts each cut unit, hardware line (when marked ready), print part and build step as one item. See `src/lib/progress.ts`.
- **Search** on the Projects page matches project names and descriptions plus cut piece, hardware and step names.
- Tested end to end on a local stack (Postgres with the migrations + PostgREST) with Playwright: add/edit/delete, tiles, reorder, search, no overflow at 375 px.

## Hosting

Live: https://buildlab-phi.vercel.app (Vercel project `buildlab`, deploys from `main` on GitHub). Database and auth: Supabase.

## Setup

1. Create a Supabase project. Run `supabase/migrations/0001`, `0002`, `0003` in order (SQL editor or `supabase db push`).
2. `cp .env.local.example .env.local` and fill in the project URL and publishable key.
3. `npm install && npm run dev`, open http://localhost:3000, create an account.
4. Deploy: import the repo in Vercel and set the same two environment variables.

## Database tests

`supabase/tests/` runs the migrations against plain Postgres with a small Supabase stub (never apply the stub to a real project):
`00_supabase_stub.sql`, then the migrations, then `01_behavior.sql`.

## Deleting data

See `docs/DELETION.md`.

<!-- deploy check: 2026-10-18T02:29:40Z -->
<!-- deploy check 2: 2026-10-18T02:34:23Z -->
<!-- deploy check 2: 2026-10-18T02:53:21Z -->
