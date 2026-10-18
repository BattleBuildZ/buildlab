"use client";

import { useState } from "react";
import {
  addPrintLink, addPrintUpload, deletePrintFile, deletePrintPart, getFileUrl, savePrintPart, setPrintPartDone,
} from "@/app/(app)/projects/[id]/actions-files";
import { fmtBytes, PRINT_ACCEPT } from "@/lib/files";
import type { CutItem, PrintFile, PrintPart } from "@/lib/project-types";
import { discardUpload, uploadProjectFile } from "@/lib/upload";
import Modal from "../Modal";
import { ConfirmDelete, ErrorLine, Meter, useRun } from "./ui";

function PartForm({ projectId, part, cutItems, onDone }: { projectId: string; part?: PrintPart; cutItems: CutItem[]; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const [linked, setLinked] = useState<string[]>(part?.print_part_cut_items.map((l) => l.cut_list_item_id) ?? []);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () => savePrintPart(projectId, part?.id ?? null, {
        name: f.get("name"), quantity: f.get("qty"), material: f.get("material") ?? "", infill: f.get("infill") ?? "",
        supports: f.get("supports") ?? "", orientation: f.get("orientation") ?? "", notes: f.get("notes") ?? "", cut_item_ids: linked,
      }),
      onDone,
    );
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="two">
        <div className="field">
          <label htmlFor="pp-name">Part name</label>
          <input id="pp-name" name="name" className="input" required maxLength={160} defaultValue={part?.name} autoFocus placeholder="e.g. Corner bracket" />
        </div>
        <div className="field">
          <label htmlFor="pp-qty">Quantity</label>
          <input id="pp-qty" name="qty" className="input" type="number" min={1} max={1000} step={1} defaultValue={part?.quantity ?? 1} />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="pp-mat">Material</label>
          <input id="pp-mat" name="material" className="input" maxLength={120} defaultValue={part?.material ?? ""} placeholder="PETG, PLA…" />
        </div>
        <div className="field">
          <label htmlFor="pp-infill">Infill</label>
          <input id="pp-infill" name="infill" className="input" maxLength={120} defaultValue={part?.infill ?? ""} placeholder="e.g. 20%" />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="pp-sup">Supports</label>
          <input id="pp-sup" name="supports" className="input" maxLength={120} defaultValue={part?.supports ?? ""} placeholder="None, tree, everywhere…" />
        </div>
        <div className="field">
          <label htmlFor="pp-ori">Orientation</label>
          <input id="pp-ori" name="orientation" className="input" maxLength={200} defaultValue={part?.orientation ?? ""} placeholder="Flat on bed…" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pp-notes">Notes (optional)</label>
        <textarea id="pp-notes" name="notes" className="textarea" maxLength={2000} defaultValue={part?.notes ?? ""} />
        <span className="hint">Write any size in both mm and in.</span>
      </div>
      {cutItems.length > 0 && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Replaces or goes with these cut pieces (optional)</legend>
          <div className="checks" style={{ marginTop: 6 }}>
            {cutItems.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={linked.includes(c.id)} onChange={(e) => setLinked(e.target.checked ? [...linked, c.id] : linked.filter((x) => x !== c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : part ? "Save changes" : "Add part"}</button>
      </div>
    </form>
  );
}

function AddFileForm({ projectId, part, onDone }: { projectId: string; part: PrintPart; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const [mode, setMode] = useState<"upload" | "link">("upload");
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (mode === "link") {
      run(() => addPrintLink(projectId, part.id, { url: f.get("url"), filename: f.get("label") ?? "" }), onDone);
      return;
    }
    const files = Array.from((form.elements.namedItem("file") as HTMLInputElement).files ?? []);
    if (!files.length) return;
    run(async () => {
      for (const file of files) {
        const up = await uploadProjectFile(projectId, file, { mode: "print" });
        if (!up.ok) return { ok: false as const, error: up.error };
        const r = await addPrintUpload(projectId, part.id, up.meta);
        if (!r.ok) {
          await discardUpload(up.meta);
          return r;
        }
      }
      return { ok: true as const };
    }, onDone);
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="seg-toggle" role="group" aria-label="File source">
        <button type="button" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>Upload file</button>
        <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>Link</button>
      </div>
      {mode === "upload" ? (
        <div className="field">
          <label htmlFor="pf-file">Print file</label>
          <input id="pf-file" name="file" className="input" type="file" required multiple accept={PRINT_ACCEPT} />
          <span className="hint">STL, 3MF, STEP, G-code, OBJ or ZIP, up to 50 MB each.</span>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="pf-url">Link</label>
            <input id="pf-url" name="url" className="input" type="url" required maxLength={2000} placeholder="https://…" />
          </div>
          <div className="field">
            <label htmlFor="pf-label">Label (optional)</label>
            <input id="pf-label" name="label" className="input" maxLength={160} placeholder="e.g. Printables page" />
          </div>
        </>
      )}
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : mode === "upload" ? "Upload" : "Add link"}</button>
      </div>
    </form>
  );
}

function FileRow({ projectId, file }: { projectId: string; file: PrintFile }) {
  const open = useRun();
  const del = useRun();
  const name = file.filename || file.url || "File";
  function download() {
    // The signed link is served as an attachment, so the browser downloads it without leaving this page.
    open.run(async () => {
      const r = await getFileUrl(projectId, file.asset_id!, "original", true);
      if (r.ok && r.data) window.location.assign(r.data.url);
      return r;
    });
  }
  return (
    <li className="check-row" aria-busy={open.pending || del.pending} style={{ padding: "6px 0" }}>
      <span className="check-main" style={{ cursor: "default" }}>
        <span>
          <b>{name}</b>
          <span className="hint block">{file.kind === "upload" ? `Uploaded · ${fmtBytes(file.project_assets?.size_bytes)}` : "Link"}</span>
        </span>
      </span>
      <span className="row">
        {file.kind === "link" ? (
          <a className="btn btn-sm" href={file.url ?? "#"} target="_blank" rel="noreferrer noopener">Open</a>
        ) : (
          <button type="button" className="btn btn-sm" onClick={download} disabled={open.pending}>{open.pending ? "Opening…" : "Download"}</button>
        )}
        <ConfirmDelete label="Remove file" what={name} pending={del.pending} onConfirm={() => del.run(() => deletePrintFile(projectId, file.id))} />
      </span>
      <ErrorLine error={open.error ?? del.error} />
    </li>
  );
}

function PartCard({ projectId, part, cutItems }: { projectId: string; part: PrintPart; cutItems: CutItem[] }) {
  const toggle = useRun();
  const del = useRun();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const isDone = Boolean(part.completed_at);
  const specs = [part.material, part.infill && `${part.infill} infill`, part.supports && `supports: ${part.supports}`, part.orientation].filter(Boolean);
  const linked = part.print_part_cut_items.map((l) => cutItems.find((c) => c.id === l.cut_list_item_id)?.name).filter(Boolean) as string[];
  return (
    <li className="part-card" data-done={isDone} aria-busy={toggle.pending || del.pending} style={{ listStyle: "none" }}>
      <div className="check-row" style={{ border: 0, padding: 0 }}>
        <label className="check-main">
          <input type="checkbox" checked={isDone} disabled={toggle.pending} onChange={(e) => toggle.run(() => setPrintPartDone(projectId, part.id, e.target.checked))} aria-label={`${part.name} printed`} />
          <span>
            <b>{part.name}{part.quantity ? ` ×${part.quantity}` : ""}</b>
            <span className="hint block">{isDone ? "Printed" : "Not printed yet"}{specs.length ? ` · ${specs.join(" · ")}` : ""}</span>
          </span>
        </label>
        <span className="row no-print">
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>Add file</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${part.name}`}>Edit</button>
          <ConfirmDelete label="Delete part" what={`${part.name}${part.print_files.some((f) => f.kind === "upload") ? " and its uploaded files" : ""}`} pending={del.pending} onConfirm={() => del.run(() => deletePrintPart(projectId, part.id))} />
        </span>
      </div>
      {part.notes && <p className="cut-note prewrap">{part.notes}</p>}
      {linked.length > 0 && <div className="chips" aria-label="Linked cut pieces">{linked.map((n) => <span key={n} className="chip">{n}</span>)}</div>}
      {part.print_files.length > 0 ? (
        <ul className="checklist" aria-label={`Files for ${part.name}`}>
          {part.print_files.map((f) => <FileRow key={f.id} projectId={projectId} file={f} />)}
        </ul>
      ) : (
        <p className="hint">No print file attached yet.</p>
      )}
      <ErrorLine error={toggle.error ?? del.error} />
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit part">
        <PartForm projectId={projectId} part={part} cutItems={cutItems} onDone={() => setEditing(false)} />
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title={`Add file to ${part.name}`}>
        <AddFileForm projectId={projectId} part={part} onDone={() => setAdding(false)} />
      </Modal>
    </li>
  );
}

export default function PrintSection({ projectId, parts, cutItems }: { projectId: string; parts: PrintPart[]; cutItems: CutItem[] }) {
  const [adding, setAdding] = useState(false);
  const done = parts.filter((p) => p.completed_at).length;
  const ordered = [...parts].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <section id="print" className="card section" aria-labelledby="h-print">
      <div className="section-head">
        <div>
          <h2 id="h-print">Print Checklist</h2>
          <p className="hint">Each printed part with its settings and file. Check a part off once it is printed.</p>
        </div>
        <button type="button" className="btn btn-primary no-print" onClick={() => setAdding(true)}>Add part</button>
      </div>
      {parts.length === 0 ? (
        <p className="empty-inline">No printed parts yet. Add each part, then attach its STL, 3MF or other file.</p>
      ) : (
        <>
          <span className="hint" aria-live="polite">{done} of {parts.length} parts printed</span>
          <Meter done={done} total={parts.length} label="Print progress" />
          <ul className="stack" style={{ padding: 0, margin: 0 }}>
            {ordered.map((p) => <PartCard key={p.id} projectId={projectId} part={p} cutItems={cutItems} />)}
          </ul>
        </>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add printed part">
        <PartForm projectId={projectId} cutItems={cutItems} onDone={() => setAdding(false)} />
      </Modal>
    </section>
  );
}
