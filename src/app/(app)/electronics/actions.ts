"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONDITIONS, LOCATION_KINDS, type Condition } from "@/lib/electronics";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import type { ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid("Unknown item.");
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().transform((v) => (v ? v : null));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";
type Supa = Awaited<ReturnType<typeof createClient>>;

const BUCKET = "component-files";

function refresh(componentId?: string) {
  revalidatePath("/electronics/inventory");
  revalidatePath("/electronics/locations");
  if (componentId) revalidatePath(`/electronics/inventory/${componentId}`);
}

const optInt = (label: string, min = 0, max = 1_000_000) =>
  z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} must be a whole number from ${min} to ${max}.` });
      return z.NEVER;
    }
    return n;
  });
const optVolts = (label: string) =>
  z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      ctx.addIssue({ code: "custom", message: `${label} must be a voltage like 3.3 or 5.` });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const nullableId = z.string().uuid().nullable().optional().transform((v) => v ?? null);

/* ------------------------------------------------------------------ categories */

const STANDARD_CATEGORIES = [
  "Sensors", "Microcontrollers & dev boards", "Integrated circuits", "Resistors, capacitors, diodes & transistors",
  "LEDs & displays", "Motors, servos & actuators", "Communication modules", "Connectors, wires & breadboard accessories",
  "Power supplies & power management", "Other",
];

export async function ensureDefaultCategories(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: have } = await supabase.from("component_categories").select("name");
  const names = new Set((have ?? []).map((c) => String(c.name).toLowerCase()));
  const rows = STANDARD_CATEGORIES.filter((n) => !names.has(n.toLowerCase())).map((name, i) => ({ name, sort_order: i + 1 }));
  if (rows.length) {
    const { error } = await supabase.from("component_categories").insert(rows);
    if (error) return fail(error.message);
  }
  refresh();
  return { ok: true };
}

export async function addCategory(name: unknown): Promise<ActionResult<{ id: string }>> {
  const n = text(80).min(1, "Give the category a name.").safeParse(name);
  if (!n.success) return fail(first(n.error));
  const supabase = await createClient();
  const { count } = await supabase.from("component_categories").select("id", { count: "exact", head: true });
  const { data, error } = await supabase.from("component_categories").insert({ name: n.data, is_custom: true, sort_order: (count ?? 0) + 1 }).select("id");
  if (error) return fail(error.code === "23505" ? "You already have a category with that name." : error.message);
  if ((data ?? []).length !== 1) return fail("The category was not saved.");
  refresh();
  return { ok: true, data: { id: data![0].id as string } };
}

/* ------------------------------------------------------------------ components */

const componentInput = z
  .object({
    name: text(160).min(1, "Give the component a name."),
    category_id: nullableId,
    manufacturer: optText(120),
    part_number: optText(120),
    variant: optText(120),
    description: optText(2000),
    notes: optText(4000),
    min_stock_threshold: optInt("Low-stock level"),
    condition: z.enum(CONDITIONS).default("unknown"),
    storage_location_id: nullableId,
    operating_voltage_min: optVolts("Minimum voltage"),
    operating_voltage_max: optVolts("Maximum voltage"),
    logic_level_voltage: optVolts("Logic level"),
    interfaces: z.array(text(30).min(1)).max(20).default([]),
    specs: z.array(z.object({ key: text(60), value: text(300) })).max(40).default([]),
    unverified: z.array(text(80)).max(80).default([]),
    retest_interval_days: optInt("Retest interval", 1, 3650),
    track_individual_units: z.boolean().default(false),
    quantity: optInt("Starting quantity", 0, 1_000_000),
  })
  .refine((v) => v.operating_voltage_min === null || v.operating_voltage_max === null || v.operating_voltage_min <= v.operating_voltage_max, {
    message: "Minimum voltage cannot be higher than maximum voltage.",
    path: ["operating_voltage_min"],
  });

function shapeComponent(c: z.infer<typeof componentInput>) {
  const specs: Record<string, string> = {};
  for (const s of c.specs) if (s.key && s.value) specs[s.key] = s.value;
  // A field is "unverified" unless the user ticked that they checked it against documentation. Only fields that have a value count.
  const has = new Set<string>();
  if (c.operating_voltage_min !== null || c.operating_voltage_max !== null) has.add("operating_voltage");
  if (c.logic_level_voltage !== null) has.add("logic_level_voltage");
  for (const k of Object.keys(specs)) has.add(`spec:${k}`);
  const unverified = c.unverified.filter((u) => has.has(u));
  const { specs: _s, unverified: _u, quantity: _q, ...rest } = c;
  void _s; void _u; void _q;
  return { ...rest, specs, unverified_fields: unverified };
}

export async function saveComponent(componentId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (componentId !== null && !id.safeParse(componentId).success) return fail("Unknown component.");
  const p = componentInput.safeParse(input);
  if (!p.success) return fail(first(p.error));
  const supabase = await createClient();
  const row = shapeComponent(p.data);

  if (componentId === null) {
    const { data, error } = await supabase.from("electronic_components").insert(row).select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("The component was not saved.");
    const newId = data![0].id as string;
    const qty = p.data.quantity ?? 0;
    if (qty > 0) {
      const { error: mErr } = await supabase.from("component_stock_movements").insert({ component_id: newId, movement_type: "initial", quantity_delta: qty, reason: "Starting stock" });
      if (mErr) {
        await supabase.from("electronic_components").delete().eq("id", newId);
        return fail(`The component was not saved because its starting stock could not be recorded: ${mErr.message}`);
      }
    }
    refresh(newId);
    return { ok: true, data: { id: newId } };
  }
  const { data, error } = await supabase.from("electronic_components").update(row).eq("id", componentId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That component no longer exists.");
  refresh(componentId);
  return { ok: true, data: { id: componentId } };
}

// "Delete" for components is an archive: stock history and test history must stay readable.
export async function archiveComponent(componentId: string, typedName: string): Promise<ActionResult> {
  if (!id.safeParse(componentId).success) return fail("Unknown component.");
  const supabase = await createClient();
  const { data: c } = await supabase.from("electronic_components").select("name").eq("id", componentId).is("archived_at", null).maybeSingle();
  if (!c) return fail("That component no longer exists.");
  if (String(c.name).trim() !== typedName.trim()) return fail("The name you typed does not match the component.");
  const { data, error } = await supabase.from("electronic_components").update({ archived_at: new Date().toISOString() }).eq("id", componentId).select("id,archived_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || !data![0].archived_at) return fail("The component was not archived.");
  refresh(componentId);
  return { ok: true };
}

export async function restoreComponent(componentId: string): Promise<ActionResult> {
  if (!id.safeParse(componentId).success) return fail("Unknown component.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("electronic_components").update({ archived_at: null }).eq("id", componentId).select("id,archived_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || data![0].archived_at) return fail("The component was not restored.");
  refresh(componentId);
  return { ok: true };
}

/* ------------------------------------------------------------------ stock movements (the only way quantity changes) */

const movementInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addition"), quantity: z.coerce.number().int().min(1, "Enter how many to add.").max(1_000_000), reason: optText(300) }),
  z.object({ type: z.literal("consumption"), quantity: z.coerce.number().int().min(1, "Enter how many were used.").max(1_000_000), reason: optText(300) }),
  z.object({ type: z.literal("adjustment"), counted: z.coerce.number().int().min(0, "The counted quantity cannot be negative.").max(1_000_000), reason: text(300).min(1, "Say why the count changed.") }),
]);

export async function recordMovement(componentId: string, input: unknown): Promise<ActionResult<{ quantityAfter: number }>> {
  if (!id.safeParse(componentId).success) return fail("Unknown component.");
  const m = movementInput.safeParse(input);
  if (!m.success) return fail(first(m.error));
  const supabase = await createClient();
  const { data: c } = await supabase.from("electronic_components").select("id,quantity_on_hand,archived_at").eq("id", componentId).maybeSingle();
  if (!c) return fail("That component no longer exists.");
  if (c.archived_at) return fail("Restore this component before changing its stock.");

  let delta: number, reason: string | null;
  if (m.data.type === "addition") { delta = m.data.quantity; reason = m.data.reason ?? "Stock added"; }
  else if (m.data.type === "consumption") {
    delta = -m.data.quantity; reason = m.data.reason ?? "Used";
    if (m.data.quantity > c.quantity_on_hand) return fail(`Only ${c.quantity_on_hand} on hand, so ${m.data.quantity} cannot be used.`);
  } else {
    delta = m.data.counted - c.quantity_on_hand; reason = m.data.reason;
    if (delta === 0) return fail("That matches the quantity already recorded, so nothing was changed.");
  }
  const { data, error } = await supabase
    .from("component_stock_movements")
    .insert({ component_id: componentId, movement_type: m.data.type, quantity_delta: delta, reason })
    .select("id,quantity_after");
  if (error) return fail(error.code === "23514" ? "Not enough stock for that change. Refresh and check the count." : error.message);
  if ((data ?? []).length !== 1 || data![0].quantity_after === null) return fail("The stock change was not recorded.");
  // Confirm from the stored row, not from what we expected.
  const { data: after } = await supabase.from("electronic_components").select("quantity_on_hand").eq("id", componentId).maybeSingle();
  if (!after || after.quantity_on_hand !== data![0].quantity_after) return fail("The stock change was recorded but the new count could not be confirmed. Refresh the page.");
  refresh(componentId);
  return { ok: true, data: { quantityAfter: after.quantity_on_hand as number } };
}

/* ------------------------------------------------------------------ locations */

const locationInput = z.object({
  name: text(80).min(1, "Give the location a name."),
  kind: z.enum(LOCATION_KINDS),
  parent_id: nullableId,
  notes: optText(500),
});

export async function saveLocation(locationId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (locationId !== null && !id.safeParse(locationId).success) return fail("Unknown location.");
  const l = locationInput.safeParse(input);
  if (!l.success) return fail(first(l.error));
  const supabase = await createClient();

  if (l.data.parent_id) {
    if (l.data.parent_id === locationId) return fail("A location cannot be inside itself.");
    // Walk up from the chosen parent; reaching this location would create a loop.
    let cur: string | null = l.data.parent_id;
    for (let i = 0; i < 20 && cur; i++) {
      if (cur === locationId) return fail("That would put the location inside one of its own sub-locations.");
      const { data: up } = await supabase.from("component_storage_locations").select("parent_id").eq("id", cur).maybeSingle();
      if (!up) return fail("That parent location no longer exists.");
      cur = up.parent_id as string | null;
    }
  }
  if (locationId === null) {
    const { data, error } = await supabase.from("component_storage_locations").insert(l.data).select("id");
    if (error) return fail(error.message);
    if ((data ?? []).length !== 1) return fail("The location was not saved.");
    refresh();
    return { ok: true, data: { id: data![0].id as string } };
  }
  const { data, error } = await supabase.from("component_storage_locations").update(l.data).eq("id", locationId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That location no longer exists.");
  refresh();
  return { ok: true, data: { id: locationId } };
}

export async function setLocationArchived(locationId: string, archived: boolean): Promise<ActionResult> {
  if (!id.safeParse(locationId).success) return fail("Unknown location.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("component_storage_locations")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", locationId)
    .select("id,archived_at");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || Boolean(data![0].archived_at) !== archived) return fail("The change was not saved.");
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ component files and links */

const provenance = {
  title: optText(200),
  verified: z.boolean().default(false),
  source_url: z.string().trim().max(2000).optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Source links must start with http:// or https://"),
  variant: optText(120),
  target_board: optText(120),
};
const KINDS = ["photo", "datasheet", "pinout", "wiring", "document", "other"] as const;
const fileMeta = z.object({
  kind: z.enum(KINDS),
  storage_path: z.string().min(1).max(600),
  display_path: z.string().max(600).nullable().optional().transform((v) => v ?? null),
  original_filename: text(255).min(1),
  mime_type: z.string().max(120).nullable().optional().transform((v) => v ?? null),
  size_bytes: z.number().int().min(0).max(MAX_UPLOAD_BYTES),
  ...provenance,
});
const linkMeta = z.object({
  kind: z.enum(KINDS),
  external_url: z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, "Links must start with http:// or https://"),
  ...provenance,
});

async function removeObjects(supabase: Supa, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length) await supabase.storage.from(BUCKET).remove(list);
}

export async function addComponentFile(componentId: string, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(componentId).success) return fail("Unknown component.");
  const m = fileMeta.safeParse(input);
  if (!m.success) return fail(first(m.error));
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub as string | undefined;
  if (!uid) return fail("You are signed out. Sign in again and retry.");
  const { data: comp } = await supabase.from("electronic_components").select("id").eq("id", componentId).maybeSingle();
  if (!comp) return fail("That component no longer exists.");
  const prefix = `${uid}/${componentId}/`;
  for (const p of [m.data.storage_path, m.data.display_path]) {
    if (p && (!p.startsWith(prefix) || p.includes(".."))) return fail("That file was not uploaded to this component.");
    if (p) {
      const { error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 30);
      if (error) return fail("The upload did not reach storage, so it was not saved. Try again.");
    }
  }
  const { data, error } = await supabase.from("component_assets").insert({ component_id: componentId, storage_bucket: BUCKET, ...m.data }).select("id");
  if (error || (data ?? []).length !== 1) {
    await removeObjects(supabase, [m.data.storage_path, m.data.display_path]);
    return fail(error?.message ?? "The file was not saved.");
  }
  refresh(componentId);
  return { ok: true };
}

export async function addComponentLink(componentId: string, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(componentId).success) return fail("Unknown component.");
  const m = linkMeta.safeParse(input);
  if (!m.success) return fail(first(m.error));
  const supabase = await createClient();
  const { data: comp } = await supabase.from("electronic_components").select("id").eq("id", componentId).maybeSingle();
  if (!comp) return fail("That component no longer exists.");
  const { data, error } = await supabase.from("component_assets").insert({ component_id: componentId, ...m.data }).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("The link was not saved.");
  refresh(componentId);
  return { ok: true };
}

export async function setAssetVerified(componentId: string, assetId: string, verified: boolean): Promise<ActionResult> {
  if (!id.safeParse(componentId).success || !id.safeParse(assetId).success) return fail("Unknown file.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("component_assets").update({ verified }).eq("id", assetId).eq("component_id", componentId).select("id,verified");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1 || data![0].verified !== verified) return fail("The change was not saved.");
  refresh(componentId);
  return { ok: true };
}

export async function deleteComponentAsset(componentId: string, assetId: string): Promise<ActionResult> {
  if (!id.safeParse(componentId).success || !id.safeParse(assetId).success) return fail("Unknown file.");
  const supabase = await createClient();
  const { data: a } = await supabase.from("component_assets").select("storage_path,display_path").eq("id", assetId).eq("component_id", componentId).maybeSingle();
  if (!a) return fail("That file no longer exists.");
  const { data, error } = await supabase.from("component_assets").delete().eq("id", assetId).eq("component_id", componentId).select("id");
  if (error) return fail(error.message);
  if ((data ?? []).length !== 1) return fail("That file no longer exists.");
  await removeObjects(supabase, [a.storage_path, a.display_path]);
  refresh(componentId);
  return { ok: true };
}

export async function getComponentFileUrl(componentId: string, assetId: string, original = true): Promise<ActionResult<{ url: string; mime: string | null; filename: string }>> {
  if (!id.safeParse(componentId).success || !id.safeParse(assetId).success) return fail("Unknown file.");
  const supabase = await createClient();
  const { data: a } = await supabase.from("component_assets").select("storage_path,display_path,mime_type,original_filename").eq("id", assetId).eq("component_id", componentId).maybeSingle();
  if (!a?.storage_path) return fail("That file no longer exists.");
  const path = !original && a.display_path ? a.display_path : a.storage_path;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return fail("Could not open that file. Try again.");
  return { ok: true, data: { url: data.signedUrl, mime: a.mime_type, filename: a.original_filename ?? "file" } };
}

/* ------------------------------------------------------------------ CSV import */

const MAX_IMPORT_ROWS = 200;
export type ImportReport = { created: number; links: number; skipped: { line: number; reason: string }[]; newCategories: string[]; newLocations: string[] };

export async function importComponents(rows: unknown): Promise<ActionResult<ImportReport>> {
  const parsed = z.array(z.record(z.string(), z.string())).max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} rows at a time.`).safeParse(rows);
  if (!parsed.success) return fail(first(parsed.error));
  if (parsed.data.length === 0) return fail("The file has no rows to import.");
  const supabase = await createClient();

  const [{ data: cats }, { data: locs }, { data: existing }] = await Promise.all([
    supabase.from("component_categories").select("id,name"),
    supabase.from("component_storage_locations").select("id,name").is("archived_at", null),
    supabase.from("electronic_components").select("name,part_number,variant"),
  ]);
  const catByName = new Map((cats ?? []).map((c) => [String(c.name).toLowerCase(), c.id as string]));
  const locByName = new Map((locs ?? []).map((l) => [String(l.name).toLowerCase(), l.id as string]));
  const seen = new Set((existing ?? []).map((e) => `${e.name}|${e.part_number ?? ""}|${e.variant ?? ""}`.toLowerCase()));
  const report: ImportReport = { created: 0, links: 0, skipped: [], newCategories: [], newLocations: [] };

  type Prepared = { line: number; row: ReturnType<typeof shapeComponent>; qty: number; cat: string; loc: string; link: string | null };
  const prepared: Prepared[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const get = (k: string) => (r[k] ?? "").trim();
    const interfaces = get("interfaces").split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
    const cond = get("condition").toLowerCase() || "unknown";
    const candidate = {
      name: get("name"), category_id: null, manufacturer: get("manufacturer"), part_number: get("part_number"), variant: get("variant"),
      description: get("description"), notes: get("notes"), min_stock_threshold: get("min_stock"),
      condition: (CONDITIONS as readonly string[]).includes(cond) ? (cond as Condition) : "unknown",
      storage_location_id: null, operating_voltage_min: get("operating_voltage_min_v"), operating_voltage_max: get("operating_voltage_max_v"),
      logic_level_voltage: get("logic_level_v"), interfaces, specs: [], unverified: ["operating_voltage", "logic_level_voltage"],
      retest_interval_days: "", track_individual_units: false, quantity: get("quantity"),
    };
    const v = componentInput.safeParse(candidate);
    if (!v.success) return void report.skipped.push({ line, reason: first(v.error) });
    if (cond && !(CONDITIONS as readonly string[]).includes(cond)) return void report.skipped.push({ line, reason: `Condition "${cond}" is not one of ${CONDITIONS.join(", ")}.` });
    const link = get("link_url");
    if (link && !(link.length <= 2000 && /^https?:\/\/\S+$/i.test(link))) return void report.skipped.push({ line, reason: "link_url must start with http:// or https:// and contain no spaces." });
    const key = `${v.data.name}|${v.data.part_number ?? ""}|${v.data.variant ?? ""}`.toLowerCase();
    if (seen.has(key)) return void report.skipped.push({ line, reason: "Already in your inventory (same name, part number and variant)." });
    seen.add(key);
    prepared.push({ line, row: shapeComponent(v.data), qty: v.data.quantity ?? 0, cat: get("category"), loc: get("location"), link: link || null });
  });

  // Create categories and locations that the file names but you do not have yet.
  for (const name of [...new Set(prepared.map((p) => p.cat).filter((n) => n && !catByName.has(n.toLowerCase())))]) {
    const { data, error } = await supabase.from("component_categories").insert({ name, is_custom: true, sort_order: 100 }).select("id");
    if (error || (data ?? []).length !== 1) return fail(`Could not create the category "${name}": ${error?.message ?? "not saved"}. Nothing was imported.`);
    catByName.set(name.toLowerCase(), data![0].id as string);
    report.newCategories.push(name);
  }
  for (const name of [...new Set(prepared.map((p) => p.loc).filter((n) => n && !locByName.has(n.toLowerCase())))]) {
    const { data, error } = await supabase.from("component_storage_locations").insert({ name, kind: "bin" }).select("id");
    if (error || (data ?? []).length !== 1) return fail(`Could not create the location "${name}": ${error?.message ?? "not saved"}. Nothing was imported.`);
    locByName.set(name.toLowerCase(), data![0].id as string);
    report.newLocations.push(name);
  }

  if (prepared.length === 0) { refresh(); return { ok: true, data: report }; }
  const insertRows = prepared.map((p) => ({
    ...p.row,
    category_id: p.cat ? catByName.get(p.cat.toLowerCase()) ?? null : null,
    storage_location_id: p.loc ? locByName.get(p.loc.toLowerCase()) ?? null : null,
  }));
  const { data: created, error } = await supabase.from("electronic_components").insert(insertRows).select("id");
  if (error || (created ?? []).length !== insertRows.length) return fail(`Nothing was imported: ${error?.message ?? "the rows were not all saved"}.`);

  // Product links (for example a store listing) are saved as unverified links on each component.
  const links = prepared.flatMap((p, i) => (p.link ? [{ component_id: created![i].id as string, kind: "other", title: "Product listing", external_url: p.link, source_url: p.link, verified: false }] : []));
  if (links.length) {
    const { data: linked, error: lErr } = await supabase.from("component_assets").insert(links).select("id");
    if (lErr || (linked ?? []).length !== links.length) {
      await supabase.from("electronic_components").delete().in("id", created!.map((c) => c.id as string));
      return fail(`Nothing was imported because the links could not be saved: ${lErr?.message ?? "not all links were saved"}`);
    }
  }

  const movements = prepared.flatMap((p, i) => (p.qty > 0 ? [{ component_id: created![i].id as string, movement_type: "initial", quantity_delta: p.qty, reason: "Imported from CSV" }] : []));
  if (movements.length) {
    const { error: mErr } = await supabase.from("component_stock_movements").insert(movements);
    if (mErr) {
      await supabase.from("electronic_components").delete().in("id", created!.map((c) => c.id as string));
      return fail(`Nothing was imported because starting stock could not be recorded: ${mErr.message}`);
    }
  }
  report.created = created!.length;
  report.links = links.length;
  refresh();
  return { ok: true, data: report };
}

