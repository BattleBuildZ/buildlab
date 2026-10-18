# BuildLab

Workshop project management: projects, cut lists (mm and inch kept separate), hardware, 3D print checklists, build steps, plus an
electronics inventory with manual testing. Next.js (App Router) + Supabase + Vercel.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: auth, shell, dashboard, create / two-step soft delete, settings, theme | built |
| 2 | Project tracking: summary progress, hardware checklist, cut list (mm and in, per-unit tiles, By Group / By Size), build steps with phases, search | built (no new SQL needed) |
| 3 | Print checklist, file uploads, plan PDFs, drawing viewer, 640 px image copies, project photo | built (no new SQL; needs the `project-files` bucket from migration 0003) |
| 4 | Electronics inventory: components, locations, audited stock movements, files with provenance, CSV import/export, QR labels | built (no new SQL; needs the `component-files` bucket from 0003) |
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

## Files and print checklist (Phase 3)

- Files upload from the browser straight into the private `project-files` bucket under `{user id}/{project id}/`; a server action then checks the
  object exists and writes the database row, so a file is only shown once it is really saved. Max 50 MB each.
- Images keep the untouched original and also get a display copy (max 640 px long side, JPEG) used for previews, the project card and header photo.
  The viewer opens the original (fit / actual size). PDFs open in the browser's PDF viewer.
- The Print Checklist section appears only when the project has a 3D printing assembly. Each part: quantity, material, infill, supports,
  orientation, notes, optional links to cut pieces, printed check-off, and any number of files (STL, 3MF, STEP, G-code, OBJ, ZIP) or links.
- Deleting a file or part removes its stored objects. Deleting a whole project is a soft delete (see docs/DELETION.md).
- Not yet: attaching a drawing/photo to an individual cut piece or build step (planned for Phase 6 polish).

## Electronics inventory (Phase 4)

- Works with zero projects. Nothing is pre-filled except the standard category names (and the app offers to add them if your account has none).
- Stock: `quantity_on_hand` is changed only by recorded movements (starting stock, added, used, count correction). The database rejects direct edits,
  refuses to go below zero, and the history cannot be edited or deleted. After each change the app re-reads the stored count before saying it saved.
- "Delete" for components is **Archive** (two confirmations, restorable) so stock and test history are never lost.
- Electrical details and specs are only what you type. Each is shown as **Unverified** unless you tick that you checked it against documentation;
  files and links carry the same verified flag plus source, variant and (for wiring) target board.
- CSV: export components or the full movement history; import up to 200 rows (preview first, duplicates and bad rows reported and skipped, missing
  categories and locations created). Cells starting with = + - @ are neutralised on export.
- QR labels for components and locations encode `/q/{token}`; scanning while signed in opens the item.
- Not yet: per-unit tracking screens, test procedures and the manual test bench (Phase 5), project reservations and consumption (Phase 6).

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
