import type { RunTarget } from "@/components/testing/RunTestForm";
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

// Components that can be tested right now (not archived), each with its active units.
export async function loadRunTargets(supabase: Supa, only?: string): Promise<RunTarget[]> {
  let q = supabase.from("electronic_components").select("id,name,track_individual_units").is("archived_at", null).order("name").limit(2000);
  if (only) q = q.eq("id", only);
  const { data: comps } = await q;
  const list = comps ?? [];
  const tracked = list.filter((c) => c.track_individual_units).map((c) => c.id as string);
  const { data: units } = tracked.length ? await supabase.from("component_units").select("id,component_id,label,retired_at").in("component_id", tracked).order("label") : { data: [] };
  return list.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    track_individual_units: Boolean(c.track_individual_units),
    units: (units ?? []).filter((u) => u.component_id === c.id).map((u) => ({ id: u.id as string, label: u.label as string, retired_at: (u.retired_at as string | null) ?? null })),
  }));
}
