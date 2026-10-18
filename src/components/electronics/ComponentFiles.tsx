"use client";

import { useState } from "react";
import { addComponentFile, addComponentLink, deleteComponentAsset, getComponentFileUrl, setAssetVerified } from "@/app/(app)/electronics/actions";
import { fmtBytes, IMAGE_MIME } from "@/lib/files";
import { discardUpload, uploadProjectFile } from "@/lib/upload";
import Modal from "../Modal";
import { ConfirmDelete, ErrorLine, useRun } from "../project/ui";
import Viewer, { type ViewerFile } from "../project/Viewer";

export type CAsset = {
  id: string; kind: string; title: string | null; original_filename: string | null; mime_type: string | null; size_bytes: number | string | null;
  external_url: string | null; verified: boolean; source_url: string | null; variant: string | null; target_board: string | null;
  storage_path: string | null; previewUrl: string | null;
};
const KINDS = [["photo", "Photo"], ["datasheet", "Datasheet"], ["pinout", "Pinout"], ["wiring", "Wiring diagram"], ["document", "Document"], ["other", "Other"]] as const;
const KIND_LABEL = Object.fromEntries(KINDS);

function AddForm({ componentId, variant, onDone }: { componentId: string; variant: string | null; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("datasheet");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const prov = {
      title: f.get("title") ?? "", verified: f.get("verified") === "on", source_url: f.get("source") ?? "",
      variant: f.get("variant") ?? "", target_board: kind === "wiring" ? f.get("board") ?? "" : "",
    };
    if (mode === "link") return run(() => addComponentLink(componentId, { kind, external_url: f.get("url"), ...prov }), onDone);
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;
    run(async () => {
      const isImage = IMAGE_MIME.includes(file.type);
      const up = await uploadProjectFile(componentId, file, { mode: "document", optimize: isImage, bucket: "component-files" });
      if (!up.ok) return { ok: false as const, error: up.error };
      const r = await addComponentFile(componentId, { kind, ...up.meta, ...prov });
      if (!r.ok) await discardUpload(up.meta, "component-files");
      return r;
    }, onDone);
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="two">
        <div className="field">
          <label htmlFor="cfl-kind">What is it?</label>
          <select id="cfl-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cfl-title">Title (optional)</label>
          <input id="cfl-title" name="title" className="input" maxLength={200} />
        </div>
      </div>
      <div className="seg-toggle" role="group" aria-label="Source">
        <button type="button" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>Upload file</button>
        <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>Link</button>
      </div>
      {mode === "upload" ? (
        <div className="field">
          <label htmlFor="cfl-file">File</label>
          <input id="cfl-file" name="file" className="input" type="file" required accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,text/plain" />
          <span className="hint">PDF, JPG, PNG, WebP, SVG or text, up to 25 MB.</span>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="cfl-url">Link</label>
          <input id="cfl-url" name="url" className="input" type="url" required maxLength={2000} placeholder="https://…" />
        </div>
      )}
      <div className="two">
        <div className="field">
          <label htmlFor="cfl-variant">Applies to variant</label>
          <input id="cfl-variant" name="variant" className="input" maxLength={120} defaultValue={variant ?? ""} />
        </div>
        {kind === "wiring" && (
          <div className="field">
            <label htmlFor="cfl-board">Target board</label>
            <input id="cfl-board" name="board" className="input" maxLength={120} placeholder="e.g. ESP32-S3" />
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="cfl-src">Where did it come from? (optional)</label>
        <input id="cfl-src" name="source" className="input" type="url" maxLength={2000} placeholder="Manufacturer page or document link" />
      </div>
      <label className="inline-check"><input type="checkbox" name="verified" /> I checked this against the manufacturer&rsquo;s documentation</label>
      <p className="hint">Anything not ticked is shown as unverified.</p>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : mode === "upload" ? "Upload" : "Add link"}</button>
      </div>
    </form>
  );
}

function Card({ componentId, a, onView }: { componentId: string; a: CAsset; onView: (f: ViewerFile) => void }) {
  const open = useRun(), ver = useRun(), del = useRun();
  const name = a.title || a.original_filename || a.external_url || "File";
  return (
    <li className="file-item" aria-busy={open.pending || del.pending}>
      <div className="file-thumb">
        {a.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.previewUrl} alt={`Preview of ${name}`} loading="lazy" />
        ) : <span>{a.external_url ? "LINK" : a.mime_type === "application/pdf" ? "PDF" : "FILE"}</span>}
      </div>
      <div>
        <div className="file-name">{name}{!a.verified && <span className="unverified">Unverified</span>}</div>
        <div className="hint">
          {KIND_LABEL[a.kind] ?? a.kind}{a.size_bytes ? ` · ${fmtBytes(a.size_bytes)}` : ""}
          {a.variant ? ` · variant ${a.variant}` : ""}{a.target_board ? ` · for ${a.target_board}` : ""}
        </div>
        {a.source_url && <a className="hint" href={a.source_url} target="_blank" rel="noreferrer noopener">Source</a>}
      </div>
      <div className="row">
        {a.external_url ? (
          <a className="btn btn-sm" href={a.external_url} target="_blank" rel="noreferrer noopener">Open</a>
        ) : (
          <button type="button" className="btn btn-sm" disabled={open.pending} onClick={() => open.run(async () => { const r = await getComponentFileUrl(componentId, a.id); if (r.ok && r.data) onView({ title: name, url: r.data.url, mime: r.data.mime }); return r; })}>
            {open.pending ? "Opening…" : "View"}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={ver.pending} onClick={() => ver.run(() => setAssetVerified(componentId, a.id, !a.verified))}>
          {a.verified ? "Mark unverified" : "Mark verified"}
        </button>
        <ConfirmDelete label="Delete file" what={name} pending={del.pending} onConfirm={() => del.run(() => deleteComponentAsset(componentId, a.id))} />
      </div>
      <ErrorLine error={open.error ?? ver.error ?? del.error} />
    </li>
  );
}

export default function ComponentFiles({ componentId, variant, assets }: { componentId: string; variant: string | null; assets: CAsset[] }) {
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  return (
    <section id="files" className="card section" aria-labelledby="h-cfiles">
      <div className="section-head">
        <div>
          <h2 id="h-cfiles">Photos, datasheets and diagrams</h2>
          <p className="hint">Only what you add appears here. Items you have not checked against documentation are labelled unverified.</p>
        </div>
        <button type="button" className="btn" onClick={() => setAdding(true)}>Add file or link</button>
      </div>
      {assets.length === 0 ? <p className="empty-inline">Nothing attached yet.</p> : <ul className="file-list">{assets.map((a) => <Card key={a.id} componentId={componentId} a={a} onView={setViewing} />)}</ul>}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add file or link">
        <AddForm componentId={componentId} variant={variant} onDone={() => setAdding(false)} />
      </Modal>
      <Viewer file={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
