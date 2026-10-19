export const CONDITIONS = ["new", "good", "used", "damaged", "unknown"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABEL: Record<Condition, string> = { new: "New", good: "Good", used: "Used", damaged: "Damaged", unknown: "Unknown" };

export const TEST_STATUS_LABEL: Record<string, string> = { passed: "Passed", failed: "Failed", inconclusive: "Inconclusive", not_tested: "Not tested" };
export const TEST_STATUS_BADGE: Record<string, string> = { passed: "badge-ok", failed: "badge-bad", inconclusive: "badge-warn", not_tested: "badge-type" };

export const LOCATION_KINDS = ["cabinet", "drawer", "bin", "shelf", "box", "other"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];
export const LOCATION_KIND_LABEL: Record<LocationKind, string> = { cabinet: "Cabinet", drawer: "Drawer", bin: "Bin", shelf: "Shelf", box: "Box", other: "Other" };

export const COMMON_INTERFACES = ["I2C", "SPI", "UART", "GPIO", "ADC", "PWM", "USB", "CAN", "I2S", "1-Wire"];

export const MOVEMENT_LABEL: Record<string, string> = { initial: "Starting stock", addition: "Added", consumption: "Used", adjustment: "Count correction" };

export type Category = { id: string; name: string; is_custom: boolean };
export type Location = { id: string; name: string; kind: LocationKind; parent_id: string | null; notes: string | null; qr_token: string; archived_at: string | null };

export type ComponentRow = {
  id: string;
  name: string;
  category_id: string | null;
  manufacturer: string | null;
  part_number: string | null;
  variant: string | null;
  description: string | null;
  notes: string | null;
  quantity_on_hand: number;
  min_stock_threshold: number | null;
  condition: Condition;
  storage_location_id: string | null;
  operating_voltage_min: number | string | null;
  operating_voltage_max: number | string | null;
  logic_level_voltage: number | string | null;
  interfaces: string[];
  specs: Record<string, string>;
  unverified_fields: string[];
  track_individual_units: boolean;
  test_status: string;
  last_tested_at: string | null;
  retest_interval_days: number | null;
  qr_token: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const isLow = (c: Pick<ComponentRow, "quantity_on_hand" | "min_stock_threshold">) =>
  c.min_stock_threshold !== null && c.quantity_on_hand <= c.min_stock_threshold;

/* ------------------------------------------------------------------ CSV */

// RFC 4180-style parser: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// Spreadsheet formula characters at the start of a cell are neutralised on export so a name like "=1+1" cannot execute.
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");

export const COMPONENT_CSV_COLUMNS = [
  "name", "category", "manufacturer", "part_number", "variant", "quantity", "min_stock", "condition", "location",
  "operating_voltage_min_v", "operating_voltage_max_v", "logic_level_v", "interfaces", "description", "notes", "link_url",
] as const;
