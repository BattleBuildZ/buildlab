import type { Metadata } from "next";
import Link from "next/link";
import AddComponentButton from "@/components/electronics/AddComponentButton";
import CsvImport from "@/components/electronics/CsvImport";
import DefaultCategories from "@/components/electronics/DefaultCategories";
import { isLow, TEST_STATUS_BADGE, TEST_STATUS_LABEL, type Category, type ComponentRow, type Location } from "@/lib/electronics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Component Inventory" };

type Row = Pick<ComponentRow, "id" | "name" | "part_number" | "variant" | "manufacturer" | "category_id" | "storage_location_id" | "quantity_on_hand" | "min_stock_threshold" | "test_status" | "condition" | "archived_at">;

export default async function InventoryPage({ searchParams }: PageProps<"/electronics/inventory">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = pick("q").trim(), cat = pick("cat"), loc = pick("loc"), stock = pick("stock"), test = pick("test"), archived = pick("archived") === "1";

  const supabase = await createClient();
  let query = supabase
    .from("electronic_components")
    .select("id,name,part_number,variant,manufacturer,category_id,storage_location_id,quantity_on_hand,min_stock_threshold,test_status,condition,archived_at")
    .order("name")
    .limit(1000);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    const quoted = `"${like.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    query = query.or(["name", "part_number", "variant", "manufacturer", "description"].map((f) => `${f}.ilike.${quoted}`).join(","));
  }
  if (/^[0-9a-f-]{36}$/i.test(cat)) query = query.eq("category_id", cat);
  if (/^[0-9a-f-]{36}$/i.test(loc)) query = query.eq("storage_location_id", loc);
  if (test in TEST_STATUS_LABEL) query = query.eq("test_status", test);

  const [res, cats, locs] = await Promise.all([
    query,
    supabase.from("component_categories").select("id,name,is_custom").order("sort_order").order("name"),
    supabase.from("component_storage_locations").select("id,name,kind,parent_id,notes,qr_token,archived_at").order("name"),
  ]);
  if (res.error) return <div className="error" role="alert">Could not load components: {res.error.message}</div>;
  const categories = (cats.data ?? []) as Category[];
  const locations = (locs.data ?? []) as Location[];
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  let rows = (res.data ?? []) as Row[];
  if (stock === "low") rows = rows.filter((r) => isLow(r));
  if (stock === "out") rows = rows.filter((r) => r.quantity_on_hand === 0);
  const filtered = Boolean(q || cat || loc || stock || test || archived);
  const lowCount = ((res.data ?? []) as Row[]).filter((r) => isLow(r) && !r.archived_at).length;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Electronics</p>
          <h1>Component Inventory</h1>
          <p className="lede">Parts, quantities and where they live. Quantities change only through recorded stock movements.</p>
        </div>
        <div className="row">
          <CsvImport />
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
          <a className="btn" href="/electronics/inventory/export?type=components">Export CSV</a>
          <AddComponentButton categories={categories} locations={locations} />
        </div>
      </div>

      {categories.length === 0 && <DefaultCategories />}

      <form className="filters" action="/electronics/inventory" role="search" aria-label="Filter components" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor="i-q">Search</label>
          <input id="i-q" name="q" className="input" defaultValue={q} placeholder="Name, part number, variant, manufacturer" />
        </div>
        <div className="field">
          <label htmlFor="i-cat">Category</label>
          <select id="i-cat" name="cat" className="select" defaultValue={cat}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="i-loc">Location</label>
          <select id="i-loc" name="loc" className="select" defaultValue={loc}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="i-stock">Stock</label>
          <select id="i-stock" name="stock" className="select" defaultValue={stock}>
            <option value="">Any</option>
            <option value="low">Low or out</option>
            <option value="out">Out of stock</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="i-test">Test status</label>
          <select id="i-test" name="test" className="select" defaultValue={test}>
            <option value="">Any</option>
            {Object.entries(TEST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <label className="inline-check" style={{ alignSelf: "end", minHeight: 42 }}>
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} /> Archived only
        </label>
        <button type="submit" className="btn" style={{ alignSelf: "end" }}>Apply</button>
      </form>

      {!archived && lowCount > 0 && !filtered && (
        <p className="notice" role="status" style={{ marginBottom: 12 }}>
          {lowCount} component{lowCount === 1 ? " is" : "s are"} at or below the low-stock level. <Link href="/electronics/inventory?stock=low">Show them</Link>
        </p>
      )}

      {rows.length === 0 ? (
        filtered ? (
          <div className="empty"><h2>No matching components</h2><p>Nothing matches those filters. <Link href="/electronics/inventory">Clear filters</Link></p></div>
        ) : (
          <div className="empty">
            <h2>No components yet</h2>
            <p>Add your first part, or import a CSV. Nothing here is pre-filled, and you do not need a project to use the inventory.</p>
            <AddComponentButton categories={categories} locations={locations} label="Add your first component" />
          </div>
        )
      ) : (
        <>
          <p className="hint pagehint" aria-live="polite">{rows.length} component{rows.length === 1 ? "" : "s"}{res.data && res.data.length >= 1000 ? " (showing the first 1000)" : ""}</p>
          <div className="table-wrap">
            <table className="inv-table">
              <thead>
                <tr><th>Component</th><th>Part number</th><th>Category</th><th>Location</th><th>On hand</th><th>Test</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Component">
                      <Link href={`/electronics/inventory/${r.id}`}>{r.name}</Link>
                      {r.manufacturer && <div className="hint">{r.manufacturer}</div>}
                    </td>
                    <td data-label="Part">{r.part_number ?? "—"}{r.variant ? <span className="hint"> · {r.variant}</span> : null}</td>
                    <td data-label="Category">{r.category_id ? catName.get(r.category_id) ?? "—" : "—"}</td>
                    <td data-label="Location">{r.storage_location_id ? locName.get(r.storage_location_id) ?? "—" : "—"}</td>
                    <td data-label="On hand">
                      <span className="qty" data-low={isLow(r) && r.quantity_on_hand > 0} data-out={r.quantity_on_hand === 0}>{r.quantity_on_hand}</span>
                      {r.quantity_on_hand === 0 ? <span className="unverified" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Out</span> : isLow(r) ? <span className="unverified">Low</span> : null}
                    </td>
                    <td data-label="Test"><span className={`badge ${TEST_STATUS_BADGE[r.test_status] ?? "badge-type"}`}>{TEST_STATUS_LABEL[r.test_status] ?? r.test_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
