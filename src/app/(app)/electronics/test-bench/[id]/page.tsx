import Link from "next/link";
import { notFound } from "next/navigation";
import ArchiveProcedureButton from "@/components/testing/ArchiveProcedureButton";
import { NewVersionButton } from "@/components/testing/ProcedureForm";
import { RunTestButton, RunTestPicker } from "@/components/testing/RunTestForm";
import { TEST_STATUS_BADGE, TEST_STATUS_LABEL } from "@/lib/electronics";
import { loadRunTargets } from "@/lib/test-data";
import { fmtRange, type ProcedureDef } from "@/lib/testing";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/electronics/test-bench/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) return { title: "Procedure" };
  const supabase = await createClient();
  const { data } = await supabase.from("test_procedures").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Procedure" };
}

export default async function ProcedurePage({ params }: PageProps<"/electronics/test-bench/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const supabase = await createClient();
  const { data: proc } = await supabase.from("test_procedures").select("id,name,component_id,supported_variant,current_version_id,archived_at").eq("id", id).maybeSingle();
  if (!proc) notFound();

  const [versions, comp] = await Promise.all([
    supabase.from("test_procedure_versions").select("id,version,verified,execution_mode,change_note,created_at,definition").eq("procedure_id", id).order("version", { ascending: false }),
    proc.component_id ? supabase.from("electronic_components").select("id,name,part_number").eq("id", proc.component_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (versions.error) return <div className="error" role="alert">Could not load this procedure: {versions.error.message}</div>;
  const vlist = versions.data ?? [];
  const current = vlist.find((v) => v.id === proc.current_version_id) ?? vlist[0];
  if (!current) return <div className="error" role="alert">This procedure has no versions.</div>;
  const def = current.definition as ProcedureDef;
  const verIds = vlist.map((v) => v.id as string);

  const [runs, targets] = await Promise.all([
    supabase.from("test_runs").select("id,performed_at,outcome,source,procedure_version_number,component_id").in("procedure_version_id", verIds).order("performed_at", { ascending: false }).limit(10),
    loadRunTargets(supabase, proc.component_id ?? undefined),
  ]);
  const procedure = { versionId: current.id as string, name: proc.name as string, version: current.version as number, verified: Boolean(current.verified), def };
  const archived = Boolean(proc.archived_at);

  return (
    <>
      <div className="crumbs"><Link href="/electronics/test-bench">Test Bench</Link> / {proc.name}</div>
      <div className="page-head">
        <div>
          <h1>{proc.name}</h1>
          <p className="lede">{proc.component_id ? <>For <Link href={`/electronics/inventory/${proc.component_id}`}>{comp.data?.name ?? "component"}</Link></> : "Works with any component"}{proc.supported_variant ? ` · ${proc.supported_variant}` : ""}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge badge-type">Version {current.version}</span>
            {current.verified ? <span className="badge badge-ok">Verified by you</span> : <span className="unverified">Unverified · manual only</span>}
            {archived && <span className="badge badge-warn">Archived</span>}
          </div>
        </div>
        <div className="row no-print">
          {!archived && (proc.component_id ? (targets[0] ? <RunTestButton target={targets[0]} procedure={procedure} label="Run this test" primary /> : null) : <RunTestPicker targets={targets} procedure={procedure} label="Run this test" />)}
          {!archived && <NewVersionButton procedureId={proc.id} name={proc.name} variant={proc.supported_variant} def={def} verified={Boolean(current.verified)} />}
          <ArchiveProcedureButton id={proc.id} name={proc.name} archived={archived} />
        </div>
      </div>

      {!current.verified && <div className="notice">This procedure has not been checked against the part&apos;s documentation. It can only be followed by hand, and the wiring and voltages in it are shown as you wrote them, not as verified facts.</div>}

      <div className="stack">
        <section className="card section" aria-labelledby="h-setup">
          <h2 id="h-setup">Setup</h2>
          <dl className="kv">
            <dt>Equipment</dt>
            <dd>{def.equipment.length ? <ul className="def-list">{def.equipment.map((x, i) => <li key={i}>{x}</li>)}</ul> : "None listed"}</dd>
            <dt>Wiring</dt>
            <dd>{def.wiring.length ? <ul className="def-list">{def.wiring.map((w, i) => <li key={i}>{w.pin} → {w.connects_to}</li>)}</ul> : "None listed"}</dd>
            <dt>Supply voltage</dt>
            <dd>{def.supply_voltage ? <>{fmtRange(def.supply_voltage.min, def.supply_voltage.max, "V")}{!current.verified && <span className="unverified">Unverified</span>}</> : "Not given"}</dd>
            <dt>Logic level</dt>
            <dd>{def.logic_level_voltage !== null ? <>{def.logic_level_voltage} V{!current.verified && <span className="unverified">Unverified</span>}</> : "Not given"}</dd>
          </dl>
        </section>

        <section className="card section" aria-labelledby="h-steps">
          <h2 id="h-steps">Steps</h2>
          <ol className="def-list">
            {def.steps.map((s) => (
              <li key={s.n}>
                {s.instruction}
                {s.measurement && <span className="hint" style={{ display: "block" }}>Record: {s.measurement.label}{s.measurement.unit ? ` (${s.measurement.unit})` : ""} · expected {fmtRange(s.measurement.expected_min, s.measurement.expected_max, s.measurement.unit)}</span>}
              </li>
            ))}
          </ol>
          {def.evaluation_rules && <><h3 style={{ fontSize: 15 }}>Pass or fail</h3><p className="prewrap">{def.evaluation_rules}</p></>}
          {def.troubleshooting && <><h3 style={{ fontSize: 15 }}>Troubleshooting</h3><p className="prewrap">{def.troubleshooting}</p></>}
        </section>

        <section className="card section" aria-labelledby="h-runs">
          <h2 id="h-runs">Recent runs</h2>
          {(runs.data ?? []).length === 0 ? <p className="hint">This procedure has not been run yet.</p> : (
            <ul className="check-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {(runs.data ?? []).map((r) => (
                <li key={r.id} className="check-row">
                  <Link href={`/electronics/history/${r.id}`}>{new Date(r.performed_at as string).toLocaleString()}</Link>
                  <div className="row"><span className="badge badge-type">v{r.procedure_version_number}</span><span className={`badge ${TEST_STATUS_BADGE[r.outcome as string] ?? "badge-type"}`}>{TEST_STATUS_LABEL[r.outcome as string] ?? r.outcome}</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card section" aria-labelledby="h-vers">
          <h2 id="h-vers">Versions</h2>
          <p className="hint">Old versions are never changed. Each run is judged against the version it was run with.</p>
          <ul className="check-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {vlist.map((v) => (
              <li key={v.id} className="check-row">
                <div><b>Version {v.version}</b>{v.id === current.id && <span className="badge badge-type" style={{ marginLeft: 8 }}>Current</span>}<span className="hint" style={{ display: "block" }}>{new Date(v.created_at as string).toLocaleDateString()}{v.change_note ? ` · ${v.change_note}` : ""}</span></div>
                {v.verified ? <span className="badge badge-ok">Verified</span> : <span className="unverified">Unverified</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
