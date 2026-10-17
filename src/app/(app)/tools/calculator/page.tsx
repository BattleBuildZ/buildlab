import type { Metadata } from "next";
import NotBuilt from "@/components/NotBuilt";

export const metadata: Metadata = { title: "Calculator" };

export default function Page() {
  return <NotBuilt eyebrow="Tools" title="Calculator" phase="Phase 5" summary="A local calculator that never sends anything to a server." />;
}
