// mm and inch are two separate, user-entered fields. Nothing in this file converts between them.
// Inches may be typed as a decimal (23.625) or a fraction (23 5/8, 5/8, 23-5/8); a fraction is read into the
// decimal-inch column as typed, it is not derived from the mm value.

export type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

const MAX = 100000;

export function parseMm(raw: unknown): Parsed {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: `"${s}" is not a valid mm value. Use a number such as 600 or 38.1.` };
  const n = Number(s);
  if (n > MAX) return { ok: false, error: `${s} mm is too large.` };
  return { ok: true, value: Math.round(n * 1000) / 1000 };
}

export function parseInch(raw: unknown): Parsed {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: true, value: null };
  let n: number | null = null;
  if (/^\d+(\.\d+)?$/.test(s)) n = Number(s);
  else {
    const m = s.match(/^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/);
    if (m && Number(m[3]) !== 0) n = Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  }
  if (n === null) return { ok: false, error: `"${s}" is not a valid inch value. Use 23.625 or a fraction such as 23 5/8.` };
  if (n > MAX) return { ok: false, error: `${s} in is too large.` };
  return { ok: true, value: Math.round(n * 10000) / 10000 };
}

const trim = (n: number, places: number) => String(parseFloat(n.toFixed(places)));
export const fmtMm = (n: number | string | null | undefined) => (n === null || n === undefined || n === "" ? "—" : `${trim(Number(n), 3)} mm`);
export const fmtIn = (n: number | string | null | undefined) => (n === null || n === undefined || n === "" ? "—" : `${trim(Number(n), 4)} in`);
