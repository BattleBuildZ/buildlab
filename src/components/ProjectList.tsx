import Link from "next/link";
import { FABRICATION_BADGE, FABRICATION_LABEL, FABRICATION_TYPES, STATUS_LABEL, type FabricationType } from "@/lib/fabrication";
import { createClient } from "@/lib/supabase/server";
import DeleteProjectButton from "./DeleteProjectButton";
import NewProjectDialog from "./NewProjectDialog";

export type ProjectFilters = { q?: string; status?: string; fab?: string };

type Row = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  updated_at: string;
  assemblies: { fabrication_type: FabricationType }[];
};

export default async function ProjectList({ filters, action }: { filters: ProjectFilters; action: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select("id,name,description,type,status,updated_at,assemblies(fabrication_type)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const q = filters.q?.trim();
  if (q) {
    // Match the project name or description, or anything inside the project: cut pieces, hardware, build steps.
    const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    const [cut, hw, st] = await Promise.all([
      supabase.from("cut_list_items").select("project_id").ilike("name", like).limit(500),
      supabase.from("hardware_items").select("project_id").ilike("name", like).limit(500),
      supabase.from("build_steps").select("project_id").ilike("title", like).limit(500),
    ]);
    const inside = [...new Set([...(cut.data ?? []), ...(hw.data ?? []), ...(st.data ?? [])].map((r) => r.project_id as string))];
    // PostgREST .or() splits on commas and parentheses, so quote the pattern.
    const quoted = `"${like.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const parts = [`name.ilike.${quoted}`, `description.ilike.${quoted}`];
    if (inside.length) parts.push(`id.in.(${inside.join(",")})`);
    query = query.or(parts.join(","));
  }
  if (filters.status && filters.status in STATUS_LABEL) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) return <div className="error" role="alert">Could not load projects: {error.message}</div>;

  let rows = (data ?? []) as unknown as Row[];
  const fab = FABRICATION_TYPES.find((t) => t === filters.fab);
  if (fab) rows = rows.filter((r) => r.assemblies.some((a) => a.fabrication_type === fab));
  const filtered = Boolean(q || filters.status || fab);

  return (
    <>
      <form className="filters" action={action} role="search" aria-label="Filter projects">
        <div className="field">
          <label htmlFor="f-q">Search</label>
          <input id="f-q" name="q" className="input" defaultValue={filters.q ?? ""} placeholder="Project, piece, hardware or step" />
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" className="select" defaultValue={filters.status ?? ""}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-fab">Fabrication</label>
          <select id="f-fab" name="fab" className="select" defaultValue={filters.fab ?? ""}>
            <option value="">All</option>
            {FABRICATION_TYPES.map((t) => (
              <option key={t} value={t}>{FABRICATION_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">Apply</button>
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <div className="empty">
            <h2>No matching projects</h2>
            <p>Nothing matches those filters. <Link href={action}>Clear filters</Link></p>
          </div>
        ) : (
          <div className="empty">
            <h2>No projects yet</h2>
            <p>Start your first build. Everything here is yours — nothing is pre-filled.</p>
            <NewProjectDialog label="Create your first project" />
          </div>
        )
      ) : (
        <ul className="grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((p) => {
            const types = [...new Set(p.assemblies.map((a) => a.fabrication_type))];
            return (
              <li key={p.id} className="card project-card">
                <div className="row">
                  <span className="badge badge-type">{p.type === "sourced" ? "Sourced" : "Custom"}</span>
                  <span className="badge badge-type">{STATUS_LABEL[p.status] ?? p.status}</span>
                </div>
                <h2>
                  <Link href={`/projects/${p.id}`} className="card-link">{p.name}</Link>
                </h2>
                {p.description && <p className="hint" style={{ margin: 0 }}>{p.description}</p>}
                <div className="row">
                  {types.map((t) => (
                    <span key={t} className={`badge ${FABRICATION_BADGE[t]}`}>{FABRICATION_LABEL[t]}</span>
                  ))}
                </div>
                <div className="card-actions">
                  <DeleteProjectButton id={p.id} name={p.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
