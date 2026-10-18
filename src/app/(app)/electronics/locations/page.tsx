import type { Metadata } from "next";
import Link from "next/link";
import { AddLocationButton, EditLocationButtons } from "@/components/electronics/LocationForm";
import { LOCATION_KIND_LABEL, type Location } from "@/lib/electronics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Storage Locations" };

export default async function LocationsPage({ searchParams }: PageProps<"/electronics/locations">) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const supabase = await createClient();
  const [locs, comps] = await Promise.all([
    supabase.from("component_storage_locations").select("id,name,kind,parent_id,notes,qr_token,archived_at").order("name"),
    supabase.from("electronic_components").select("storage_location_id").is("archived_at", null).not("storage_location_id", "is", null).limit(5000),
  ]);
  if (locs.error) return <div className="error" role="alert">Could not load locations: {locs.error.message}</div>;
  const all = (locs.data ?? []) as Location[];
  const counts = new Map<string, number>();
  for (const c of comps.data ?? []) counts.set(c.storage_location_id as string, (counts.get(c.storage_location_id as string) ?? 0) + 1);
  const visible = all.filter((l) => showArchived || !l.archived_at);
  const ids = new Set(visible.map((l) => l.id));
  const childrenOf = (pid: string | null) => visible.filter((l) => (l.parent_id && ids.has(l.parent_id) ? l.parent_id : null) === pid);

  function Branch({ pid }: { pid: string | null }) {
    const items = childrenOf(pid);
    if (!items.length) return null;
    return (
      <ul className="loc-tree">
        {items.map((l) => (
          <li key={l.id}>
            <div className="loc-item">
              <div>
                <Link href={`/electronics/locations/${l.id}`}><b>{l.name}</b></Link>{" "}
                <span className="badge badge-type">{LOCATION_KIND_LABEL[l.kind]}</span>
                {l.archived_at && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Archived</span>}
                <div className="hint">{counts.get(l.id) ?? 0} component{(counts.get(l.id) ?? 0) === 1 ? "" : "s"}{l.notes ? ` · ${l.notes}` : ""}</div>
              </div>
              <div className="row"><EditLocationButtons location={l} locations={all} /></div>
            </div>
            <Branch pid={l.id} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Electronics</p>
          <h1>Storage Locations</h1>
          <p className="lede">Cabinets, drawers, bins and shelves. Each has a printable QR label.</p>
        </div>
        <AddLocationButton locations={all} />
      </div>
      <p className="hint pagehint">
        {showArchived ? <Link href="/electronics/locations">Hide archived</Link> : <Link href="/electronics/locations?archived=1">Show archived</Link>}
      </p>
      {visible.length === 0 ? (
        <div className="empty">
          <h2>No storage locations yet</h2>
          <p>Add a drawer, bin or shelf so you can find parts later. You can also use the inventory without any locations.</p>
          <AddLocationButton locations={all} label="Add your first location" />
        </div>
      ) : (
        <Branch pid={null} />
      )}
    </>
  );
}
