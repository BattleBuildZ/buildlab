"use client";

import { useState } from "react";
import { updateProject } from "@/app/(app)/projects/[id]/actions";
import { STATUS_LABEL } from "@/lib/fabrication";
import Modal from "../Modal";
import { ErrorLine, useRun } from "./ui";

export default function EditProjectButton({ id, name, description, status }: { id: string; name: string; description: string | null; status: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Edit details</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Project details">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => updateProject(id, { name: f.get("name"), description: f.get("description") ?? "", status: f.get("status") }), () => setOpen(false));
          }}
        >
          <div className="field">
            <label htmlFor="ep-name">Name</label>
            <input id="ep-name" name="name" className="input" required maxLength={120} defaultValue={name} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="ep-desc">Description</label>
            <textarea id="ep-desc" name="description" className="textarea" maxLength={2000} defaultValue={description ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ep-status">Status</label>
            <select id="ep-status" name="status" className="select" defaultValue={status}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <ErrorLine error={error} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
