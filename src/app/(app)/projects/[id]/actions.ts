"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInch, parseMm } from "@/lib/dimensions";
import { FABRICATION_TYPES } from "@/lib/fabrication";
import type { ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid("Unknown item.");
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().transform((v) => (v ? v : null));
const optUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Links must start with http:// or https://");
const optQty = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      const s = String(v ?? "").trim();
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        ctx.addIssue({ code: "custom", message: `${label} must be a number from 0 up.` });
        return z.NEVER;
      }
      return Math.round(n * 1000) / 1000;
    });

type Supa = Awaited<ReturnType<typeof createClient>>;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

async function touch(supabase: Supa, projectId: string) {
  // Keep "recently updated" ordering honest. Best effort: never fails the action that already succeeded.
  await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

async function ownsProject(supabase: Supa, projectId: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  return Boolean(data);
}

// Swap an item with its neighbour inside one ordered group. Renumbers the group so ties never block a move.
async function reorder(supabase: Supa, table: "build_steps" | "build_phases", ids: string[], target: string, dir: "up" | "down") {
  const from = ids.indexOf(target);
  const to = dir === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  const results = await Promise.all(next.map((rid, i) => supabase.from(table).update({ sort_order: i }).eq("id", rid).select("id")));
  const bad = results.find((r) => r.error || (r.data ?? []).length !== 1);
  return bad ? (bad.error?.message ?? "Could not save the new order.") : null;
}

/* ------------------------------------------------------------------ project */

const projectEdit = z.object({
  name: text(120).min(1, "Give the project a name."),
  description: optText(2000),
  status: z.enum(["planning", "in_progress", "completed", "archived"]),
});

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  const pid = id.safeParse(projectId);
  const p = projectEdit.safeParse(input);
  if (!pid.success) return fail("Unknown project.");
  if (!p.success) return fail(first(p.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").update(p.data).eq("id", projectId).is("deleted_at", null).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That project no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

/* ------------------------------------------------------------------ assemblies */

const assemblyInput = z.object({ name: text(80).min(1, "Give the assembly a name."), fabrication_type: z.enum(FABRICATION_TYPES) });

export async function addAssembly(projectId: string, input: unknown): Promise<ActionResult> {
  const a = assemblyInput.safeParse(input);
  if (!id.safeParse(projectId).success) return fail("Unknown project.");
  if (!a.success) return fail(first(a.error));
  const supabase = await createClient();
  if (!(await ownsProject(supabase, projectId))) return fail("That project no longer exists.");
  const { count } = await supabase.from("assemblies").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { data, error } = await supabase
    .from("assemblies")
    .insert({ project_id: projectId, sort_order: count ?? 0, ...a.data })
    .select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("The assembly was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function renameAssembly(projectId: string, assemblyId: string, input: unknown): Promise<ActionResult> {
  const a = assemblyInput.safeParse(input);
  if (!id.safeParse(projectId).success || !id.safeParse(assemblyId).success) return fail("Unknown assembly.");
  if (!a.success) return fail(first(a.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("assemblies").update(a.data).eq("id", assemblyId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That assembly no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

// Removes the assembly and every cut piece in it (cascade). The UI states the piece count before asking.
export async function deleteAssembly(projectId: string, assemblyId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(assemblyId).success) return fail("Unknown assembly.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("assemblies").delete().eq("id", assemblyId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That assembly no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

/* ------------------------------------------------------------------ hardware */

const hardwareInput = z
  .object({
    name: text(160).min(1, "Give the hardware a name."),
    quantity_required: optQty("Quantity needed"),
    quantity_acquired: optQty("Quantity on hand"),
    notes: optText(1000),
    product_url: optUrl,
  });

export async function addHardware(projectId: string, input: unknown): Promise<ActionResult> {
  const h = hardwareInput.safeParse(input);
  if (!id.safeParse(projectId).success) return fail("Unknown project.");
  if (!h.success) return fail(first(h.error));
  const supabase = await createClient();
  if (!(await ownsProject(supabase, projectId))) return fail("That project no longer exists.");
  const { count } = await supabase.from("hardware_items").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { data, error } = await supabase
    .from("hardware_items")
    .insert({ project_id: projectId, sort_order: count ?? 0, ...h.data })
    .select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("The hardware was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function updateHardware(projectId: string, itemId: string, input: unknown): Promise<ActionResult> {
  const h = hardwareInput.safeParse(input);
  if (!id.safeParse(projectId).success || !id.safeParse(itemId).success) return fail("Unknown item.");
  if (!h.success) return fail(first(h.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("hardware_items").update(h.data).eq("id", itemId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That item no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function setHardwareReady(projectId: string, itemId: string, ready: boolean): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(itemId).success) return fail("Unknown item.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hardware_items")
    .update({ is_ready: ready })
    .eq("id", itemId)
    .eq("project_id", projectId)
    .select("id,is_ready");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || data![0].is_ready !== ready) return fail("The change was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function deleteHardware(projectId: string, itemId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(itemId).success) return fail("Unknown item.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("hardware_items").delete().eq("id", itemId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That item no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

/* ------------------------------------------------------------------ cut list */

const dimInput = z.object({
  id: z.string().uuid().optional(),
  label: text(40),
  mm: z.string().optional(),
  inch: z.string().optional(),
});
const cutInput = z.object({
  assembly_id: id,
  name: text(160).min(1, "Give the piece a name."),
  material: optText(160),
  quantity: z.coerce.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(1000, "Quantity can be at most 1000."),
  fabrication_note: optText(1000),
  product_url: optUrl,
  dims: z.array(dimInput).max(12, "Use at most 12 dimensions per piece."),
});

type CleanDim = { id?: string; label: string; mm: number | null; inch: number | null; sort_order: number };

function cleanDims(dims: z.infer<typeof dimInput>[]): { ok: true; dims: CleanDim[] } | { ok: false; error: string } {
  const out: CleanDim[] = [];
  for (const d of dims) {
    const label = d.label || "length";
    const mm = parseMm(d.mm);
    const inch = parseInch(d.inch);
    if (!mm.ok) return { ok: false, error: `${label}: ${mm.error}` };
    if (!inch.ok) return { ok: false, error: `${label}: ${inch.error}` };
    if (mm.value === null && inch.value === null) continue; // empty row — nothing to store
    out.push({ id: d.id, label, mm: mm.value, inch: inch.value, sort_order: out.length });
  }
  return { ok: true, dims: out };
}

export async function saveCutItem(projectId: string, itemId: string | null, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || (itemId !== null && !id.safeParse(itemId).success)) return fail("Unknown piece.");
  const c = cutInput.safeParse(input);
  if (!c.success) return fail(first(c.error));
  const dims = cleanDims(c.data.dims);
  if (!dims.ok) return fail(dims.error);
  const { dims: _ignored, ...fields } = c.data;
  void _ignored;

  const supabase = await createClient();
  const { data: asm } = await supabase.from("assemblies").select("id").eq("id", fields.assembly_id).eq("project_id", projectId).maybeSingle();
  if (!asm) return fail("Pick an assembly that belongs to this project.");

  let cutId = itemId;
  if (itemId === null) {
    const { count } = await supabase.from("cut_list_items").select("id", { count: "exact", head: true }).eq("assembly_id", fields.assembly_id);
    const { data, error } = await supabase
      .from("cut_list_items")
      .insert({ project_id: projectId, sort_order: count ?? 0, ...fields })
      .select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("The piece was not saved.");
    cutId = data![0].id;
  } else {
    const { data, error } = await supabase
      .from("cut_list_items")
      .update({ ...fields, needs_review: false, review_note: null })
      .eq("id", itemId)
      .eq("project_id", projectId)
      .select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("That piece no longer exists.");
  }

  // Dimensions: update the rows that still exist, add new ones, then remove the ones the form dropped.
  const keep = dims.dims.filter((d) => d.id).map((d) => d.id as string);
  const { data: existing, error: exErr } = await supabase.from("cut_item_dimensions").select("id").eq("cut_list_item_id", cutId!);
  if (exErr) return fail(`The piece was saved but its dimensions were not: ${exErr.message}`);
  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  for (const d of dims.dims) {
    const row = { label: d.label, mm: d.mm, inch: d.inch, sort_order: d.sort_order };
    const res =
      d.id && existingIds.has(d.id)
        ? await supabase.from("cut_item_dimensions").update(row).eq("id", d.id).select("id")
        : await supabase.from("cut_item_dimensions").insert({ cut_list_item_id: cutId, ...row }).select("id");
    if (res.error || (res.data ?? []).length !== 1) return fail(`The piece was saved but a dimension was not: ${res.error?.message ?? "no row written"}`);
  }
  const drop = [...existingIds].filter((x) => !keep.includes(x));
  if (drop.length) {
    const { error } = await supabase.from("cut_item_dimensions").delete().in("id", drop);
    if (error) return fail(`The piece was saved but old dimensions were not removed: ${error.message}`);
  }
  await touch(supabase, projectId);
  return { ok: true };
}

export async function deleteCutItem(projectId: string, itemId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(itemId).success) return fail("Unknown piece.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("cut_list_items").delete().eq("id", itemId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That piece no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

// Complete or reopen individual cut units. Each unit is its own row, so units finish independently.
export async function setCutUnits(projectId: string, unitIds: string[], done: boolean): Promise<ActionResult> {
  const ids = z.array(id).min(1).max(1000).safeParse(unitIds);
  if (!id.safeParse(projectId).success || !ids.success) return fail("Unknown unit.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cut_units")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .in("id", ids.data)
    .select("id,completed_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== ids.data.length || (data ?? []).some((r) => Boolean(r.completed_at) !== done)) return fail("The change was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

/* ------------------------------------------------------------------ build steps */

export async function addPhase(projectId: string, name: unknown): Promise<ActionResult> {
  const n = text(120).min(1, "Give the phase a name.").safeParse(name);
  if (!id.safeParse(projectId).success) return fail("Unknown project.");
  if (!n.success) return fail(first(n.error));
  const supabase = await createClient();
  if (!(await ownsProject(supabase, projectId))) return fail("That project no longer exists.");
  const { count } = await supabase.from("build_phases").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { data, error } = await supabase.from("build_phases").insert({ project_id: projectId, name: n.data, sort_order: count ?? 0 }).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("The phase was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function renamePhase(projectId: string, phaseId: string, name: unknown): Promise<ActionResult> {
  const n = text(120).min(1, "Give the phase a name.").safeParse(name);
  if (!id.safeParse(projectId).success || !id.safeParse(phaseId).success) return fail("Unknown phase.");
  if (!n.success) return fail(first(n.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("build_phases").update({ name: n.data }).eq("id", phaseId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That phase no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

// Deleting a phase keeps its steps; they move to "No phase".
export async function deletePhase(projectId: string, phaseId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(phaseId).success) return fail("Unknown phase.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("build_phases").delete().eq("id", phaseId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That phase no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function movePhase(projectId: string, phaseId: string, dir: "up" | "down"): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(phaseId).success) return fail("Unknown phase.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("build_phases").select("id").eq("project_id", projectId).order("sort_order").order("created_at");
  if (error) return fail(error.message);
  const err = await reorder(supabase, "build_phases", (data ?? []).map((r) => r.id as string), phaseId, dir);
  if (err) return fail(err);
  await touch(supabase, projectId);
  return { ok: true };
}

const stepInput = z.object({
  title: text(200).min(1, "Give the step a title."),
  instructions: optText(4000),
  phase_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
});

export async function saveStep(projectId: string, stepId: string | null, input: unknown): Promise<ActionResult> {
  const s = stepInput.safeParse(input);
  if (!id.safeParse(projectId).success || (stepId !== null && !id.safeParse(stepId).success)) return fail("Unknown step.");
  if (!s.success) return fail(first(s.error));
  const supabase = await createClient();
  if (s.data.phase_id) {
    const { data: ph } = await supabase.from("build_phases").select("id").eq("id", s.data.phase_id).eq("project_id", projectId).maybeSingle();
    if (!ph) return fail("Pick a phase that belongs to this project.");
  }
  if (stepId === null) {
    if (!(await ownsProject(supabase, projectId))) return fail("That project no longer exists.");
    const { count } = await supabase.from("build_steps").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    const { data, error } = await supabase.from("build_steps").insert({ project_id: projectId, sort_order: count ?? 0, ...s.data }).select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("The step was not saved.");
  } else {
    const { data, error } = await supabase.from("build_steps").update(s.data).eq("id", stepId).eq("project_id", projectId).select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("That step no longer exists.");
  }
  await touch(supabase, projectId);
  return { ok: true };
}

export async function setStepDone(projectId: string, stepId: string, done: boolean): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(stepId).success) return fail("Unknown step.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("build_steps")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", stepId)
    .eq("project_id", projectId)
    .select("id,completed_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || Boolean(data![0].completed_at) !== done) return fail("The change was not saved.");
  await touch(supabase, projectId);
  return { ok: true };
}

export async function deleteStep(projectId: string, stepId: string): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(stepId).success) return fail("Unknown step.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("build_steps").delete().eq("id", stepId).eq("project_id", projectId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That step no longer exists.");
  await touch(supabase, projectId);
  return { ok: true };
}

// Moves a step up or down within its phase (or within "No phase").
export async function moveStep(projectId: string, stepId: string, dir: "up" | "down"): Promise<ActionResult> {
  if (!id.safeParse(projectId).success || !id.safeParse(stepId).success) return fail("Unknown step.");
  const supabase = await createClient();
  const { data: me } = await supabase.from("build_steps").select("phase_id").eq("id", stepId).eq("project_id", projectId).maybeSingle();
  if (!me) return fail("That step no longer exists.");
  let q = supabase.from("build_steps").select("id").eq("project_id", projectId).order("sort_order").order("created_at");
  q = me.phase_id ? q.eq("phase_id", me.phase_id) : q.is("phase_id", null);
  const { data, error } = await q;
  if (error) return fail(error.message);
  const err = await reorder(supabase, "build_steps", (data ?? []).map((r) => r.id as string), stepId, dir);
  if (err) return fail(err);
  await touch(supabase, projectId);
  return { ok: true };
}
