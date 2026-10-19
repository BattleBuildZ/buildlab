// Standalone mm <-> inch maths for the Converter page only. Nothing here is imported by any form
// that stores a dimension: mm and inch fields elsewhere in BuildLab stay separate, user-entered values.

export const MM_PER_INCH = 25.4; // exact by definition

export const mmToIn = (mm: number) => mm / MM_PER_INCH;
export const inToMm = (inch: number) => inch * MM_PER_INCH;

export type Fraction = { whole: number; num: number; den: number; text: string; errorIn: number };

// Nearest fraction of an inch at the chosen denominator (2, 4, 8, 16, 32 or 64), reduced.
export function nearestFraction(inches: number, den: number): Fraction {
  const total = Math.round(inches * den);
  const whole = Math.floor(total / den);
  let num = total - whole * den;
  let d = den;
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  if (num !== 0) { const k = g(num, d); num /= k; d /= k; }
  const text = num === 0 ? `${whole}` : whole === 0 ? `${num}/${d}` : `${whole} ${num}/${d}`;
  return { whole, num, den: d, text, errorIn: total / den - inches };
}
