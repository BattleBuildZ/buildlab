import type { Metadata } from "next";
import Link from "next/link";
import { TEST_STATUS_BADGE, TEST_STATUS_LABEL } from "@/lib/electronics";
import { SOURCE_LABEL, type CriteriaSnapshot } from "@/lib/testing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Test History" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 200;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Page({ searchParams }: PageProps<"/electronics/history">) {
  const sp = await searchParams;
  const comp = pick(sp.component), outcome = pick(sp.outcome), source = pick(sp.source), from = pick(sp.from), to = pick(sp.to);
  const supabase = await createClient();

  let q = supabase.from("test_runs").select("id,component_id,unit_id,performed_at,outcome,source,procedure_version_number,criteria_snapshot").order("performed_at", { ascending: false }).order("created_at", { ascending: false }).limit(LIMIT);
  if (uuid.test(comp)) q = q.eq("component_id", comp);
  if (outcome in TEST_STATUS_LABEL) q = q.eq("outcome", outcome);
  if (source === "manual" || source === "automated") q = q.eq("source", source);
  if (day.test(from)) q = q.gte("performed_at", `${from}T00:00:00Z`);
  if (day.test(to)) q = q.lte("performed_at", `${to}T23:59:59Z`);
  const [runs, comps] = await Promise.all([q, supabase.from("electronic_components").select("id,name").order("name").limit(5000)]);
  if (runs.error) return <div className="error" role="alert">Could not load test history: {runs.error.message}</div>;
  const rows = runs.data ?? [];
  const nameOf = new Map((comps.data ?? []).map((c) => [c.id as string, c.name as string]));
  const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))] as string[];
  const { data: units } = unitIds.length ? await supabase.from("component_units").select("id,label").in("id", unitIds) : { data: [] };
  const unitOf = new Map((units ?? []).map((u) => [u.id as string, u.label as string]));
  const filtered = Boolean(comp || outcome || source || from || to);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Electronics</p>
          <h1>Test History</h1>
          <p className="lede">Every test run, newest first. Runs cannot be edited or deleted. A failed test stays on record even after a later pass.</p>
        </div>
        <div className="row no-print">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
          <a className="btn" href="/electronics/history/export?type=runs">Export runs CSV</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
          <a className="btn" href="/electronics/history/export?type=measurements">Export readings CSV</a>
        </div>
      </div>

      <form className="filters" action="/electronics/history" role="search" aria-label="Filter test history" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="field">
          <label htmlFor="h-c">Component</label>
          <select id="h-c" name="component" className="select" defaultValue={comp}>
            <option value="">All</option>
            {(comps.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="h-o">Result</label>
          <select id="h-o" name="outcome" className="select" defaultValue={outcome}>
            <option value="">Any</option>
            {Object.entries(TEST_STATUS_LABEL).filter(([v]) => v !== "not_tested").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="h-s">Source</label>
          <select id="h-s" name="source" className="select" defaultValue={source}>
            <option value="">Any</option>
            <option value="manual">Manual</option>
            <option value="automated">Automated</option>
          </select>
        </div>
        <div className="field"><label htmlFor="h-f">From</label><input id="h-f" name="from" type="date" className="input" defaultValue={day.test(from) ? from : ""} /></div>
        <div className="field"><label htmlFor="h-t">To</label><input id="h-t" name="to" type="date" className="input" defaultValue={day.test(to) ? to : ""} /></div>
        <button type="submit" className="btn" style={{ alignSelf: "end" }}>Apply</button>
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <div className="empty"><h2>No matching runs</h2><p>Nothing matches those filters. <Link href="/electronics/history">Clear filters</Link></p></div>
        ) : (
          <div className="empty"><h2>No tests recorded yet</h2><p>Run a test from the <Link href="/electronics/test-bench">Test Bench</Link> or from a component page. Each run you record appears here and stays here.</p></div>
        )
      ) : (
        <>
          <p className="hint pagehint" aria-live="polite">{rows.length} run{rows.length === 1 ? "" : "s"}{rows.length >= LIMIT ? ` (showing the newest ${LIMIT}; narrow the filters or export for the rest)` : ""}</p>
          <div className="table-wrap">
            <table className="inv-table">
              <thead><tr><th>When</th><th>Component</th><th>Procedure</th><th>Source</th><th>Result</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const snap = r.criteria_snapshot as CriteriaSnapshot | null;
                  return (
                    <tr key={r.id}>
                      <td data-label="When"><Link href={`/electronics/history/${r.id}`}>{new Date(r.performed_at as string).toLocaleString()}</Link></td>
                      <td data-label="Component"><Link href={`/electronics/inventory/${r.component_id}`}>{nameOf.get(r.component_id as string) ?? "Component"}</Link>{r.unit_id && <div className="hint">Unit {unitOf.get(r.unit_id as string) ?? ""}</div>}</td>
                      <td data-label="Procedure">{snap?.procedure_name ? <>{snap.procedure_name} <span className="hint">v{r.procedure_version_number}</span></> : <span className="hint">No procedure</span>}</td>
                      <td data-label="Source"><span className={`badge ${r.source === "manual" ? "badge-manual" : "badge-type"}`}>{SOURCE_LABEL[r.source as string] ?? r.source}</span></td>
                      <td data-label="Result"><span className={`badge ${TEST_STATUS_BADGE[r.outcome as string] ?? "badge-type"}`}>{TEST_STATUS_LABEL[r.outcome as string] ?? r.outcome}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
