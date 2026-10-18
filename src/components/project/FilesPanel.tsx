"use client";

import { useState } from "react";
import { addProjectFile, deleteProjectFile, getFileUrl, setProjectPhoto } from "@/app/(app)/projects/[id]/actions-files";
import { FILE_KIND_LABEL, fmtBytes, IMAGE_MIME } from "@/lib/files";
import type { Asset } from "@/lib/project-types";
import { discardUpload, uploadProjectFile } from "@/lib/upload";
import Modal from "../Modal";
import { ConfirmDelete, ErrorLine, useRun } from "./ui";
import Viewer, { type ViewerFile } from "./Viewer";

const ADD_KINDS = ["plan_pdf", "drawing", "piece_image", "other"] as const;

function AddFileForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const [progress, setProgress] = useState("");
  const [kind, setKind] = useState<(typeof ADD_KINDS)[number]>("plan_pdf");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const files = Array.from((form.elements.namedItem("files") as HTMLInputElement).files ?? []);
    const title = String(new FormData(form).get("title") ?? "");
    if (files.length === 0) return;
    run(async () => {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        const isImage = IMAGE_MIME.includes(f.type);
        if (kind === "plan_pdf" && f.type !== "application/pdf") return { ok: false as const, error: `${f.name} is not a PDF.` };
        if (kind !== "plan_pdf" && kind !== "other" && !isImage) return { ok: false as const, error: `${f.name} must be a JPG, PNG or WebP image.` };
        const up = await uploadProjectFile(projectId, f, { mode: "document", optimize: isImage });
        if (!up.ok) return { ok: false as const, error: up.error };
        const r = await addProjectFile(projectId, { kind, ...up.meta }, files.length === 1 ? title : "");
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
      <div className="field">
        <label htmlFor="af-kind">What is it?</label>
        <select id="af-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as (typeof ADD_KINDS)[number])}>
          {ADD_KINDS.map((k) => <option key={k} value={k}>{FILE_KIND_LABEL[k]}{k === "piece_image" ? " / reference image" : ""}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="af-files">File{kind === "plan_pdf" ? " (PDF)" : kind === "other" ? "" : " (JPG, PNG or WebP)"}</label>
        <input id="af-files" name="files" className="input" type="file" required multiple accept={kind === "plan_pdf" ? "application/pdf" : kind === "other" ? undefined : "image/jpeg,image/png,image/webp"} />
        <span className="hint">Up to 50 MB each. Images keep the original and also get a small copy (about 640 px) for fast previews.</span>
      </div>
      <div className="field">
        <label htmlFor="af-title">Title (optional, single file)</label>
        <input id="af-title" name="title" className="input" maxLength={200} />
      </div>
      {pending && <p className="hint" role="status">{progress}</p>}
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
      </div>
    </form>
  );
}

function FileCard({ projectId, asset, isPhoto, onView }: { projectId: string; asset: Asset; isPhoto: boolean; onView: (f: ViewerFile) => void }) {
  const open = useRun();
  const del = useRun();
  const photo = useRun();
  const isImage = String(asset.mime_type ?? "").startsWith("image/");

  function view() {
    open.run(async () => {
      const r = await getFileUrl(projectId, asset.id, "original");
      if (r.ok && r.data) onView({ title: asset.original_filename, url: r.data.url, mime: r.data.mime });
      return r;
    });
  }
  return (
    <li className="file-item" aria-busy={open.pending || del.pending}>
      <div className="file-thumb" aria-hidden={asset.previewUrl ? undefined : true}>
        {asset.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.previewUrl} alt={`Preview of ${asset.original_filename}`} loading="lazy" />
        ) : (
          <span>{asset.kind === "plan_pdf" ? "PDF" : "FILE"}</span>
        )}
      </div>
      <div>
        <div className="file-name">{asset.original_filename}</div>
        <div className="hint">
          {FILE_KIND_LABEL[asset.kind] ?? asset.kind} · {fmtBytes(asset.size_bytes)}
          {asset.width_px && asset.height_px ? <> · {asset.width_px}×{asset.height_px} px</> : null}
          {isPhoto && <> · <span className="photo-flag">Project photo</span></>}
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={view} disabled={open.pending}>{open.pending ? "Opening…" : "View"}</button>
        {isImage && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={photo.pending} onClick={() => photo.run(() => setProjectPhoto(projectId, isPhoto ? null : asset.id))}>
            {isPhoto ? "Remove as project photo" : "Use as project photo"}
          </button>
        )}
        <ConfirmDelete label="Delete file" what={asset.original_filename} pending={del.pending} onConfirm={() => del.run(() => deleteProjectFile(projectId, asset.id))} />
      </div>
      <ErrorLine error={open.error ?? del.error ?? photo.error} />
    </li>
  );
}

export default function FilesPanel({ projectId, assets, photoId }: { projectId: string; assets: Asset[]; photoId: string | null }) {
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  return (
    <div className="stack" id="files">
      <div className="section-head">
        <div>
          <h3>Plans, drawings and photos</h3>
          <p className="hint">Keep plan PDFs and reference images with the project. Files are private to your account.</p>
        </div>
        <button type="button" className="btn" onClick={() => setAdding(true)}>Add file</button>
      </div>
      {assets.length === 0 ? (
        <p className="empty-inline">No files yet. Add a plan PDF, a drawing or a photo.</p>
      ) : (
        <ul className="file-list">
          {assets.map((a) => <FileCard key={a.id} projectId={projectId} asset={a} isPhoto={a.id === photoId} onView={setViewing} />)}
        </ul>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add file">
        <AddFileForm projectId={projectId} onDone={() => setAdding(false)} />
      </Modal>
      <Viewer file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
