// Shared shapes and helpers for the manual Test Bench and Test History.

export type MeasurementDef = { key: string; label: string | null; unit: string | null; expected_min: number | null; expected_max: number | null };
export type StepDef = { n: number; instruction: string; measurement: MeasurementDef | null };
export type WiringRow = { pin: string; connects_to: string };
export type ProcedureDef = {
  equipment: string[];
  wiring: WiringRow[];
  supply_voltage: { min: number | null; max: number | null } | null;
  logic_level_voltage: number | null;
  steps: StepDef[];
  evaluation_rules: string | null;
  troubleshooting: string | null;
};

// What is stored with every run, so a later edit to the procedure can never change what that run was judged against.
export type CriteriaSnapshot = {
  procedure_name: string | null;
  version: number | null;
  verified: boolean | null;
  definition: ProcedureDef | null;
  steps_done: number[];
};

export const OUTCOMES = ["passed", "failed", "inconclusive"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const SOURCE_LABEL: Record<string, string> = { manual: "Manual", automated: "Automated" };

export const EMPTY_DEF: ProcedureDef = { equipment: [], wiring: [], supply_voltage: null, logic_level_voltage: null, steps: [], evaluation_rules: null, troubleshooting: null };

// A reading passes only when a documented range exists and the value is inside it. No range means "not judged".
export function judge(value: number | null, min: number | null, max: number | null): boolean | null {
  if (value === null || (min === null && max === null)) return null;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

export function parseReading(raw: string): { numeric: number | null; text: string | null } {
  const s = raw.trim();
  if (s === "") return { numeric: null, text: null };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { numeric: Number(s), text: null };
  return { numeric: null, text: s };
}

export const fmtRange = (min: number | null, max: number | null, unit?: string | null) => {
  const u = unit ? ` ${unit}` : "";
  if (min === null && max === null) return "No range";
  if (min !== null && max !== null) return `${min} to ${max}${u}`;
  return min !== null ? `at least ${min}${u}` : `at most ${max}${u}`;
};

export function retestDue(last: string | null, days: number | null): boolean {
  if (!last || !days) return false;
  return Date.now() - new Date(last).getTime() > days * 86_400_000;
}
