export default function NotBuilt({ eyebrow, title, phase, summary }: { eyebrow: string; title: string; phase: string; summary: string }) {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lede">{summary}</p>
        </div>
      </div>
      <div className="empty">
        <h2>Not built yet</h2>
        <p>This page is planned for {phase}. Nothing on it is saved or simulated.</p>
      </div>
    </>
  );
}
