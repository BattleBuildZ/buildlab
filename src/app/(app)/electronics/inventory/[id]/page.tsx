import Link from "next/link";
import { notFound } from "next/navigation";
import ArchiveComponentButton from "@/components/electronics/ArchiveComponentButton";
import ComponentFiles, { type CAsset } from "@/components/electronics/ComponentFiles";
import EditComponentButton from "@/components/electronics/EditComponentButton";
import QrLabel from "@/components/electronics/QrLabel";
import StockPanel from "@/components/electronics/StockPanel";
import { RunTestButton } from "@/components/testing/RunTestForm";
import UnitsPanel, { type UnitRow } from "@/components/testing/UnitsPanel";
import { loadRunTargets } from "@/lib/test-data";
import { NewProcedureButton } from "@/components/testing/ProcedureForm";
import { retestDue } from "@/lib/testing";
import { CONDITION_LABEL, TEST_STATUS_BADGE, TEST_STATUS_LABEL, type Category, type ComponentRow, type Location } from "@/lib/electronics";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/electronics/inventory/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) return { title: "Component" };
  const supabase = await createClient();
  const { data } = await supabase.from("electronic_components").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Component" };
}

export default async function ComponentPage({ params }: PageProps<"/electronics/inventory/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("electronic_components").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const comp = c as ComponentRow;

  const [moves, assets, cats, locs, runs, procs, unitRes, targets] = await Promise.all([
    supabase.from("component_stock_movements").select("id,created_at,movement_type,quantity_delta,quantity_after,reason").eq("component_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("component_assets").select("id,kind,title,original_filename,mime_type,size_bytes,external_url,verified,source_url,variant,target_board,storage_path,display_path").eq("component_id", id).order("created_at", { ascending: false }),
    supabase.from("component_categories").select("id,name,is_custom").order("sort_order").order("name"),
    supabase.from("component_storage_locations").select("id,name,kind,parent_id,notes,qr_token,archived_at").order("name"),
    supabase.from("test_runs").select("id,performed_at,outcome,source,unit_id,criteria_snapshot,procedure_version_number").eq("component_id", id).order("performed_at", { ascending: false }).order("created_at", { ascending: false }).limit(5),
    supabase.from("test_procedures").select("id,name,component_id").is("archived_at", null).or(`component_id.eq.${id},component_id.is.null`).order("name").limit(50),
    supabase.from("component_units").select("id,label,notes,test_status,last_tested_at,retired_at").eq("component_id", id).order("label"),
    loadRunTargets(supabase, id),
  ]);
  const failed = [moves, assets, cats, locs, runs, procs, unitRes].find((r) => r.error);
  if (failed?.error) return <div className="error" role="alert">Could not load this component: {failed.error.message}</div>;
  const categories = (cats.data ?? []) as Category[];
  const locations = (locs.data ?? []) as Location[];
  const category = categories.find((x) => x.id === comp.category_id);
  const location = locations.find((x) => x.id === comp.storage_location_id);

  const raw = (assets.data ?? []) as (Omit<CAsset, "previewUrl"> & { display_path: string | null })[];
  const imgPaths = raw.filter((a) => a.storage_path && String(a.mime_type ?? "").startsWith("image/")).map((a) => a.display_path ?? a.storage_path!);
  const signed = imgPaths.length ? await supabase.storage.from("component-files").createSignedUrls(imgPaths, 3600) : { data: [] };
  const urlBy = new Map((signed.data ?? []).map((u) => [u.path ?? "", u.signedUrl]));
  const files: CAsset[] = raw.map((a) => ({ ...a, previewUrl: a.storage_path ? urlBy.get(a.display_path ?? a.storage_path) ?? null : null }));

  const unv = new Set(comp.unverified_fields ?? []);
  const flag = (k: string) => (unv.has(k) ? <span className="unverified">Unverified</span> : null);
  const hasV = comp.operating_voltage_min !== null || comp.operating_voltage_max !== null;
  const v = (n: number | string | null) => (n === null ? "?" : `${parseFloat(String(n))} V`);
  const specEntries = Object.entries(comp.specs ?? {});

  return (
    <>
      <div className="crumbs"><Link href="/electronics/inventory">Component Inventory</Link> / {comp.name}</div>
      <div className="page-head">
        <div>
          <h1>{comp.name}</h1>
          <p className="lede">{[comp.manufacturer, comp.part_number, comp.variant].filter(Boolean).join(" · ") || "No part number recorded"}</p>
          <div className="row" style={{ marginTop: 10 }}>
            {category && <span className="badge badge-type">{category.name}</span>}
            <span className={`badge ${TEST_STATUS_BADGE[comp.test_status] ?? "badge-type"}`}>{TEST_STATUS_LABEL[comp.test_status] ?? comp.test_status}</span>
            <span className="badge badge-type">{CONDITION_LABEL[comp.condition]}</span>
            {comp.archived_at && <span className="badge badge-warn">Archived</span>}
          </div>
        </div>
        <div className="row no-print">
          <EditComponentButton component={comp} categories={categories} locations={locations} />
          <ArchiveComponentButton id={comp.id} name={comp.name} archived={Boolean(comp.archived_at)} />
        </div>
      </div>

      <div className="stack">
        <StockPanel
          componentId={comp.id}
          quantity={comp.quantity_on_hand}
          threshold={comp.min_stock_threshold}
          archived={Boolean(comp.archived_at)}
          moves={(moves.data ?? []) as never}
        />

        <section id="testing" className="card section" aria-labelledby="h-testing">
          <div className="section-head">
            <div>
              <h2 id="h-testing">Testing</h2>
              <p className="hint">Latest result: <span className={`badge ${TEST_STATUS_BADGE[comp.test_status] ?? "badge-type"}`}>{TEST_STATUS_LABEL[comp.test_status] ?? comp.test_status}</span>{comp.last_tested_at ? ` · tested ${new Date(comp.last_tested_at).toLocaleDateString()}` : ""}{retestDue(comp.last_tested_at, comp.retest_interval_days) && <span className="unverified" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Retest due</span>}</p>
            </div>
            {!comp.archived_at && targets[0] && (
              <div className="row">
                <RunTestButton target={targets[0]} procedure={null} label="Record a test" primary />
                <NewProcedureButton components={[{ id: comp.id, name: comp.name, part_number: comp.part_number, variant: comp.variant }]} defaultComponentId={comp.id} label="New procedure" />
              </div>
            )}
          </div>
          {(procs.data ?? []).length > 0 && (
            <p className="hint">Procedures: {(procs.data ?? []).map((pr, i) => <span key={pr.id}>{i > 0 && ", "}<Link href={`/electronics/test-bench/${pr.id}`}>{pr.name}</Link></span>)}</p>
          )}
          {(runs.data ?? []).length === 0 ? <p className="hint">No tests recorded for this component yet.</p> : (
            <ul className="check-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {(runs.data ?? []).map((r) => {
                const snap = r.criteria_snapshot as { procedure_name?: string | null } | null;
                return (
                  <li key={r.id} className="check-row">
                    <Link href={`/electronics/history/${r.id}`}>{new Date(r.performed_at as string).toLocaleString()}</Link>
                    <div className="row">
                      <span className="hint">{snap?.procedure_name ?? "No procedure"}</span>
                      <span className={`badge ${r.source === "manual" ? "badge-manual" : "badge-type"}`}>{r.source === "manual" ? "Manual" : "Automated"}</span>
                      <span className={`badge ${TEST_STATUS_BADGE[r.outcome as string] ?? "badge-type"}`}>{TEST_STATUS_LABEL[r.outcome as string] ?? r.outcome}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="hint"><Link href={`/electronics/history?component=${comp.id}`}>All test history for this component</Link></p>
        </section>

        {comp.track_individual_units && <UnitsPanel componentId={comp.id} units={(unitRes.data ?? []) as UnitRow[]} archived={Boolean(comp.archived_at)} />}

        <section id="details" className="card section" aria-labelledby="h-details">
          <h2 id="h-details">Details</h2>
          <dl className="kv">
            <dt>Storage location</dt>
            <dd>{location ? <Link href={`/electronics/locations/${location.id}`}>{location.name}</Link> : "Not assigned"}{location?.archived_at ? " (archived)" : ""}</dd>
            <dt>Operating voltage</dt>
            <dd>{hasV ? <>{v(comp.operating_voltage_min)} to {v(comp.operating_voltage_max)}{flag("operating_voltage")}</> : "Not recorded"}</dd>
            <dt>Logic level</dt>
            <dd>{comp.logic_level_voltage !== null ? <>{parseFloat(String(comp.logic_level_voltage))} V{flag("logic_level_voltage")}</> : "Not recorded"}</dd>
            <dt>Interfaces</dt>
            <dd>{comp.interfaces.length ? comp.interfaces.join(", ") : "Not recorded"}</dd>
            {specEntries.map(([k, val]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{val}{flag(`spec:${k}`)}</dd>
              </div>
            ))}
            <dt>Last tested</dt>
            <dd>{comp.last_tested_at ? new Date(comp.last_tested_at).toLocaleDateString() : "Never"}{comp.retest_interval_days ? ` · retest every ${comp.retest_interval_days} days` : ""}</dd>
            {comp.track_individual_units && (<><dt>Units</dt><dd>Tracked individually</dd></>)}
          </dl>
          {comp.description && <p className="prewrap">{comp.description}</p>}
          {comp.notes && <p className="cut-note prewrap">{comp.notes}</p>}
        </section>

        <ComponentFiles componentId={comp.id} variant={comp.variant} assets={files} />

        <section id="label" className="card section" aria-labelledby="h-label">
          <h2 id="h-label">Label</h2>
          <p className="hint">Print this and stick it on the bag or bin. Scanning it while signed in opens this component.</p>
          <QrLabel token={comp.qr_token} title={comp.name} subtitle={comp.part_number ?? undefined} />
        </section>
      </div>
    </>
  );
}
