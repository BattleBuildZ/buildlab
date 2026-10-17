"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProject } from "@/app/(app)/actions";
import Modal from "./Modal";

// Two distinct confirmations: (1) are you sure, (2) type the project name. Success is only shown after the
// server confirms the deletion.
export default function DeleteProjectButton({
  id,
  name,
  redirectTo,
}: {
  id: string;
  name: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function close() {
    setStep(0);
    setTyped("");
    setError(null);
  }

  function confirm() {
    setError(null);
    start(async () => {
      const res = await deleteProject(id, typed);
      if (!res.ok) return setError(res.error);
      setDone(true);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  if (done) return <span className="toast-ok" role="status">Deleted</span>;

  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setStep(1)} aria-label={`Delete project ${name}`}>
        Delete
      </button>
      <Modal open={step === 1} onClose={close} title="Delete this project?">
        <div className="stack">
          <p>
            <strong>{name}</strong> will be removed from your dashboard along with its cut list, hardware, print
            checklist and steps. Electronics inventory is not touched and stock is never changed by deleting a project.
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close}>Keep project</button>
            <button type="button" className="btn btn-danger" onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      </Modal>
      <Modal open={step === 2} onClose={close} title="Confirm deletion">
        <div className="stack">
          <div className="field">
            <label htmlFor="del-name">Type the project name to confirm</label>
            <input
              id="del-name"
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={name}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div aria-live="polite">{error && <div className="error" role="alert">{error}</div>}</div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close} disabled={pending}>Cancel</button>
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={confirm}
              disabled={pending || typed.trim() !== name.trim()}
            >
              {pending ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
