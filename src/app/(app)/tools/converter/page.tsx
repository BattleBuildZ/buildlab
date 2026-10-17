import type { Metadata } from "next";
import NotBuilt from "@/components/NotBuilt";

export const metadata: Metadata = { title: "MM / Inch Converter" };

export default function Page() {
  return <NotBuilt eyebrow="Tools" title="MM / Inch Converter" phase="Phase 5" summary="A local converter. Results are shown for reference and never written into your project dimensions." />;
}
