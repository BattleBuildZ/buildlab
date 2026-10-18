"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Category, Location } from "@/lib/electronics";
import Modal from "../Modal";
import ComponentForm from "./ComponentForm";

export default function AddComponentButton({ categories, locations, label = "Add component" }: { categories: Category[]; locations: Location[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add component" wide>
        <ComponentForm categories={categories} locations={locations} onDone={() => setOpen(false)} onSaved={(id) => router.push(`/electronics/inventory/${id}`)} />
      </Modal>
    </>
  );
}
