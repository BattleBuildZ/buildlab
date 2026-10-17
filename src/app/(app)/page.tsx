import type { Metadata } from "next";
import NewProjectDialog from "@/components/NewProjectDialog";
import ProjectList from "@/components/ProjectList";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Your builds</h1>
        </div>
        <NewProjectDialog />
      </div>
      <ProjectList filters={{ q: pick("q"), status: pick("status"), fab: pick("fab") }} action="/" />
    </>
  );
}
