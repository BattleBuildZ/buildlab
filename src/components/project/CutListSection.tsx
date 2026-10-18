"use client";

import { useMemo, useState } from "react";
import {
  addAssembly, deleteAssembly, deleteCutItem, renameAssembly, saveCutItem, setCutUnits,
} from "@/app/(app)/projects/[id]/actions";
import { fmtIn, fmtMm } from "@/lib/dimensions";
import { FABRICATION_BADGE, FABRICATION_LABEL, FABRICATION_TYPES, type FabricationType } from "@/lib/fabrication";
import type { Assembly, CutItem, CutUnit } from "@/lib/project-types";
import Modal from "../Modal";
import { ConfirmDelete, ErrorLine, Meter, useRun } from "./ui";

const LABELS = ["length", "width", "thickness", "height", "depth", "diameter"];
const sorted = <T extends { sort_order: number }>(a: T[]) => [...a].sort((x, y) => x.sort_order - y.sort_order);
const done = (i: CutItem) => i.cut_units.filter((u) => u.completed_at).length;

/* -------------------------------------------------------------- piece form */

type DimRow = { key: string; id?: string; label: string; mm: string; inch: string };
let keySeq = 0;
const nextKey = () => `d${++keySeq}`;
const num = (v: number | string | null) => (v === null ? "" : String(parseFloat(String(v))));

function ItemForm({
  projectId, assemblies, item, defaultAssembly, onDone,
}: {
  projectId: string; assemblies: Assembly[]; item?: CutItem; defaultAssembly?: string; onDone: () => void;
}) {
  const { pending, error, run } = useRun();
  const [dims, setDims] = useState<DimRow[]>(() =>
    item && item.cut_item_dimensions.length
      ? sorted(item.cut_item_dimensions).map((d) => ({ key: nextKey(), id: d.id, label: d.label, mm: num(d.mm), inch: num(d.inch) }))
      : [{ key: nextKey(), label: "length", mm: "", inch: "" }],
  );
  const [qty, setQty] = useState(String(item?.quantity ?? 1));
  const shrinking = item && Number(qty) < item.quantity && item.cut_units.some((u) => u.completed_at && u.unit_index > Number(qty));
  const patch = (key: string, p: Partial<DimRow>) => setDims((d) => d.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () => saveCutItem(projectId, item?.id ?? null, {
        assembly_id: f.get("assembly"),
        name: f.get("name"),
        material: f.get("material") ?? "",
        quantity: qty,
        fabrication_note: f.get("note") ?? "",
        product_url: f.get("url") ?? "",
        dims: dims.map(({ id, label, mm, inch }) => ({ id, label, mm, inch })),
      }),
      onDone,
    );
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="ci-asm">Assembly</label>
        <select id="ci-asm" name="assembly" className="select" defaultValue={item?.assembly_id ?? defaultAssembly ?? assemblies[0]?.id}>
          {assemblies.map((a) => <option key={a.id} value={a.id}>{a.name} ({FABRICATION_LABEL[a.fabrication_type]})</option>)}
        </select>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="ci-name">Piece name</label>
          <input id="ci-name" name="name" className="input" required maxLength={160} defaultValue={item?.name} autoFocus placeholder="e.g. Shelf rail" />
        </div>
        <div className="field">
          <label htmlFor="ci-qty">Quantity</label>
          <input id="ci-qty" className="input" type="number" min={1} max={1000} step={1} required value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>
      {shrinking && <div className="notice" role="status">Lowering the quantity removes the highest-numbered units, including some already marked done.</div>}
      <div className="field">
        <label htmlFor="ci-mat">Material (optional)</label>
        <input id="ci-mat" name="material" className="input" maxLength={160} defaultValue={item?.material ?? ""} placeholder="e.g. 19 mm (3/4 in) birch plywood" />
      </div>

      <fieldset className="dims">
        <legend className="label">Dimensions</legend>
        <p className="hint">Type each value yourself. mm and in are separate boxes and are never converted for you. Inches accept 23.625 or 23 5/8.</p>
        {dims.map((d, idx) => (
          <div className="dim-row" key={d.key}>
            <div className="field">
              <label htmlFor={`dl-${d.key}`}>Label</label>
              <input id={`dl-${d.key}`} className="input" list="dim-labels" value={d.label} maxLength={40} onChange={(e) => patch(d.key, { label: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`dm-${d.key}`}>mm</label>
              <input id={`dm-${d.key}`} className="input" inputMode="decimal" value={d.mm} onChange={(e) => patch(d.key, { mm: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`di-${d.key}`}>in</label>
              <input id={`di-${d.key}`} className="input" inputMode="text" value={d.inch} onChange={(e) => patch(d.key, { inch: e.target.value })} />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDims((r) => r.filter((x) => x.key !== d.key))} aria-label={`Remove dimension ${idx + 1}`}>Remove</button>
          </div>
        ))}
        <datalist id="dim-labels">{LABELS.map((l) => <option key={l} value={l} />)}</datalist>
        <button type="button" className="btn btn-sm" onClick={() => setDims((r) => [...r, { key: nextKey(), label: LABELS[Math.min(r.length, LABELS.length - 1)], mm: "", inch: "" }])}>
          Add dimension
        </button>
      </fieldset>

      <div className="field">
        <label htmlFor="ci-note">Cutting note (optional)</label>
        <textarea id="ci-note" name="note" className="textarea" maxLength={1000} defaultValue={item?.fabrication_note ?? ""} placeholder="Grain direction, miter angle, edge treatment…" />
      </div>
      <div className="field">
        <label htmlFor="ci-url">Link (optional)</label>
        <input id="ci-url" name="url" className="input" type="url" maxLength={2000} defaultValue={item?.product_url ?? ""} />
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Add piece"}</button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- tiles and cards */

function Tile({ projectId, unit, item }: { projectId: string; unit: CutUnit; item: CutItem }) {
  const { pending, error, run } = useRun();
  const on = Boolean(unit.completed_at);
  return (
    <span className="tile-wrap">
      <button
        type="button"
        className="tile"
        aria-pressed={on}
        aria-busy={pending}
        disabled={pending}
        title={error ?? undefined}
        aria-label={`${item.name}, piece ${unit.unit_index} of ${item.quantity}${on ? ", cut" : ", not cut"}`}
        onClick={() => run(() => setCutUnits(projectId, [unit.id], !on))}
      >
        <span aria-hidden="true">{on ? "✓" : ""}</span>
        <small>{unit.unit_index}</small>
      </button>
      {error && <span className="tile-err" role="alert">!</span>}
    </span>
  );
}

function DimList({ item }: { item: CutItem }) {
  const dims = sorted(item.cut_item_dimensions);
  if (!dims.length) return <p className="hint">No size entered yet — edit the piece to add mm and in.</p>;
  return (
    <table className="dimtable">
      <thead><tr><th scope="col">Dimension</th><th scope="col">mm</th><th scope="col">in</th></tr></thead>
      <tbody>
        {dims.map((d) => (
          <tr key={d.id}>
            <th scope="row">{d.label}</th>
            <td>{fmtMm(d.mm)}</td>
            <td>{fmtIn(d.inch)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ItemCard({ projectId, item, assemblies, assemblyName, compact }: { projectId: string; item: CutItem; assemblies: Assembly[]; assemblyName?: string; compact?: boolean }) {
  const bulk = useRun();
  const del = useRun();
  const [editing, setEditing] = useState(false);
  const d = done(item);
  const units = [...item.cut_units].sort((a, b) => a.unit_index - b.unit_index);
  const allDone = item.quantity > 0 && d === item.quantity;
  return (
    <article className="cut-card" data-done={allDone} aria-label={item.name}>
      <header className="cut-head">
        <div>
          <h4>{item.name}{allDone && <span className="done-flag"> · all cut</span>}</h4>
          <p className="hint">
            ×{item.quantity}
            {item.material && <> · {item.material}</>}
            {assemblyName && <> · {assemblyName}</>}
          </p>
          {item.needs_review && <p className="notice" style={{ marginTop: 6 }}>Check these values{item.review_note ? `: ${item.review_note}` : "."}</p>}
        </div>
        <span className="hint nowrap" aria-live="polite">{d}/{item.quantity} cut</span>
      </header>
      {!compact && <DimList item={item} />}
      {compact && (
        <p className="hint">{sorted(item.cut_item_dimensions).map((x) => `${x.label} ${fmtMm(x.mm)} / ${fmtIn(x.inch)}`).join(" · ") || "No size entered"}</p>
      )}
      {item.fabrication_note && <p className="cut-note">{item.fabrication_note}</p>}
      <Meter done={d} total={item.quantity} label={`${item.name} cut progress`} />
      <div className="tiles" role="group" aria-label={`${item.name} pieces`}>
        {units.map((u) => <Tile key={u.id} projectId={projectId} unit={u} item={item} />)}
      </div>
      <ErrorLine error={bulk.error ?? del.error} />
      <div className="row cut-actions">
        {d < item.quantity ? (
          <button type="button" className="btn btn-sm" disabled={bulk.pending} onClick={() => bulk.run(() => setCutUnits(projectId, units.filter((u) => !u.completed_at).map((u) => u.id), true))}>
            Mark all cut
          </button>
        ) : (
          <button type="button" className="btn btn-sm" disabled={bulk.pending} onClick={() => bulk.run(() => setCutUnits(projectId, units.map((u) => u.id), false))}>
            Reopen all
          </button>
        )}
        {item.product_url && <a className="btn btn-ghost btn-sm" href={item.product_url} target="_blank" rel="noreferrer noopener">Link</a>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${item.name}`}>Edit</button>
        <ConfirmDelete label="Delete" what={item.name} pending={del.pending} onConfirm={() => del.run(() => deleteCutItem(projectId, item.id))} />
      </div>
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit piece">
        <ItemForm projectId={projectId} assemblies={assemblies} item={item} onDone={() => setEditing(false)} />
      </Modal>
    </article>
  );
}

/* -------------------------------------------------------------- assemblies */

function AssemblyForm({ projectId, assembly, onDone }: { projectId: string; assembly?: Assembly; onDone: () => void }) {
  const { pending, error, run } = useRun();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = { name: f.get("name"), fabrication_type: f.get("type") };
    run(() => (assembly ? renameAssembly(projectId, assembly.id, input) : addAssembly(projectId, input)), onDone);
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="as-name">Assembly name</label>
        <input id="as-name" name="name" className="input" required maxLength={80} defaultValue={assembly?.name} autoFocus placeholder="e.g. Frame, Drawer, Lid" />
      </div>
      <div className="field">
        <label htmlFor="as-type">Fabrication</label>
        <select id="as-type" name="type" className="select" defaultValue={assembly?.fabrication_type ?? "woodworking"}>
          {FABRICATION_TYPES.map((t) => <option key={t} value={t}>{FABRICATION_LABEL[t]}</option>)}
        </select>
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : assembly ? "Save" : "Add assembly"}</button>
      </div>
    </form>
  );
}

function AssemblyHead({ projectId, assembly, count, items }: { projectId: string; assembly: Assembly; count: number; items: CutItem[] }) {
  const [editing, setEditing] = useState(false);
  const del = useRun();
  const d = items.reduce((n, i) => n + done(i), 0);
  const t = items.reduce((n, i) => n + i.quantity, 0);
  return (
    <div className="asm-head">
      <div>
        <h3>{assembly.name} <span className={`badge ${FABRICATION_BADGE[assembly.fabrication_type]}`}>{FABRICATION_LABEL[assembly.fabrication_type]}</span></h3>
        <p className="hint">{count} piece type{count === 1 ? "" : "s"} · {d}/{t} cut</p>
      </div>
      <div className="row no-print">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Rename assembly ${assembly.name}`}>Rename</button>
        <ConfirmDelete label="Delete assembly" what={count ? `${assembly.name} and its ${count} piece${count === 1 ? "" : "s"}` : assembly.name} pending={del.pending} onConfirm={() => del.run(() => deleteAssembly(projectId, assembly.id))} />
      </div>
      <ErrorLine error={del.error} />
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit assembly">
        <AssemblyForm projectId={projectId} assembly={assembly} onDone={() => setEditing(false)} />
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------- By Size grouping */

type SizeGroup = { key: string; items: CutItem[]; heading: { label: string; mm: CutItem["cut_item_dimensions"][number]["mm"]; inch: CutItem["cut_item_dimensions"][number]["inch"] }[]; sortMm: number };

function bySize(items: CutItem[]): SizeGroup[] {
  const map = new Map<string, SizeGroup>();
  for (const it of items) {
    const dims = sorted(it.cut_item_dimensions);
    const key = dims.length ? dims.map((d) => `${d.label.toLowerCase()}|${d.mm ?? ""}|${d.inch ?? ""}`).join(";") : "";
    const g = map.get(key) ?? { key, items: [], heading: dims.map((d) => ({ label: d.label, mm: d.mm, inch: d.inch })), sortMm: Number(dims[0]?.mm ?? dims[0]?.inch ?? -1) };
    g.items.push(it);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : b.sortMm - a.sortMm));
}

/* -------------------------------------------------------------- section */

export default function CutListSection({ projectId, assemblies, items }: { projectId: string; assemblies: Assembly[]; items: CutItem[] }) {
  const [view, setView] = useState<"group" | "size">("group");
  const [remaining, setRemaining] = useState(false);
  const [addingPiece, setAddingPiece] = useState(false);
  const [addingAsm, setAddingAsm] = useState(false);
  const asmOrdered = useMemo(() => sorted(assemblies), [assemblies]);
  const asmName = useMemo(() => new Map(assemblies.map((a) => [a.id, a.name])), [assemblies]);
  const totalUnits = items.reduce((n, i) => n + i.quantity, 0);
  const doneUnits = items.reduce((n, i) => n + done(i), 0);
  const visible = remaining ? items.filter((i) => done(i) < i.quantity) : items;

  return (
    <section id="cut-list" className="card section" aria-labelledby="h-cut">
      <div className="section-head">
        <div>
          <h2 id="h-cut">Cut List</h2>
          <p className="hint">Workbench cut list: tap a tile when that piece is cut. Every size is typed in mm and in separately.</p>
        </div>
        <div className="row no-print">
          <button type="button" className="btn" onClick={() => setAddingAsm(true)}>Add assembly</button>
          <button type="button" className="btn btn-primary" disabled={assemblies.length === 0} onClick={() => setAddingPiece(true)}>Add piece</button>
        </div>
      </div>

      {assemblies.length === 0 ? (
        <p className="empty-inline">Cut pieces live inside an assembly (Frame, Drawer, Lid…). Add your first assembly to start the list.</p>
      ) : items.length === 0 ? (
        <p className="empty-inline">No pieces yet. Add each part you need to cut, with its quantity and size.</p>
      ) : (
        <>
          <div className="row between no-print">
            <div className="seg-toggle" role="group" aria-label="Cut list view">
              <button type="button" aria-pressed={view === "group"} onClick={() => setView("group")}>By Group</button>
              <button type="button" aria-pressed={view === "size"} onClick={() => setView("size")}>By Size</button>
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={remaining} onChange={(e) => setRemaining(e.target.checked)} /> Show only pieces still to cut
            </label>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>Print</button>
          </div>
          <span className="hint" aria-live="polite">{doneUnits} of {totalUnits} pieces cut</span>
          <Meter done={doneUnits} total={totalUnits} label="Cut list progress" />

          {visible.length === 0 && <p className="empty-inline">Everything is cut. Untick the filter to see the finished pieces.</p>}

          {view === "group" ? (
            <div className="stack">
              {asmOrdered.map((a) => {
                const all = items.filter((i) => i.assembly_id === a.id).sort((x, y) => x.sort_order - y.sort_order);
                const shown = visible.filter((i) => i.assembly_id === a.id).sort((x, y) => x.sort_order - y.sort_order);
                return (
                  <div key={a.id} className="asm">
                    <AssemblyHead projectId={projectId} assembly={a} count={all.length} items={all} />
                    {shown.length === 0 && all.length === 0 && <p className="hint">No pieces in this assembly yet.</p>}
                    <div className="cut-grid">
                      {shown.map((i) => <ItemCard key={i.id} projectId={projectId} item={i} assemblies={assemblies} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="stack">
              {bySize(visible).map((g) => (
                <div key={g.key || "none"} className="asm">
                  <div className="asm-head">
                    <div>
                      <h3>{g.key === "" ? "No size entered" : "Size"}</h3>
                      {g.key !== "" && (
                        <ul className="sizeline">
                          {g.heading.map((d, i) => <li key={i}><b>{d.label}</b> {fmtMm(d.mm)} · {fmtIn(d.inch)}</li>)}
                        </ul>
                      )}
                      <p className="hint">{g.items.reduce((n, i) => n + i.quantity, 0)} piece{g.items.reduce((n, i) => n + i.quantity, 0) === 1 ? "" : "s"} at this size · {g.items.reduce((n, i) => n + done(i), 0)} cut</p>
                    </div>
                  </div>
                  <div className="cut-grid">
                    {g.items.map((i) => <ItemCard key={i.id} projectId={projectId} item={i} assemblies={assemblies} assemblyName={asmName.get(i.assembly_id)} compact />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={addingAsm} onClose={() => setAddingAsm(false)} title="Add assembly">
        <AssemblyForm projectId={projectId} onDone={() => setAddingAsm(false)} />
      </Modal>
      <Modal open={addingPiece} onClose={() => setAddingPiece(false)} title="Add piece">
        <ItemForm projectId={projectId} assemblies={asmOrdered} onDone={() => setAddingPiece(false)} />
      </Modal>
    </section>
  );
}

export type { FabricationType };
