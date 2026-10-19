import type { Metadata } from "next";
import Calculator from "@/components/tools/Calculator";

export const metadata: Metadata = { title: "Calculator" };

export default function Page() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>Calculator</h1>
          <p className="lede">Add, subtract, multiply, divide, brackets, percent, powers and square roots. Runs in your browser; nothing is sent or saved.</p>
        </div>
      </div>
      <Calculator />
    </>
  );
}
