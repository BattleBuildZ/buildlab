import Link from "next/link";
import { notFound } from "next/navigation";
import { TEST_STATUS_BADGE, TEST_STATUS_LABEL } from "@/lib/electronics";
import { fmtRange, SOURCE_LABEL, type CriteriaSnapshot } from "@/lib/testing";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return { title: "Test run" };
}

export default async function RunPage({ params }: PageProps<"/electronics/history/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const supabase = await createClient();
  const { data: run } = await supabase.from("test_runs").select("*").eq("id", id).maybeSingle();
  if (!run) notFound();
  const [comp, unit, ms] = await Promise.all([
    supabase.from("electronic_components").select("id,name,part_number").eq("id", run.component_id).maybeSingle(),
    run.unit_id ? supabase.from("component_units").select("label").eq("id", run.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("test_measurements").select("id,key,label,unit,value_numeric,value_text,expected_min,expected_max,passed,source").eq("test_run_id", id).order("created_at").order("key"),
  ]);
  const snap = run.criteria_snapshot as CriteriaSnapshot | null;
  const def = snap?.definition ?? null;
  const done = new Set(snap?.steps_done ?? []);
  const readings = ms.data ?? [];

  return (
    <>
      <div className="crumbs"><Link href="/electronics/history">Test History</Link> / {new Date(run.performed_at as string).toLocaleString()}</div>
      <div className="page-head">
        <div>
          <h1>{comp.data?.name ?? "Test run"}</h1>
          <p className="lede">{new Date(run.performed_at as string).toLocaleString()}{unit.data ? ` · unit ${unit.data.label}` : ""}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <span className={`badge ${TEST_STATUS_BADGE[run.outcome as string] ?? "badge-type"}`}>{TEST_STATUS_LABEL[run.outcome as string] ?? run.outcome}</span>
            <span className={`badge ${run.source === "manual" ? "badge-manual" : "badge-type"}`}>{SOURCE_LABEL[run.source as string] ?? run.source} test</span>
            {snap?.procedure_name && <span className="badge badge-type">{snap.procedure_name} v{run.procedure_version_number}</span>}
            {snap && snap.procedure_name && snap.verified === false && <span className="unverified">Procedure unverified</span>}
          </div>
        </div>
        <div className="row no-print"><Link className="btn" href={`/electronics/inventory/${run.component_id}`}>Open component</Link></div>
      </div>

      <p className="hint">This record is permanent. It cannot be edited or deleted, so a later result never replaces it.</p>

      <div className="stack">
        <section className="card section" aria-labelledby="h-read">
          <h2 id="h-read">Readings</h2>
          {readings.length === 0 ? <p className="hint">No readings were recorded.</p> : (
            <div className="table-wrap">
              <table className="inv-table">
                <thead><tr><th>Reading</th><th>Value</th><th>Expected</th><th>Judged</th><th>Entered</th></tr></thead>
                <tbody>
                  {readings.map((m) => (
                    <tr key={m.id}>
                      <td data-label="Reading">{m.label ?? m.key}</td>
                      <td data-label="Value">{m.value_numeric !== null ? `${parseFloat(String(m.value_numeric))}${m.unit ? ` ${m.unit}` : ""}` : m.value_text}</td>
                      <td data-label="Expected">{fmtRange(m.expected_min === null ? null : Number(m.expected_min), m.expected_max === null ? null : Number(m.expected_max), m.unit)}</td>
                      <td data-label="Judged"><span className={`badge ${m.passed === true ? "badge-ok" : m.passed === false ? "badge-bad" : "badge-type"}`}>{m.passed === true ? "In range" : m.passed === false ? "Out of range" : "Not judged"}</span></td>
                      <td data-label="Entered">{m.source === "instrument" ? "Instrument" : "Typed by you"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {def && (
          <section className="card section" aria-labelledby="h-steps">
            <h2 id="h-steps">Steps as run</h2>
            <p className="hint">This is the procedure exactly as it was when this test was run, even if it has been edited since.</p>
            <ol className="def-list">
              {def.steps.map((s) => (
                <li key={s.n}>{done.has(s.n) ? "✓ " : "☐ "}{s.instruction}</li>
              ))}
            </ol>
            {def.supply_voltage && <p><b>Supply voltage in the procedure:</b> {fmtRange(def.supply_voltage.min, def.supply_voltage.max, "V")}</p>}
            {def.evaluation_rules && <p className="prewrap"><b>Pass or fail:</b> {def.evaluation_rules}</p>}
          </section>
        )}

        {(run.notes || run.troubleshooting_notes) && (
          <section className="card section" aria-labelledby="h-notes">
            <h2 id="h-notes">Notes</h2>
            {run.notes && <p className="prewrap">{run.notes}</p>}
            {run.troubleshooting_notes && <p className="prewrap"><b>What was tried:</b> {run.troubleshooting_notes}</p>}
          </section>
        )}
      </div>
    </>
  );
}
