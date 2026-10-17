import type { Metadata } from "next";
import NotBuilt from "@/components/NotBuilt";

export const metadata: Metadata = { title: "Test Bench" };

export default function Page() {
  return <NotBuilt eyebrow="Electronics" title="Test Bench" phase="Phase 5" summary="Guided manual tests with recorded measurements." />;
}
