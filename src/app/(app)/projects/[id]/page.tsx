import Link from "next/link";
import { notFound } from "next/navigation";
import CutListSection from "@/components/project/CutListSection";
import DeleteProjectButton from "@/components/DeleteProjectButton";
import EditProjectButton from "@/components/project/EditProjectButton";
import HardwareSection from "@/components/project/HardwareSection";
import StepsSection from "@/components/project/StepsSection";
import Summary from "@/components/project/Summary";
import { FABRICATION_BADGE, FABRICATION_LABEL, STATUS_LABEL, type FabricationType } from "@/lib/fabrication";
import type { Assembly, CutItem, Hardware, Phase, Step } from "@/lib/project-types";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) return { title: "Project" };
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("name").eq("id", id).is("deleted_at", null).maybeSingle();
  return { title: data?.name ?? "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,description,type,status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const [asm, cut, hw, ph, st, pp] = await Promise.all([
    supabase.from("assemblies").select("id,name,fabrication_type,sort_order").eq("project_id", id).order("sort_order"),
    supabase
      .from("cut_list_items")
      .select("id,assembly_id,name,material,quantity,fabrication_note,product_url,needs_review,review_note,sort_order,cut_item_dimensions(id,label,mm,inch,sort_order),cut_units(id,unit_index,completed_at)")
      .eq("project_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase.from("hardware_items").select("id,name,quantity_required,quantity_acquired,notes,product_url,is_ready,sort_order").eq("project_id", id).order("sort_order").order("created_at"),
    supabase.from("build_phases").select("id,name,sort_order").eq("project_id", id).order("sort_order").order("created_at"),
    supabase.from("build_steps").select("id,phase_id,title,instructions,completed_at,sort_order").eq("project_id", id).order("sort_order").order("created_at"),
    supabase.from("print_parts").select("id,completed_at").eq("project_id", id),
  ]);
  const failed = [asm, cut, hw, ph, st, pp].find((r) => r.error);
  if (failed?.error) return <div className="error" role="alert">Could not load this project: {failed.error.message}</div>;

  const assemblies = (asm.data ?? []) as Assembly[];
  const cutItems = (cut.data ?? []) as unknown as CutItem[];
  const hardware = (hw.data ?? []) as Hardware[];
  const phases = (ph.data ?? []) as Phase[];
  const steps = (st.data ?? []) as Step[];
  const printParts = (pp.data ?? []) as { id: string; completed_at: string | null }[];

  const types = [...new Set(assemblies.map((a) => a.fabrication_type as FabricationType))];
  const hasPrinting = types.includes("3d_printing");
  const openCut = cutItems.some((i) => i.cut_units.some((u) => !u.completed_at));

  return (
    <>
      <div className="crumbs"><Link href="/projects">Projects</Link> / {project.name}</div>
      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          {project.description && <p className="lede">{project.description}</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge badge-type">{project.type === "sourced" ? "Sourced" : "Custom"}</span>
            <span className="badge badge-type">{STATUS_LABEL[project.status] ?? project.status}</span>
            {types.map((t) => (
              <span key={t} className={`badge ${FABRICATION_BADGE[t]}`}>{FABRICATION_LABEL[t]}</span>
            ))}
          </div>
        </div>
        <div className="row no-print">
          <EditProjectButton id={project.id} name={project.name} description={project.description} status={project.status} />
          <DeleteProjectButton id={project.id} name={project.name} redirectTo="/projects" />
        </div>
      </div>

      <nav className="jump no-print" aria-label="Project sections">
        <a href="#summary">Summary</a>
        <a href="#hardware">Hardware &amp; Fasteners</a>
        <a href="#cut-list">Cut List</a>
        {hasPrinting && <a href="#print">Print Checklist</a>}
        <a href="#steps">Build Steps</a>
      </nav>

      <div className="stack">
        <Summary
          cut={cutItems}
          hardware={hardware}
          steps={steps}
          printTotal={printParts.length}
          printDone={printParts.filter((p) => p.completed_at).length}
          hasPrinting={hasPrinting}
          hasOpenCutPieces={openCut}
        />
        <HardwareSection projectId={project.id} items={hardware} />
        <CutListSection projectId={project.id} assemblies={assemblies} items={cutItems} />
        {hasPrinting && (
          <section id="print" className="card section" aria-labelledby="h-print">
            <h2 id="h-print">Print Checklist</h2>
            <p className="hint">Printed parts, files and per-part progress.</p>
            <p className="notice" style={{ marginTop: 10 }}>File upload and the print checklist arrive in the next phase.</p>
          </section>
        )}
        <StepsSection projectId={project.id} phases={phases} steps={steps} />
      </div>
    </>
  );
}
