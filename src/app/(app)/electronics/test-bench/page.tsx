import type { Metadata } from "next";
import Link from "next/link";
import { NewProcedureButton, type CompOption } from "@/components/testing/ProcedureForm";
import { RunTestPicker } from "@/components/testing/RunTestForm";
import { loadRunTargets } from "@/lib/test-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Test Bench" };

export default async function Page({ searchParams }: PageProps<"/electronics/test-bench">) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const supabase = await createClient();

  let q = supabase.from("test_procedures").select("id,name,component_id,supported_variant,current_version_id,archived_at,updated_at").order("name").limit(500);
  q = showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const [procs, comps, targets] = await Promise.all([
    q,
    supabase.from("electronic_components").select("id,name,part_number,variant").is("archived_at", null).order("name").limit(2000),
    loadRunTargets(supabase),
  ]);
  if (procs.error) return <div className="error" role="alert">Could not load procedures: {procs.error.message}</div>;
  const list = procs.data ?? [];
  const versionIds = list.map((p) => p.current_version_id).filter(Boolean) as string[];
  const { data: vers } = versionIds.length ? await supabase.from("test_procedure_versions").select("id,version,verified,execution_mode").in("id", versionIds) : { data: [] };
  const verById = new Map((vers ?? []).map((v) => [v.id as string, v]));
  const options = (comps.data ?? []) as CompOption[];
  const nameOf = new Map(options.map((c) => [c.id, c.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Electronics</p>
          <h1>Test Bench</h1>
          <p className="lede">Follow a procedure step by step, record readings, and keep the result. Everything here is done by hand and recorded as a manual test.</p>
        </div>
        <div className="row no-print">
          <RunTestPicker targets={targets} procedure={null} label="Record a test" />
          <NewProcedureButton components={options} />
        </div>
      </div>

      <div className="tabs" role="navigation" aria-label="Procedure list">
        <Link href="/electronics/test-bench" aria-current={showArchived ? undefined : "page"}>Active</Link>
        <Link href="/electronics/test-bench?archived=1" aria-current={showArchived ? "page" : undefined}>Archived</Link>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <h2>{showArchived ? "No archived procedures" : "No procedures yet"}</h2>
          <p>{showArchived ? "Archived procedures appear here and can be restored." : "A procedure is a checklist of steps, optionally with readings and expected ranges. Nothing is pre-loaded: you write the ones you trust. You can also record a test without a procedure."}</p>
        </div>
      ) : (
        <div className="proc-grid">
          {list.map((p) => {
            const v = verById.get(p.current_version_id as string);
            return (
              <Link key={p.id} href={`/electronics/test-bench/${p.id}`} className="card proc-card">
                <h3>{p.name}</h3>
                <p className="hint" style={{ margin: 0 }}>{p.component_id ? nameOf.get(p.component_id as string) ?? "Component" : "Any component"}{p.supported_variant ? ` · ${p.supported_variant}` : ""}</p>
                <div className="row">
                  <span className="badge badge-type">Version {v?.version ?? "?"}</span>
                  {v?.verified ? <span className="badge badge-ok">Verified</span> : <span className="unverified">Unverified · manual only</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
