"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { judge, parseReading, type CriteriaSnapshot, type ProcedureDef } from "@/lib/testing";
import type { ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid("Unknown item.");
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().nullable().transform((v) => (v ? v : null));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

function refresh(opts: { componentId?: string | null; procedureId?: string; runId?: string } = {}) {
  revalidatePath("/electronics/test-bench");
  revalidatePath("/electronics/history");
  revalidatePath("/electronics/inventory");
  if (opts.componentId) revalidatePath(`/electronics/inventory/${opts.componentId}`);
  if (opts.procedureId) revalidatePath(`/electronics/test-bench/${opts.procedureId}`);
  if (opts.runId) revalidatePath(`/electronics/history/${opts.runId}`);
}

const num = (label: string, min = 0, max = 1_000_000) =>
  z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} must be a number from ${min} to ${max}.` });
      return z.NEVER;
    }
    return n;
  });
const signed = (label: string) => num(label, -1_000_000, 1_000_000);

/* ------------------------------------------------------------------ procedures */

const stepInput = z.object({
  instruction: text(1000).min(1, "Every step needs an instruction."),
  measurement: z
    .object({ label: optText(120), unit: optText(20), expected_min: signed("Expected minimum"), expected_max: signed("Expected maximum") })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

const definitionInput = z.object({
  equipment: z.array(text(200).min(1)).max(30).default([]),
  wiring: z.array(z.object({ pin: text(60).min(1, "Each wiring row needs a pin or connection."), connects_to: text(120).min(1, "Each wiring row needs a destination.") })).max(40).default([]),
  supply_min: num("Supply voltage minimum", 0, 9999),
  supply_max: num("Supply voltage maximum", 0, 9999),
  logic_level: num("Logic level", 0, 9999),
  steps: z.array(stepInput).min(1, "Add at least one step.").max(60),
  evaluation_rules: optText(2000),
  troubleshooting: optText(3000),
});

function buildDefinition(d: z.infer<typeof definitionInput>): { ok: true; def: ProcedureDef } | { ok: false; error: string } {
  if (d.supply_min !== null && d.supply_max !== null && d.supply_min > d.supply_max) return { ok: false, error: "Supply voltage minimum is higher than the maximum." };
  const steps: ProcedureDef["steps"] = [];
  for (const [i, s] of d.steps.entries()) {
    const n = i + 1;
    const m = s.measurement;
    const hasMeasurement = m && (m.label || m.unit || m.expected_min !== null || m.expected_max !== null);
    if (m && hasMeasurement && !m.label) return { ok: false, error: `Step ${n}: give the reading a name (for example "Output voltage").` };
    if (m && m.expected_min !== null && m.expected_max !== null && m.expected_min > m.expected_max) return { ok: false, error: `Step ${n}: the expected minimum is higher than the maximum.` };
    steps.push({ n, instruction: s.instruction, measurement: hasMeasurement && m ? { key: `step${n}`, label: m.label, unit: m.unit, expected_min: m.expected_min, expected_max: m.expected_max } : null });
  }
  return {
    ok: true,
    def: {
      equipment: d.equipment,
      wiring: d.wiring,
      supply_voltage: d.supply_min !== null || d.supply_max !== null ? { min: d.supply_min, max: d.supply_max } : null,
      logic_level_voltage: d.logic_level,
      steps,
      evaluation_rules: d.evaluation_rules,
      troubleshooting: d.troubleshooting,
    },
  };
}

const procedureInput = z.object({
  name: text(160).min(1, "Give the procedure a name."),
  component_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  supported_variant: optText(120),
  verified: z.boolean().default(false),
  change_note: optText(500),
  definition: definitionInput,
});

export async function createProcedure(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = procedureInput.safeParse(input);
  if (!p.success) return fail(first(p.error));
  const built = buildDefinition(p.data.definition);
  if (!built.ok) return fail(built.error);
  const supabase = await createClient();
  if (p.data.component_id) {
    const { data: comp } = await supabase.from("electronic_components").select("id").eq("id", p.data.component_id).maybeSingle();
    if (!comp) return fail("That component no longer exists.");
  }
  const { data: proc, error } = await supabase.from("test_procedures").insert({ name: p.data.name, component_id: p.data.component_id, supported_variant: p.data.supported_variant }).select("id");
  if (error || (proc ?? []).length !== 1) return fail(error?.message ?? "The procedure was not saved.");
  const procId = proc![0].id as string;
  const { data: ver, error: vErr } = await supabase
    .from("test_procedure_versions")
    .insert({ procedure_id: procId, version: 1, definition: built.def, verified: p.data.verified, execution_mode: "manual_only", change_note: p.data.change_note ?? "First version" })
    .select("id");
  if (vErr || (ver ?? []).length !== 1) {
    await supabase.from("test_procedures").delete().eq("id", procId); // nothing else references it yet
    return fail(vErr?.message ?? "The procedure was not saved.");
  }
  const { data: upd, error: uErr } = await supabase.from("test_procedures").update({ current_version_id: ver![0].id }).eq("id", procId).select("id,current_version_id");
  if (uErr || (upd ?? []).length !== 1 || upd![0].current_version_id !== ver![0].id) return fail(uErr?.message ?? "The procedure was saved but its first version could not be set as current. Open it from the list and try again.");
  refresh({ componentId: p.data.component_id, procedureId: procId });
  return { ok: true, data: { id: procId } };
}

// Editing never changes an old version: it adds version N+1, and every earlier run keeps its own snapshot.
export async function addProcedureVersion(procedureId: string, input: unknown): Promise<ActionResult<{ version: number }>> {
  if (!id.safeParse(procedureId).success) return fail("Unknown procedure.");
  const p = procedureInput.omit({ component_id: true }).safeParse(input);
  if (!p.success) return fail(first(p.error));
  const built = buildDefinition(p.data.definition);
  if (!built.ok) return fail(built.error);
  const supabase = await createClient();
  const { data: proc } = await supabase.from("test_procedures").select("id,component_id,archived_at").eq("id", procedureId).maybeSingle();
  if (!proc) return fail("That procedure no longer exists.");
  if (proc.archived_at) return fail("Restore this procedure before adding a version.");
  const { data: latest } = await supabase.from("test_procedure_versions").select("version").eq("procedure_id", procedureId).order("version", { ascending: false }).limit(1);
  const next = ((latest ?? [])[0]?.version ?? 0) + 1;
  const { data: ver, error } = await supabase
    .from("test_procedure_versions")
    .insert({ procedure_id: procedureId, version: next, definition: built.def, verified: p.data.verified, execution_mode: "manual_only", change_note: p.data.change_note })
    .select("id,version");
  if (error) return fail(error.code === "23505" ? "Someone saved a new version at the same moment. Reload and try again." : error.message);
  if ((ver ?? []).length !== 1) return fail("The new version was not saved.");
  const { data: upd, error: uErr } = await supabase
    .from("test_procedures")
    .update({ name: p.data.name, supported_variant: p.data.supported_variant, current_version_id: ver![0].id })
    .eq("id", procedureId)
    .select("id,current_version_id");
  if (uErr || (upd ?? []).length !== 1 || upd![0].current_version_id !== ver![0].id) return fail(uErr?.message ?? "Version saved but it could not be made current. Reload and check.");
  refresh({ componentId: proc.component_id, procedureId });
  return { ok: true, data: { version: next } };
}

export async function setProcedureArchived(procedureId: string, archived: boolean, typedName?: string): Promise<ActionResult> {
  if (!id.safeParse(procedureId).success) return fail("Unknown procedure.");
  const supabase = await createClient();
  const { data: proc } = await supabase.from("test_procedures").select("id,name,component_id").eq("id", procedureId).maybeSingle();
  if (!proc) return fail("That procedure no longer exists.");
  if (archived && (typedName ?? "").trim() !== String(proc.name).trim()) return fail("The name you typed does not match.");
  const { data, error } = await supabase.from("test_procedures").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", procedureId).select("id,archived_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || Boolean(data![0].archived_at) !== archived) return fail("The change was not saved.");
  refresh({ componentId: proc.component_id, procedureId });
  return { ok: true };
}

/* ------------------------------------------------------------------ recording a manual run */

const runInput = z.object({
  component_id: id,
  unit_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  version_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  outcome: z.enum(["passed", "failed", "inconclusive"], { message: "Choose Passed, Failed or Inconclusive." }),
  notes: optText(2000),
  troubleshooting_notes: optText(2000),
  steps_done: z.array(z.number().int().min(1).max(60)).max(60).default([]),
  readings: z
    .array(z.object({ step: z.number().int().min(1).max(60).nullable().optional().transform((v) => v ?? null), label: optText(120), unit: optText(20), value: text(200), expected_min: signed("Expected minimum"), expected_max: signed("Expected maximum") }))
    .max(80)
    .default([]),
});

export async function recordTestRun(input: unknown): Promise<ActionResult<{ id: string; status: string }>> {
  const p = runInput.safeParse(input);
  if (!p.success) return fail(first(p.error));
  const d = p.data;
  const supabase = await createClient();

  const { data: comp } = await supabase.from("electronic_components").select("id,name,track_individual_units,archived_at").eq("id", d.component_id).maybeSingle();
  if (!comp) return fail("That component no longer exists.");
  if (comp.archived_at) return fail("Restore this component before recording a test.");
  if (comp.track_individual_units && !d.unit_id) return fail("This component is tracked unit by unit. Choose which unit you tested.");
  if (d.unit_id) {
    const { data: unit } = await supabase.from("component_units").select("id,retired_at").eq("id", d.unit_id).eq("component_id", d.component_id).maybeSingle();
    if (!unit) return fail("That unit does not belong to this component.");
    if (unit.retired_at) return fail("That unit is retired.");
  }

  // The procedure version, if any, decides the criteria. The browser's copy of the ranges is never trusted.
  let def: ProcedureDef | null = null;
  let snapshot: CriteriaSnapshot = { procedure_name: null, version: null, verified: null, definition: null, steps_done: [] };
  let versionNumber: number | null = null;
  if (d.version_id) {
    const { data: ver } = await supabase.from("test_procedure_versions").select("id,procedure_id,version,verified,definition").eq("id", d.version_id).maybeSingle();
    if (!ver) return fail("That procedure version no longer exists.");
    const { data: proc } = await supabase.from("test_procedures").select("name,component_id,archived_at").eq("id", ver.procedure_id).maybeSingle();
    if (!proc) return fail("That procedure no longer exists.");
    if (proc.archived_at) return fail("That procedure is archived. Restore it to run it.");
    if (proc.component_id && proc.component_id !== d.component_id) return fail("That procedure is for a different component.");
    def = ver.definition as ProcedureDef;
    versionNumber = ver.version as number;
    const done = [...new Set(d.steps_done)].filter((n) => def!.steps.some((s) => s.n === n)).sort((a, b) => a - b);
    snapshot = { procedure_name: proc.name as string, version: versionNumber, verified: Boolean(ver.verified), definition: def, steps_done: done };
  }

  type M = { key: string; label: string | null; unit: string | null; value_numeric: number | null; value_text: string | null; expected_min: number | null; expected_max: number | null; passed: boolean | null };
  const measurements: M[] = [];
  const missing: string[] = [];
  if (def) {
    for (const s of def.steps) {
      if (!s.measurement) continue;
      const r = d.readings.find((x) => x.step === s.n);
      const parsed = parseReading(r?.value ?? "");
      if (parsed.numeric === null && parsed.text === null) { missing.push(`step ${s.n}`); continue; }
      const m = s.measurement;
      measurements.push({ key: m.key, label: m.label, unit: m.unit, value_numeric: parsed.numeric, value_text: parsed.text, expected_min: m.expected_min, expected_max: m.expected_max, passed: judge(parsed.numeric, m.expected_min, m.expected_max) });
    }
  }
  d.readings.filter((r) => r.step === null).forEach((r, i) => {
    const parsed = parseReading(r.value);
    if (parsed.numeric === null && parsed.text === null) return;
    measurements.push({ key: `extra${i + 1}`, label: r.label, unit: r.unit, value_numeric: parsed.numeric, value_text: parsed.text, expected_min: r.expected_min, expected_max: r.expected_max, passed: judge(parsed.numeric, r.expected_min, r.expected_max) });
  });

  if (d.outcome === "passed") {
    if (def && snapshot.steps_done.length !== def.steps.length) return fail("Tick every step before recording Passed. If you could not finish, record Inconclusive.");
    if (missing.length) return fail(`Enter the reading for ${missing.join(", ")} before recording Passed.`);
    if (measurements.some((m) => m.passed === false)) return fail("A reading is outside its expected range, so this cannot be recorded as Passed. Record Failed or Inconclusive.");
    if (!def && measurements.length === 0 && !d.notes) return fail("Add a reading or a note describing what you checked.");
  }

  const { data: run, error } = await supabase
    .from("test_runs")
    .insert({
      component_id: d.component_id,
      unit_id: d.unit_id,
      procedure_version_id: d.version_id,
      procedure_version_number: versionNumber,
      criteria_snapshot: snapshot,
      source: "manual",
      outcome: d.outcome,
      notes: d.notes,
      troubleshooting_notes: d.troubleshooting_notes,
    })
    .select("id,outcome");
  if (error || (run ?? []).length !== 1) return fail(error?.message ?? "The test was not saved.");
  const runId = run![0].id as string;

  if (measurements.length) {
    const { data: ms, error: mErr } = await supabase.from("test_measurements").insert(measurements.map((m) => ({ ...m, test_run_id: runId, source: "user_entered" }))).select("id");
    // Test history is append-only, so a half-saved run cannot be rolled back. Say so plainly.
    if (mErr || (ms ?? []).length !== measurements.length) {
      refresh({ componentId: d.component_id, runId });
      return fail(`The run was saved, but its readings were not (${mErr?.message ?? "not all saved"}). Open Test History to see it. History cannot be edited, so record a new run with the readings.`);
    }
  }

  // Read the component back: the status shown must be the one the database holds.
  const { data: after } = await supabase.from("electronic_components").select("test_status").eq("id", d.component_id).maybeSingle();
  refresh({ componentId: d.component_id, procedureId: undefined, runId });
  if (d.version_id) revalidatePath("/electronics/test-bench", "layout");
  return { ok: true, data: { id: runId, status: String(after?.test_status ?? d.outcome) } };
}

/* ------------------------------------------------------------------ individual units */

export async function addUnit(componentId: string, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(componentId).success) return fail("Unknown component.");
  const p = z.object({ label: text(80).min(1, "Give the unit a label, such as a serial number or 'unit 3'."), notes: optText(500) }).safeParse(input);
  if (!p.success) return fail(first(p.error));
  const supabase = await createClient();
  const { data: comp } = await supabase.from("electronic_components").select("id,track_individual_units").eq("id", componentId).maybeSingle();
  if (!comp) return fail("That component no longer exists.");
  if (!comp.track_individual_units) return fail("Turn on 'track individual units' for this component first.");
  const { data: existing } = await supabase.from("component_units").select("label").eq("component_id", componentId);
  if ((existing ?? []).some((u) => String(u.label).trim().toLowerCase() === p.data.label.toLowerCase())) return fail("A unit with that label already exists for this component.");
  const { data, error } = await supabase.from("component_units").insert({ component_id: componentId, label: p.data.label, notes: p.data.notes }).select("id");
  if (error) return fail(error.code === "23505" ? "A unit with that label already exists for this component." : error.message);
  if ((data ?? []).length !== 1) return fail("The unit was not saved.");
  refresh({ componentId });
  return { ok: true };
}

export async function setUnitRetired(componentId: string, unitId: string, retired: boolean): Promise<ActionResult> {
  if (!id.safeParse(componentId).success || !id.safeParse(unitId).success) return fail("Unknown unit.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("component_units").update({ retired_at: retired ? new Date().toISOString() : null }).eq("id", unitId).eq("component_id", componentId).select("id,retired_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || Boolean(data![0].retired_at) !== retired) return fail("The change was not saved.");
  refresh({ componentId });
  return { ok: true };
}
