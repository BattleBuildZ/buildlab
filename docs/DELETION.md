# Deleting projects and permanent cleanup

Deleting a project in the app is a **soft delete**: `projects.deleted_at` is set and the project disappears from every list.
Its cut list, hardware, print checklist, steps and files stay in the database and Storage. Electronics inventory and stock are never
touched by deleting a project.

The app asks twice: a first confirmation, then typing the project name. The server re-checks the name before it deletes.

## Permanent cleanup (manual, by design)

No screen in the app permanently deletes a project. To reclaim space, run this in the Supabase SQL editor after you are sure:

```sql
-- 1. Review what would go
select id, name, deleted_at from public.projects where deleted_at is not null order by deleted_at;
-- 2. Remove one project permanently (child rows cascade)
delete from public.projects where id = '<project uuid>' and deleted_at is not null;
```

Files in the `project-files` bucket are not removed by that statement. Delete the folder
`{your user id}/{project id}/` in Supabase Storage afterwards.

## Restoring

```sql
update public.projects set deleted_at = null where id = '<project uuid>';
```
