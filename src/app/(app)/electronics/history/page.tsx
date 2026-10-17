import type { Metadata } from "next";
import NotBuilt from "@/components/NotBuilt";

export const metadata: Metadata = { title: "Test History" };

export default function Page() {
  return <NotBuilt eyebrow="Electronics" title="Test History" phase="Phase 5" summary="Immutable record of every test run, with CSV export." />;
}
