// Progress counting rules (shown to the user on the Summary):
//   cut list      — each physical unit is one item; a piece with quantity 4 is four items
//   hardware      — each hardware line is one item, done when marked ready (not merely listed)
//   print parts   — each part is one item, done when marked printed
//   build steps   — each step is one item, done when checked off
// Overall progress = all done items / all items. A category with nothing in it contributes nothing.
import type { CutItem, Hardware, Step } from "./project-types";

export type Count = { done: number; total: number };
export const pct = (c: Count) => (c.total === 0 ? 0 : Math.round((c.done / c.total) * 100));

export function cutCount(items: CutItem[]): Count {
  let done = 0, total = 0;
  for (const i of items) for (const u of i.cut_units) { total++; if (u.completed_at) done++; }
  return { done, total };
}
export const hardwareCount = (h: Hardware[]): Count => ({ done: h.filter((x) => x.is_ready).length, total: h.length });
export const stepCount = (s: Step[]): Count => ({ done: s.filter((x) => x.completed_at).length, total: s.length });
export const overall = (...cs: Count[]): Count => ({ done: cs.reduce((a, c) => a + c.done, 0), total: cs.reduce((a, c) => a + c.total, 0) });
