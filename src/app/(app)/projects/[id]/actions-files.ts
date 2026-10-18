"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ASSET_KINDS, MAX_UPLOAD_BYTES } from "@/lib/files";
import type { ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "project-files";
const id = z.string().uuid("Unknown item.");
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().transform((v) => (v ? v : null));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";
type Supa = Awaited<ReturnType<typeof createClient>>;

async function touch(supabase: Supa, projectId: string) {
  await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

async function userId(supabase: Supa) {
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

async function ownsProject(supabase: Supa, projectId: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  return Boolean(data);
}

async function removeObjects(supabase: Supa, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length) await supabase.storage.from(BUCKET).remove(list);
}

const assetMeta = z.object({
  kind: z.enum(ASSET_KINDS),
  storage_path: z.string().min(1).max(600),
  display_path: z.string().max(600).nullable().optional().transform((v) => v ?? null),
  original_filename: text(255).min(1),
  mime_type: z.string().max(120).nullable().optional().transform((v) => v ?? null),
  size_bytes: z.number().int().min(0).max(MAX_UPLOAD_BYTES),
  width_px: z.number().int().positive().max(100000).nullable().optional().transform((v) => v ?? null),
  height_px: z.number().int().positive().max(100000).nullable().optional().transform((v) => v ?? null),
});
type AssetMeta = z.infer<typeof assetMeta>;

// Registers an uploaded object: checks the path belongs to this user and project, checks the file really exists in
// Storage, and only then writes the row. Returns the new asset id.
async function registerAsset(supabase: Supa, projectId: string, input: unknown): Promise<{ ok: true; id: string; meta: AssetMeta } | { ok: false; error: string }> {
  const m = assetMeta.safeParse(input);
  if (!m.success) return fail(first(m.error));
  const uid = await userId(supabase);
  if (!uid) return fail("You are signed out. Sign in again and retry.");
  const prefix = `${uid}/${projectId}/`;
  for (const p of [m.data.storage_path, m.data.display_path]) {
    if (p && (!p.startsWith(prefix) || p.includes(".."))) return fail("That file was not uploaded to this project.");
  }
  for (const p of [m.data.storage_path, m.data.display_path]) {
    if (!p) continue;
    const { error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 30);
    if (error) return fail("The upload did not reach storage, so it was not saved. Try again.");
  }
  const { data, error } = await supabase
    .from("project_assets")
    .insert({ project_id: projectId, storage_bucket: BUCKET, ...m.data })
    .select("id");
  if (error || (data ?? []).length !== 1) {
    await removeObjects(supabase, [m.data.storage_path, m.data.display_path]);
    return fail(error?.message ?? "The file was not saved.");
  }
  return { ok: true, id: data![0].id as string, meta: m.data };
}

/* ------------------------------------------------------------------ plans, drawings, photos */

export async function addProjectFile(projectId: string, input: unknown, title?: string): Promise<ActionResult<{ id: string }>> {
  if (!id.safeParse(projectId).success) return fail("Unknown project.");
  const supabase = await createClient();
  if (!(await ownsProject(supabase, projectId))) return fail("That project no longer exists.");
  const parsedKind = assetMeta.shape.kind.safeParse((input as { kind?: unknown })?.kind);
  if (!parsedKind.success || parsedKind.data === "print_file") return fail("Choose Plan PDF, Drawing, Photo or Other.");
  const reg = await registerAsset(supabase, projectId, input);
  if (!reg.ok) return reg;
  if (reg.meta.kind === "plan_pdf") {
    const { data, error } = await supabase
      .from("project_documents")
      .insert({ project_id: projectId, asset_id: reg.id, title: (title || reg.meta.original_filename).slice(0, 200), doc_kind: "plan" })
      .select("id");
    if (error || (data ?? []).length !== 1) {
      await supabase.from("project_assets").delete().eq("id", reg.id);
      await removeObjects(supabase, [reg.meta.storage_path, reg.meta.display_path]);
      return fail(error?.message ?? "The plan was not saved.");
    }
  }
  await touch(supabase, projectId);
  return { ok: true, data: { id: reg.id } };
}

export async function deleteProjectFile(projectId: string, assetId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(assetId).success) return fail("Unknown file.");
  const supabase = await createClient();
  const { data: a } = await supabase.from("project_assets").select("id,kind,storage_path,display_path").eq("id", assetId).eq("project_id", projectId).maybeSingle();
  if (!a) return fail("That file no longer exists.");
  if (a.kind === "print_file") return fail("Remove print files from their part in the Print Checklist.");
  await supabase.from("project_documents").delete().eq("asset_id", assetId).eq("project_id", projectId);
  const { data, error } = await supabase.from("project_assets").delete().eq("id", assetId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That file no longer exists.");
  await removeObjects(supabase, [a.storage_path, a.display_path]);
  await touch(supabase, projectId);
  return { ok: true };
}

export async function setProjectPhoto(projectId: string, assetId: string | null): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || (assetId !== null && !id.safeParse(assetId).success)) return fail("Unknown file.");
  const supabase = await createClient();
  if (assetId) {
    const { data: a } = await supabase.from("project_assets").select("id,mime_type").eq("id", assetId).eq("project_id", projectId).maybeSingle();
    if (!a || !String(a.mime_type ?? "").startsWith("image/")) return fail("Pick an image from this project.");
  }
  const { data, error } = await supabase.from("projects").update({ thumbnail_asset_id: assetId }).eq("id", projectId).is("deleted_at", null).select("id,thumbnail_asset_id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || (data![0].thumbnail_asset_id ?? null) !== assetId) return fail("The change was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

// Short-lived link for opening or downloading a private file.
export async function getFileUrl(projectId: string, assetId: string, variant: "display" | "original" = "original", asDownload = false): Promise<ActionResult<{ url: string; filename: string; mime: string | null }>> {
  if (!id.safeParse(projectId).success || !id.safeParse(assetId).success) return fail("Unknown file.");
  const supabase = await createClient();
  const { data: a } = await supabase.from("project_assets").select("storage_path,display_path,original_filename,mime_type").eq("id", assetId).eq("project_id", projectId).maybeSingle();
  if (!a) return fail("That file no longer exists.");
  const path = variant === "display" && a.display_path ? a.display_path : a.storage_path;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, asDownload ? { download: a.original_filename } : undefined);
  if (error || !data?.signedUrl) return fail("Could not open that file. Try again.");
  return { ok: true, data: { url: data.signedUrl, filename: a.original_filename, mime: a.mime_type } };
}

/* ------------------------------------------------------------------ print checklist */

const printInput = z.object({
  name: text(160).min(1, "Give the part a name."),
  quantity: z.union([z.string(), z.number()]).optional().transform((v, ctx) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      ctx.addIssue({ code: "custom", message: "Quantity must be a whole number from 1 to 1000." });
      return z.NEVER;
    }
    return n;
  }),
  material: optText(120),
  infill: optText(120),
  supports: optText(120),
  orientation: optText(200),
  notes: optText(2000),
  cut_item_ids: z.array(id).max(200).default([]),
});

export async function savePrintPart(projectId: string, partId: string | null, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || (partId !== null && !id.safeParse(partId).success)) return fail("Unknown part.");
  const p = printInput.safeParse(input);
  if (!p.success) return fail(first(p.error));
  const { cut_item_ids, ...fields } = p.data;
  const supabase = await createClient();

  if (cut_item_ids.length) {
    const { data } = await supabase.from("cut_list_items").select("id").eq("project_id", projectId).in("id", cut_item_ids);
    if ((data ?? []).length !== new Set(cut_item_ids).size) return fail("One of the linked cut pieces is not in this project.");
  }

  let pid = partId;
  if (pid === null) {
    if (!(await ownsProject(supabase, projectId))) return fail("That project no longer exists.");
    const { count } = await supabase.from("print_parts").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    const { data, error } = await supabase.from("print_parts").insert({ project_id: projectId, sort_order: count ?? 0, ...fields }).select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("The part was not saved.");
    pid = data![0].id as string;
  } else {
    const { data, error } = await supabase.from("print_parts").update(fields).eq("id", pid).eq("project_id", projectId).select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("That part no longer exists.");
  }

  const { data: existing, error: exErr } = await supabase.from("print_part_cut_items").select("cut_list_item_id").eq("print_part_id", pid!);
  if (exErr) return fail(`The part was saved but its linked pieces were not: ${exErr.message}`);
  const have = new Set((existing ?? []).map((r) => r.cut_list_item_id as string));
  const want = new Set(cut_item_ids);
  const add = [...want].filter((x) => !have.has(x));
  const drop = [...have].filter((x) => !want.has(x));
  if (add.length) {
    const { error } = await supabase.from("print_part_cut_items").insert(add.map((c) => ({ print_part_id: pid, cut_list_item_id: c })));
    if (error) return fail(`The part was saved but linking pieces failed: ${error.message}`);
  }
  if (drop.length) {
    const { error } = await supabase.from("print_part_cut_items").delete().eq("print_part_id", pid!).in("cut_list_item_id", drop);
    if (error) return fail(`The part was saved but unlinking pieces failed: ${error.message}`);
  }
  await touch(supabase, projectId);
  return { ok: true };
}

export async function setPrintPartDone(projectId: string, partId: string, done: boolean): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(partId).success) return fail("Unknown part.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("print_parts")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", partId)
    .eq("project_id", projectId)
    .select("id,completed_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || Boolean(data![0].completed_at) !== done) return fail("The change was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

// Deleting a part also removes the files uploaded to it (rows and stored objects). Links are just rows.
export async function deletePrintPart(projectId: string, partId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(partId).success) return fail("Unknown part.");
  const supabase = await createClient();
  const { data: files } = await supabase.from("print_files").select("asset_id,project_assets(id,storage_path,display_path)").eq("print_part_id", partId).eq("kind", "upload");
  const { data, error } = await supabase.from("print_parts").delete().eq("id", partId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That part no longer exists.");
  const assets = (files ?? []).flatMap((f) => (Array.isArray(f.project_assets) ? f.project_assets : f.project_assets ? [f.project_assets] : [])) as { id: string; storage_path: string; display_path: string | null }[];
  if (assets.length) {
    await supabase.from("project_assets").delete().in("id", assets.map((a) => a.id));
    await removeObjects(supabase, assets.flatMap((a) => [a.storage_path, a.display_path]));
  }
  await touch(supabase, projectId);
  return { ok: true };
}

export async function addPrintLink(projectId: string, partId: string, input: unknown): Promise<ActionResult> {
  const l = z
    .object({
      url: z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, "Links must start with http:// or https://"),
      filename: optText(160),
    })
    .safeParse(input);
  if (!id.safeParse(projectId).success || !id.safeParse(partId).success) return fail("Unknown part.");
  if (!l.success) return fail(first(l.error));
  const supabase = await createClient();
  const { data: part } = await supabase.from("print_parts").select("id").eq("id", partId).eq("project_id", projectId).maybeSingle();
  if (!part) return fail("That part no longer exists.");
  const { data, error } = await supabase.from("print_files").insert({ print_part_id: partId, kind: "link", url: l.data.url, filename: l.data.filename }).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("The link was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function addPrintUpload(projectId: string, partId: string, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(partId).success) return fail("Unknown part.");
  const supabase = await createClient();
  const { data: part } = await supabase.from("print_parts").select("id").eq("id", partId).eq("project_id", projectId).maybeSingle();
  if (!part) return fail("That part no longer exists.");
  const reg = await registerAsset(supabase, projectId, { ...(input as object), kind: "print_file" });
  if (!reg.ok) return reg;
  const { data, error } = await supabase
    .from("print_files")
    .insert({ print_part_id: partId, kind: "upload", asset_id: reg.id, filename: reg.meta.original_filename })
    .select("id");
  if (error || (data ?? []).length !== 1) {
    await supabase.from("project_assets").delete().eq("id", reg.id);
    await removeObjects(supabase, [reg.meta.storage_path, reg.meta.display_path]);
    return fail(error?.message ?? "The file was not saved.");
  }
  await touch(supabase, projectId);
  return { ok: true };
}

export async function deletePrintFile(projectId: string, fileId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(fileId).success) return fail("Unknown file.");
  const supabase = await createClient();
  const { data: f } = await supabase.from("print_files").select("id,kind,asset_id,print_part_id,print_parts!inner(project_id)").eq("id", fileId).maybeSingle();
  const owner = f && (Array.isArray(f.print_parts) ? f.print_parts[0] : f.print_parts) as { project_id: string } | undefined;
  if (!f || owner?.project_id !== projectId) return fail("That file no longer exists.");
  const { data: asset } = f.asset_id ? await supabase.from("project_assets").select("storage_path,display_path").eq("id", f.asset_id).maybeSingle() : { data: null };
  const { data, error } = await supabase.from("print_files").delete().eq("id", fileId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That file no longer exists.");
  if (f.asset_id) {
    await supabase.from("project_assets").delete().eq("id", f.asset_id);
    await removeObjects(supabase, [asset?.storage_path, asset?.display_path]);
  }
  await touch(supabase, projectId);
  return { ok: true };
}
