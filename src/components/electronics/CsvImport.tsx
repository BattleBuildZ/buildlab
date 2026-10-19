"use client";

import { useState } from "react";
import { importComponents, type ImportReport } from "@/app/(app)/electronics/actions";
import { COMPONENT_CSV_COLUMNS, parseCsv } from "@/lib/electronics";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

export default function CsvImport() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const { pending, error, run } = useRun();

  function close() { setOpen(false); setRows(null); setFileError(null); setReport(null); }

  async function pick(file: File | undefined) {
    setRows(null); setFileError(null); setReport(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setFileError("That file is larger than 2 MB.");
    const table = parseCsv(await file.text());
    if (table.length < 2) return setFileError("The file needs a header row and at least one data row.");
    const header = table[0].map((h) => h.trim().toLowerCase());
    if (!header.includes("name")) return setFileError('The first row must contain a "name" column.');
    const unknown = header.filter((h) => h && !(COMPONENT_CSV_COLUMNS as readonly string[]).includes(h));
    if (unknown.length) return setFileError(`Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Use the template columns.`);
    if (table.length - 1 > 200) return setFileError("Import at most 200 rows at a time.");
    setRows(table.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))));
  }

  const template = `${COMPONENT_CSV_COLUMNS.join(",")}\nBME280 sensor,Sensors,Bosch,BME280,breakout,3,2,new,Drawer A1,1.71,3.6,3.3,I2C;SPI,,,\n`;

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Import CSV</button>
      <Modal open={open} onClose={close} title="Import components from CSV" wide>
        <div className="stack">
          {report ? (
            <>
              <p className="toast-ok" role="status">Imported {report.created} component{report.created === 1 ? "" : "s"}{report.links > 0 ? ` and ${report.links} link${report.links === 1 ? "" : "s"}` : ""}.</p>
              {report.newCategories.length > 0 && <p className="hint">New categories created: {report.newCategories.join(", ")}.</p>}
              {report.newLocations.length > 0 && <p className="hint">New locations created: {report.newLocations.join(", ")}.</p>}
              {report.skipped.length > 0 && (
                <div className="notice">
                  <b>{report.skipped.length} row{report.skipped.length === 1 ? "" : "s"} skipped:</b>
                  <ul>{report.skipped.slice(0, 20).map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}</ul>
                </div>
              )}
              <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-primary" onClick={close}>Done</button></div>
            </>
          ) : (
            <>
              <p className="hint">
                One component per row. Columns: {COMPONENT_CSV_COLUMNS.join(", ")}. Only <b>name</b> is required. Quantities become starting stock.
                Voltages from a file are marked unverified. A <b>link_url</b> becomes an unverified link on the component. Rows that match an existing name, part number and variant are skipped.
              </p>
              <a className="btn btn-sm" style={{ alignSelf: "flex-start" }} download="components-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}>Download template</a>
              <div className="field">
                <label htmlFor="csv-file">CSV file</label>
                <input id="csv-file" className="input" type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
              </div>
              <ErrorLine error={fileError ?? error} />
              {rows && (
                <>
                  <p role="status">{rows.length} row{rows.length === 1 ? "" : "s"} ready. Nothing is saved until you confirm.</p>
                  <div className="table-wrap">
                    <table className="inv-table">
                      <thead><tr><th>Name</th><th>Part number</th><th>Quantity</th><th>Location</th><th>Link</th></tr></thead>
                      <tbody>
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i}><td data-label="Name">{r.name}</td><td data-label="Part">{r.part_number}</td><td data-label="Qty">{r.quantity}</td><td data-label="Location">{r.location}</td><td data-label="Link">{r.link_url ? "Yes" : ""}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!rows || pending} onClick={() => run(async () => { const r = await importComponents(rows); if (r.ok && r.data) setReport(r.data); return r; })}>
                  {pending ? "Importing…" : "Import"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
