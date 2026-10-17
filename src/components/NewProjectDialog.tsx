"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProject } from "@/app/(app)/actions";
import { FABRICATION_LABEL, FABRICATION_TYPES, type FabricationType } from "@/lib/fabrication";
import Modal from "./Modal";

export default function NewProjectDialog({ label = "New project" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"custom" | "sourced">("custom");
  const [fab, setFab] = useState<FabricationType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await createProject({
        name: f.get("name"),
        description: f.get("description") ?? "",
        type,
        fabrication: fab,
      });
      if (!res.ok) return setError(res.error);
      close();
      router.push(`/projects/${res.data!.id}`);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={close} title="New project">
        <form onSubmit={submit} className="stack">
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Project type</legend>
            <div className="seg" style={{ marginTop: 6 }}>
              <label>
                <input type="radio" name="type" checked={type === "custom"} onChange={() => setType("custom")} />
                <b>Custom</b>
                <small>Your own design — add pieces and steps by hand.</small>
              </label>
              <label>
                <input type="radio" name="type" checked={type === "sourced"} onChange={() => setType("sourced")} />
                <b>Sourced</b>
                <small>From someone else&apos;s plans — attach the PDF later.</small>
              </label>
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="np-name">Name</label>
            <input id="np-name" name="name" className="input" required maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="np-desc">Description (optional)</label>
            <textarea id="np-desc" name="description" className="textarea" maxLength={2000} />
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Fabrication (optional)</legend>
            <div className="checks" style={{ marginTop: 6 }}>
              {FABRICATION_TYPES.map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={fab.includes(t)}
                    onChange={(e) => setFab(e.target.checked ? [...fab, t] : fab.filter((x) => x !== t))}
                  />
                  {FABRICATION_LABEL[t]}
                </label>
              ))}
            </div>
            <span className="hint">Each one starts an assembly. Choosing 3D printing adds a Print Checklist to the project.</span>
          </fieldset>
          {type === "sourced" && (
            <div className="notice">
              Automatic extraction of cut lists from plan PDFs is not built yet. You can create the project and enter
              pieces by hand.
            </div>
          )}
          <div aria-live="polite">{error && <div className="error" role="alert">{error}</div>}</div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
