import type { Metadata } from "next";
import NotBuilt from "@/components/NotBuilt";

export const metadata: Metadata = { title: "Storage Locations" };

export default function Page() {
  return <NotBuilt eyebrow="Electronics" title="Storage Locations" phase="Phase 4" summary="Bins, drawers and shelves, with printable QR labels." />;
}
