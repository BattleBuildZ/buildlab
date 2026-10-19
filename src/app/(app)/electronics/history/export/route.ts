import { csvLine } from "@/lib/electronics";
import { createClient } from "@/lib/supabase/server";
import type { CriteriaSnapshot } from "@/lib/testing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") === "measurements" ? "measurements" : "runs";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("Sign in first.", { status: 401 });

  const [runs, comps, units] = await Promise.all([
    supabase.from("test_runs").select("id,component_id,unit_id,performed_at,outcome,source,procedure_version_number,criteria_snapshot,notes,troubleshooting_notes").order("performed_at", { ascending: false }).limit(20000),
    supabase.from("electronic_components").select("id,name,part_number"),
    supabase.from("component_units").select("id,label"),
  ]);
  if (runs.error) return new Response(runs.error.message, { status: 500 });
  const cn = new Map((comps.data ?? []).map((c) => [c.id as string, c]));
  const un = new Map((units.data ?? []).map((u) => [u.id as string, u.label as string]));
  const runById = new Map((runs.data ?? []).map((r) => [r.id as string, r]));

  let body: string;
  if (type === "runs") {
    body = [
      csvLine(["performed_at", "component", "part_number", "unit", "procedure", "version", "procedure_verified", "source", "result", "notes", "troubleshooting_notes", "run_id"]),
      ...(runs.data ?? []).map((r) => {
        const snap = r.criteria_snapshot as CriteriaSnapshot | null;
        const c = cn.get(r.component_id as string);
        return csvLine([r.performed_at, c?.name ?? "", c?.part_number ?? "", r.unit_id ? un.get(r.unit_id as string) ?? "" : "", snap?.procedure_name ?? "", r.procedure_version_number, snap?.verified === null || snap?.verified === undefined ? "" : snap.verified ? "yes" : "no", r.source, r.outcome, r.notes, r.troubleshooting_notes, r.id]);
      }),
    ].join("\r\n");
  } else {
    const ms = await supabase.from("test_measurements").select("test_run_id,key,label,unit,value_numeric,value_text,expected_min,expected_max,passed,source").order("created_at").limit(50000);
    if (ms.error) return new Response(ms.error.message, { status: 500 });
    body = [
      csvLine(["performed_at", "component", "unit", "run_source", "result", "reading", "value", "unit_of_measure", "expected_min", "expected_max", "judged", "entered", "run_id"]),
      ...(ms.data ?? []).flatMap((m) => {
        const r = runById.get(m.test_run_id as string);
        if (!r) return [];
        return [csvLine([r.performed_at, cn.get(r.component_id as string)?.name ?? "", r.unit_id ? un.get(r.unit_id as string) ?? "" : "", r.source, r.outcome, m.label ?? m.key, m.value_numeric ?? m.value_text, m.unit, m.expected_min, m.expected_max, m.passed === null ? "not judged" : m.passed ? "in range" : "out of range", m.source === "instrument" ? "instrument" : "typed", m.test_run_id])];
      }),
    ].join("\r\n");
  }
  return new Response("﻿" + body + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="buildlab-test-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
