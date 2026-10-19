import { csvLine, COMPONENT_CSV_COLUMNS, MOVEMENT_LABEL } from "@/lib/electronics";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") === "movements" ? "movements" : "components";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("Sign in first.", { status: 401 });

  let body: string;
  if (type === "components") {
    const [c, cats, locs, links] = await Promise.all([
      supabase.from("electronic_components").select("*").is("archived_at", null).order("name").limit(5000),
      supabase.from("component_categories").select("id,name"),
      supabase.from("component_storage_locations").select("id,name"),
      supabase.from("component_assets").select("component_id,external_url,created_at").not("external_url", "is", null).order("created_at").limit(20000),
    ]);
    if (c.error) return new Response(c.error.message, { status: 500 });
    const cn = new Map((cats.data ?? []).map((x) => [x.id, x.name]));
    const firstLink = new Map<string, string>();
    for (const l of links.data ?? []) if (!firstLink.has(l.component_id)) firstLink.set(l.component_id, l.external_url as string);
    const ln = new Map((locs.data ?? []).map((x) => [x.id, x.name]));
    body = [
      csvLine([...COMPONENT_CSV_COLUMNS]),
      ...(c.data ?? []).map((r) =>
        csvLine([
          r.name, cn.get(r.category_id) ?? "", r.manufacturer, r.part_number, r.variant, r.quantity_on_hand, r.min_stock_threshold, r.condition,
          ln.get(r.storage_location_id) ?? "", r.operating_voltage_min, r.operating_voltage_max, r.logic_level_voltage, (r.interfaces ?? []).join(";"),
          r.description, r.notes, firstLink.get(r.id) ?? "",
        ]),
      ),
    ].join("\r\n");
  } else {
    const [m, comps] = await Promise.all([
      supabase.from("component_stock_movements").select("created_at,component_id,movement_type,quantity_delta,quantity_after,reason").order("created_at", { ascending: false }).limit(20000),
      supabase.from("electronic_components").select("id,name,part_number"),
    ]);
    if (m.error) return new Response(m.error.message, { status: 500 });
    const names = new Map((comps.data ?? []).map((x) => [x.id, x]));
    body = [
      csvLine(["date", "component", "part_number", "type", "change", "quantity_after", "reason"]),
      ...(m.data ?? []).map((r) => csvLine([r.created_at, names.get(r.component_id)?.name ?? "", names.get(r.component_id)?.part_number ?? "", MOVEMENT_LABEL[r.movement_type] ?? r.movement_type, r.quantity_delta, r.quantity_after, r.reason])),
    ].join("\r\n");
  }
  return new Response("﻿" + body + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="buildlab-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
