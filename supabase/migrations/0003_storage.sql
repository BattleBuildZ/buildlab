-- BuildLab 0003: private Storage buckets. Object paths MUST begin with the owner's user id:
--   {auth.uid()}/{project_or_component_id}/{uuid}-{filename}
-- Binary files live in Storage; only metadata and paths live in relational tables.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-files',   'project-files',   false, 52428800, array[
     'image/jpeg','image/png','image/webp','application/pdf',
     'model/stl','model/3mf','application/sla','application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
     'text/x.gcode','text/plain','application/octet-stream','application/zip','application/step']),
  ('component-files', 'component-files', false, 26214400, array[
     'image/jpeg','image/png','image/webp','image/svg+xml','application/pdf','text/plain'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

do $$
declare b text;
begin
  foreach b in array array['project-files','component-files'] loop
    execute format($f$create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_select', b);
    execute format($f$create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_insert', b);
    execute format($f$create policy %I on storage.objects for update to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_update', b, b);
    execute format($f$create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_delete', b);
  end loop;
end $$;
