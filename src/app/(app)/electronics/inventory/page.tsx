import type { Metadata } from "next";
import NotBuilt from "@/components/NotBuilt";

export const metadata: Metadata = { title: "Component Inventory" };

export default function Page() {
  return <NotBuilt eyebrow="Electronics" title="Component Inventory" phase="Phase 4" summary="Components with part numbers, quantities, locations and an audited stock history." />;
}
