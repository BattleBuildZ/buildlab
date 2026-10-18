import { cutCount, hardwareCount, overall, pct, stepCount, type Count } from "@/lib/progress";
import type { CutItem, Hardware, Step } from "@/lib/project-types";
import { Meter } from "./ui";

function Tile({ title, c, href, empty }: { title: string; c: Count; href: string; empty: string }) {
  return (
    <a className="sum-tile" href={href}>
      <span className="label">{title}</span>
      {c.total === 0 ? (
        <span className="hint">{empty}</span>
      ) : (
        <>
          <strong>{pct(c)}%</strong>
          <span className="hint">{c.done} of {c.total} done</span>
          <Meter done={c.done} total={c.total} label={`${title} progress`} />
        </>
      )}
    </a>
  );
}

export default function Summary({
  cut, hardware, steps, printTotal, printDone, hasPrinting, hasOpenCutPieces,
}: {
  cut: CutItem[]; hardware: Hardware[]; steps: Step[]; printTotal: number; printDone: number; hasPrinting: boolean; hasOpenCutPieces: boolean;
}) {
  const c = cutCount(cut), h = hardwareCount(hardware), s = stepCount(steps);
  const p: Count = { done: printDone, total: printTotal };
  const all = overall(c, h, s, p);
  const next = [...steps].filter((x) => !x.completed_at).sort((a, b) => a.sort_order - b.sort_order)[0];
  const review = cut.filter((i) => i.needs_review).length;
  const notReady = hardware.filter((x) => !x.is_ready);

  return (
    <section id="summary" className="card section" aria-labelledby="h-summary">
      <div className="section-head">
        <div>
          <h2 id="h-summary">Summary</h2>
          <p className="hint">Each cut unit, hardware line, print part and build step counts as one item. A category with nothing in it is left out.</p>
        </div>
      </div>
      <div className="sum-overall">
        <div>
          <span className="label">Overall</span>
          <strong className="big">{all.total === 0 ? "—" : `${pct(all)}%`}</strong>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <span className="hint" aria-live="polite">{all.total === 0 ? "Nothing to track yet — add hardware, pieces or steps below." : `${all.done} of ${all.total} items done`}</span>
          <Meter done={all.done} total={all.total} label="Overall progress" />
        </div>
      </div>
      <div className="sum-grid">
        <Tile title="Cut pieces" c={c} href="#cut-list" empty="No pieces yet" />
        <Tile title="Hardware ready" c={h} href="#hardware" empty="No hardware yet" />
        {hasPrinting && <Tile title="Printed parts" c={p} href="#print" empty="Print checklist arrives next" />}
        <Tile title="Build steps" c={s} href="#steps" empty="No steps yet" />
      </div>
      {(next || review > 0 || notReady.length > 0) && (
        <ul className="todo">
          {next && <li><b>Next step:</b> {next.title}</li>}
          {notReady.length > 0 && <li><b>Hardware still to get:</b> {notReady.slice(0, 6).map((x) => x.name).join(", ")}{notReady.length > 6 ? `, and ${notReady.length - 6} more` : ""}</li>}
          {review > 0 && <li><b>{review} piece{review === 1 ? "" : "s"} need{review === 1 ? "s" : ""} a size check</b> before cutting.</li>}
          {hasOpenCutPieces && <li><b>Cut list:</b> {c.total - c.done} piece{c.total - c.done === 1 ? "" : "s"} left to cut.</li>}
        </ul>
      )}
    </section>
  );
}
