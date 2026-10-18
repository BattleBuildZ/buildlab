import Link from "next/link";
import { notFound } from "next/navigation";
import CutListSection from "@/components/project/CutListSection";
import DeleteProjectButton from "@/components/DeleteProjectButton";
import EditProjectButton from "@/components/project/EditProjectButton";
import FilesPanel from "@/components/project/FilesPanel";
import HardwareSection from "@/components/project/HardwareSection";
import PrintSection from "@/components/project/PrintSection";
import StepsSection from "@/components/project/StepsSection";
import Summary from "@/components/project/Summary";
import { FABRICATION_BADGE, FABRICATION_LABEL, STATUS_LABEL, type FabricationType } from "@/lib/fabrication";
import type { Asset, Assembly, CutItem, Hardware, Phase, PrintPart, Step } from "@/lib/project-types";
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
    .select("id,name,description,type,status,thumbnail_asset_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const [asm, cut, hw, ph, st, pp, as] = await Promise.all([
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
    supabase
      .from("print_parts")
      .select("id,name,quantity,material,infill,supports,orientation,notes,completed_at,sort_order,print_files(id,kind,url,asset_id,filename,project_assets(id,size_bytes)),print_part_cut_items(cut_list_item_id)")
      .eq("project_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("project_assets")
      .select("id,kind,original_filename,mime_type,size_bytes,display_path,storage_path,width_px,height_px,created_at")
      .eq("project_id", id)
      .neq("kind", "print_file")
      .order("created_at", { ascending: false }),
  ]);
  const failed = [asm, cut, hw, ph, st, pp, as].find((r) => r.error);
  if (failed?.error) return <div className="error" role="alert">Could not load this project: {failed.error.message}</div>;

  const assemblies = (asm.data ?? []) as Assembly[];
  const cutItems = (cut.data ?? []) as unknown as CutItem[];
  const hardware = (hw.data ?? []) as Hardware[];
  const phases = (ph.data ?? []) as Phase[];
  const steps = (st.data ?? []) as Step[];
  const printParts = (pp.data ?? []) as unknown as PrintPart[];
  const rawAssets = (as.data ?? []) as Omit<Asset, "previewUrl">[];
  // Small signed links for image previews (the ~640 px copy when there is one).
  const previewPaths = rawAssets.filter((a) => String(a.mime_type ?? "").startsWith("image/")).map((a) => a.display_path ?? a.storage_path);
  const signed = previewPaths.length ? await supabase.storage.from("project-files").createSignedUrls(previewPaths, 3600) : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((u) => [u.path ?? "", u.signedUrl]));
  const assets: Asset[] = rawAssets.map((a) => ({ ...a, previewUrl: urlByPath.get(a.display_path ?? a.storage_path) ?? null }));
  const heroUrl = assets.find((a) => a.id === project.thumbnail_asset_id)?.previewUrl ?? null;

  const types = [...new Set(assemblies.map((a) => a.fabrication_type as FabricationType))];
  const hasPrinting = types.includes("3d_printing");
  const openCut = cutItems.some((i) => i.cut_units.some((u) => !u.completed_at));

  return (
    <>
      <div className="crumbs"><Link href="/projects">Projects</Link> / {project.name}</div>
      <div className="page-head">
        <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "nowrap" }}>
         {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="thumb-hero" src={heroUrl} alt={`Photo of ${project.name}`} />
         )}
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
        >
          <FilesPanel projectId={project.id} assets={assets} photoId={project.thumbnail_asset_id} />
        </Summary>
        <HardwareSection projectId={project.id} items={hardware} />
        <CutListSection projectId={project.id} assemblies={assemblies} items={cutItems} />
        {hasPrinting && <PrintSection projectId={project.id} parts={printParts} cutItems={cutItems} />}
        <StepsSection projectId={project.id} phases={phases} steps={steps} />
      </div>
    </>
  );
}
