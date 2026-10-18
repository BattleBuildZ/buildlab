import Link from "next/link";
import { notFound } from "next/navigation";
import { EditLocationButtons } from "@/components/electronics/LocationForm";
import QrLabel from "@/components/electronics/QrLabel";
import { isLow, LOCATION_KIND_LABEL, type Location } from "@/lib/electronics";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LocationPage({ params }: PageProps<"/electronics/locations/[id]">) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const supabase = await createClient();
  const { data: l } = await supabase.from("component_storage_locations").select("id,name,kind,parent_id,notes,qr_token,archived_at").eq("id", id).maybeSingle();
  if (!l) notFound();
  const loc = l as Location;
  const [all, inside, kids] = await Promise.all([
    supabase.from("component_storage_locations").select("id,name,kind,parent_id,notes,qr_token,archived_at").order("name"),
    supabase.from("electronic_components").select("id,name,part_number,quantity_on_hand,min_stock_threshold").eq("storage_location_id", id).is("archived_at", null).order("name"),
    supabase.from("component_storage_locations").select("id,name,kind").eq("parent_id", id).is("archived_at", null).order("name"),
  ]);
  const locations = (all.data ?? []) as Location[];
  const parent = locations.find((x) => x.id === loc.parent_id);
  const items = inside.data ?? [];

  return (
    <>
      <div className="crumbs"><Link href="/electronics/locations">Storage Locations</Link>{parent && <> / <Link href={`/electronics/locations/${parent.id}`}>{parent.name}</Link></>} / {loc.name}</div>
      <div className="page-head">
        <div>
          <h1>{loc.name}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="badge badge-type">{LOCATION_KIND_LABEL[loc.kind]}</span>
            {loc.archived_at && <span className="badge badge-warn">Archived</span>}
          </div>
          {loc.notes && <p className="lede">{loc.notes}</p>}
        </div>
        <div className="row no-print"><EditLocationButtons location={loc} locations={locations} /></div>
      </div>
      <div className="stack">
        {(kids.data ?? []).length > 0 && (
          <section className="card section">
            <h2 style={{ fontSize: 20 }}>Inside this location</h2>
            <ul className="stack" style={{ padding: 0, margin: 0, listStyle: "none" }}>
              {(kids.data ?? []).map((k) => <li key={k.id}><Link href={`/electronics/locations/${k.id}`}>{k.name}</Link> <span className="hint">· {LOCATION_KIND_LABEL[k.kind as keyof typeof LOCATION_KIND_LABEL]}</span></li>)}
            </ul>
          </section>
        )}
        <section className="card section" aria-labelledby="h-contents">
          <h2 id="h-contents" style={{ fontSize: 20 }}>Components here</h2>
          {items.length === 0 ? <p className="empty-inline">Nothing is assigned to this location. Set a component&rsquo;s storage location from its page.</p> : (
            <div className="table-wrap">
              <table className="inv-table">
                <thead><tr><th>Component</th><th>Part number</th><th>On hand</th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Component"><Link href={`/electronics/inventory/${c.id}`}>{c.name}</Link></td>
                      <td data-label="Part">{c.part_number ?? "—"}</td>
                      <td data-label="On hand"><span className="qty" data-low={isLow(c) && c.quantity_on_hand > 0} data-out={c.quantity_on_hand === 0}>{c.quantity_on_hand}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card section" aria-labelledby="h-qr">
          <h2 id="h-qr" style={{ fontSize: 20 }}>Label</h2>
          <p className="hint">Scanning it while signed in opens this location and what is stored here.</p>
          <QrLabel token={loc.qr_token} title={loc.name} subtitle={LOCATION_KIND_LABEL[loc.kind]} />
        </section>
      </div>
    </>
  );
}
