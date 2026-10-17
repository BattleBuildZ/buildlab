import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteProjectButton from "@/components/DeleteProjectButton";
import { FABRICATION_BADGE, FABRICATION_LABEL, STATUS_LABEL, type FabricationType } from "@/lib/fabrication";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,description,type,status,assemblies(fabrication_type)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const types = [...new Set((project.assemblies as { fabrication_type: FabricationType }[]).map((a) => a.fabrication_type))];
  const hasPrinting = types.includes("3d_printing");

  // Section order is fixed by the spec; Print Checklist only appears when a 3D Printing assembly exists.
  const sections = [
    { name: "Summary", note: "Progress tiles and an overview of this build." },
    { name: "Hardware & Fasteners", note: "Checklist of screws, nuts, brackets and other hardware." },
    { name: "Cut List", note: "Pieces with per-unit completion tiles, in mm and inches." },
    ...(hasPrinting ? [{ name: "Print Checklist", note: "Printed parts, files and per-part progress." }] : []),
    { name: "Build Steps", note: "Ordered phases and steps." },
  ];

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
        <DeleteProjectButton id={project.id} name={project.name} redirectTo="/projects" />
      </div>

      <div className="stack">
        {sections.map((s) => (
          <section key={s.name} className="card" aria-labelledby={`sec-${s.name}`}>
            <h2 id={`sec-${s.name}`} style={{ fontSize: 20 }}>{s.name}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>{s.note}</p>
            <p className="notice" style={{ marginTop: 10 }}>Not built yet — arrives in a later phase.</p>
          </section>
        ))}
      </div>
    </>
  );
}
