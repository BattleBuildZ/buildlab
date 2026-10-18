"use client";

import { useState } from "react";
import type { Category, ComponentRow, Location } from "@/lib/electronics";
import Modal from "../Modal";
import ComponentForm from "./ComponentForm";

export default function EditComponentButton({ component, categories, locations }: { component: ComponentRow; categories: Category[]; locations: Location[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Edit details</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit component" wide>
        <ComponentForm component={component} categories={categories} locations={locations} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
