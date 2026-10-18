"use client";

import { useState } from "react";
import { addCategory, saveComponent } from "@/app/(app)/electronics/actions";
import { COMMON_INTERFACES, CONDITIONS, CONDITION_LABEL, type Category, type ComponentRow, type Location } from "@/lib/electronics";
import { ErrorLine, useRun } from "../project/ui";

type SpecRow = { key: string; value: string; verified: boolean };
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(parseFloat(String(v))));

export default function ComponentForm({
  categories, locations, component, onDone, onSaved,
}: {
  categories: Category[]; locations: Location[]; component?: ComponentRow; onDone: () => void; onSaved?: (id: string) => void;
}) {
  const { pending, error, run } = useRun();
  const catRun = useRun();
  const unv = new Set(component?.unverified_fields ?? []);
  const [extraCats, setExtraCats] = useState<Category[]>([]);
  const [category, setCategory] = useState(component?.category_id ?? "");
  const [newCat, setNewCat] = useState("");
  const [ifaces, setIfaces] = useState<string[]>(component?.interfaces ?? []);
  const [customIface, setCustomIface] = useState("");
  const [vVerified, setVVerified] = useState(Boolean(component && (component.operating_voltage_min !== null || component.operating_voltage_max !== null) && !unv.has("operating_voltage")));
  const [lVerified, setLVerified] = useState(Boolean(component && component.logic_level_voltage !== null && !unv.has("logic_level_voltage")));
  const [specs, setSpecs] = useState<SpecRow[]>(() =>
    Object.entries(component?.specs ?? {}).map(([key, value]) => ({ key, value, verified: !unv.has(`spec:${key}`) })),
  );
  const allCats = [...categories, ...extraCats];
  const activeLocations = locations.filter((l) => !l.archived_at || l.id === component?.storage_location_id);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const unverified: string[] = [];
    if (!vVerified) unverified.push("operating_voltage");
    if (!lVerified) unverified.push("logic_level_voltage");
    for (const s of specs) if (!s.verified) unverified.push(`spec:${s.key.trim()}`);
    run(
      () => saveComponent(component?.id ?? null, {
        name: f.get("name"), category_id: category || null, manufacturer: f.get("manufacturer") ?? "", part_number: f.get("part") ?? "",
        variant: f.get("variant") ?? "", description: f.get("description") ?? "", notes: f.get("notes") ?? "",
        min_stock_threshold: f.get("min"), condition: f.get("condition"), storage_location_id: f.get("location") || null,
        operating_voltage_min: f.get("vmin"), operating_voltage_max: f.get("vmax"), logic_level_voltage: f.get("logic"),
        interfaces: ifaces, specs: specs.map((s) => ({ key: s.key.trim(), value: s.value.trim() })), unverified,
        retest_interval_days: f.get("retest"), track_individual_units: f.get("units") === "on", quantity: component ? undefined : f.get("qty"),
      }),
      (d) => { onDone(); if (d && onSaved) onSaved(d.id); },
    );
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="cf-name">Name</label>
        <input id="cf-name" name="name" className="input" required maxLength={160} defaultValue={component?.name} autoFocus placeholder="e.g. BME280 temperature / pressure sensor" />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="cf-part">Exact part number</label>
          <input id="cf-part" name="part" className="input" maxLength={120} defaultValue={component?.part_number ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="cf-variant">Variant</label>
          <input id="cf-variant" name="variant" className="input" maxLength={120} defaultValue={component?.variant ?? ""} placeholder="Variants can behave differently" />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="cf-mfr">Manufacturer</label>
          <input id="cf-mfr" name="manufacturer" className="input" maxLength={120} defaultValue={component?.manufacturer ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="cf-cat">Category</label>
          <select id="cf-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">No category</option>
            {allCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="cf-newcat">Add a category</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input id="cf-newcat" className="input" maxLength={80} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name" />
          <button
            type="button"
            className="btn"
            disabled={catRun.pending || !newCat.trim()}
            onClick={() => catRun.run(() => addCategory(newCat), (d) => { if (d) { setExtraCats((x) => [...x, { id: d.id, name: newCat.trim(), is_custom: true }]); setCategory(d.id); setNewCat(""); } })}
          >
            Add
          </button>
        </div>
        <ErrorLine error={catRun.error} />
      </div>
      <div className="two">
        {!component && (
          <div className="field">
            <label htmlFor="cf-qty">Quantity you have now</label>
            <input id="cf-qty" name="qty" className="input" type="number" min={0} step={1} defaultValue={0} />
            <span className="hint">Recorded as starting stock. Later changes go through stock movements.</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="cf-min">Low-stock level (optional)</label>
          <input id="cf-min" name="min" className="input" type="number" min={0} step={1} defaultValue={component?.min_stock_threshold ?? ""} />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="cf-cond">Condition</label>
          <select id="cf-cond" name="condition" className="select" defaultValue={component?.condition ?? "unknown"}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cf-loc">Storage location</label>
          <select id="cf-loc" name="location" className="select" defaultValue={component?.storage_location_id ?? ""}>
            <option value="">Not assigned</option>
            {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.archived_at ? " (archived)" : ""}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="dims">
        <legend className="label">Electrical details (only what you have confirmed)</legend>
        <p className="hint">Leave blank if you do not know. Nothing here is filled in for you. Tick &ldquo;verified&rdquo; only if you checked the value against the datasheet.</p>
        <div className="two">
          <div className="field">
            <label htmlFor="cf-vmin">Operating voltage, min (V)</label>
            <input id="cf-vmin" name="vmin" className="input" inputMode="decimal" defaultValue={num(component?.operating_voltage_min)} />
          </div>
          <div className="field">
            <label htmlFor="cf-vmax">Operating voltage, max (V)</label>
            <input id="cf-vmax" name="vmax" className="input" inputMode="decimal" defaultValue={num(component?.operating_voltage_max)} />
          </div>
        </div>
        <label className="inline-check"><input type="checkbox" checked={vVerified} onChange={(e) => setVVerified(e.target.checked)} /> Operating voltage verified against the datasheet</label>
        <div className="field">
          <label htmlFor="cf-logic">Logic level (V)</label>
          <input id="cf-logic" name="logic" className="input" inputMode="decimal" defaultValue={num(component?.logic_level_voltage)} placeholder="3.3 or 5, if known" />
        </div>
        <label className="inline-check"><input type="checkbox" checked={lVerified} onChange={(e) => setLVerified(e.target.checked)} /> Logic level verified against the datasheet</label>
      </fieldset>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Interfaces</legend>
        <div className="checks" style={{ marginTop: 6 }}>
          {[...new Set([...COMMON_INTERFACES, ...ifaces])].map((i) => (
            <label key={i}>
              <input type="checkbox" checked={ifaces.includes(i)} onChange={(e) => setIfaces(e.target.checked ? [...ifaces, i] : ifaces.filter((x) => x !== i))} />
              {i}
            </label>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "nowrap", marginTop: 6 }}>
          <input className="input" aria-label="Other interface" maxLength={30} value={customIface} onChange={(e) => setCustomIface(e.target.value)} placeholder="Other interface" />
          <button type="button" className="btn" disabled={!customIface.trim()} onClick={() => { const v = customIface.trim(); if (!ifaces.includes(v)) setIfaces([...ifaces, v]); setCustomIface(""); }}>Add</button>
        </div>
      </fieldset>

      <fieldset className="dims">
        <legend className="label">Other specs</legend>
        <p className="hint">Anything else worth recording, such as dimensions. Write sizes in both mm and in, for example 25.4 mm (1 in).</p>
        {specs.map((s, idx) => (
          <div key={idx} className="spec-row">
            <div className="field">
              <label htmlFor={`sk-${idx}`}>Name</label>
              <input id={`sk-${idx}`} className="input" maxLength={60} value={s.key} onChange={(e) => setSpecs(specs.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))} />
            </div>
            <div className="field">
              <label htmlFor={`sv-${idx}`}>Value</label>
              <input id={`sv-${idx}`} className="input" maxLength={300} value={s.value} onChange={(e) => setSpecs(specs.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} />
            </div>
            <label className="inline-check"><input type="checkbox" checked={s.verified} onChange={(e) => setSpecs(specs.map((x, i) => (i === idx ? { ...x, verified: e.target.checked } : x)))} /> Verified</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSpecs(specs.filter((_, i) => i !== idx))} aria-label={`Remove spec ${idx + 1}`}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setSpecs([...specs, { key: "", value: "", verified: false }])}>Add spec</button>
      </fieldset>

      <div className="field">
        <label htmlFor="cf-desc">Description (optional)</label>
        <textarea id="cf-desc" name="description" className="textarea" maxLength={2000} defaultValue={component?.description ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="cf-notes">Notes (optional)</label>
        <textarea id="cf-notes" name="notes" className="textarea" maxLength={4000} defaultValue={component?.notes ?? ""} />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="cf-retest">Retest every (days, optional)</label>
          <input id="cf-retest" name="retest" className="input" type="number" min={1} max={3650} defaultValue={component?.retest_interval_days ?? ""} />
        </div>
        <label className="inline-check" style={{ alignSelf: "end", minHeight: 42 }}>
          <input type="checkbox" name="units" defaultChecked={component?.track_individual_units} /> Track each unit separately
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : component ? "Save changes" : "Add component"}</button>
      </div>
    </form>
  );
}
