"use client";

import { ensureDefaultCategories } from "@/app/(app)/electronics/actions";
import { ErrorLine, useRun } from "../project/ui";

export default function DefaultCategories() {
  const { pending, error, run } = useRun();
  return (
    <div className="notice" style={{ marginBottom: 14 }}>
      <p style={{ margin: "0 0 8px" }}>You have no categories yet. Add the standard set (sensors, microcontrollers, ICs and so on), or create your own when adding a component.</p>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => ensureDefaultCategories())}>{pending ? "Adding…" : "Add standard categories"}</button>
      <ErrorLine error={error} />
    </div>
  );
}
