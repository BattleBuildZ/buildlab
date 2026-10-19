import type { Metadata } from "next";
import Converter from "@/components/tools/Converter";

export const metadata: Metadata = { title: "MM / Inch Converter" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>MM / Inch Converter</h1>
          <p className="lede">Convert a value either way, with fractions of an inch. Runs in your browser; nothing is sent or saved.</p>
        </div>
      </div>
      <Converter />
    </>
  );
}
