"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";

type Item = { href: string; label: string; sub?: boolean; exact?: boolean };
type Group = { label?: string; items: Item[] };

const NAV: Group[] = [
  {
    items: [
      { href: "/", label: "Dashboard", exact: true },
      { href: "/projects", label: "Projects" },
    ],
  },
  {
    label: "Electronics",
    items: [
      { href: "/electronics/inventory", label: "Component Inventory", sub: true },
      { href: "/electronics/test-bench", label: "Test Bench", sub: true },
      { href: "/electronics/history", label: "Test History", sub: true },
      { href: "/electronics/locations", label: "Storage Locations", sub: true },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/tools/calculator", label: "Calculator", sub: true },
      { href: "/tools/converter", label: "MM / Inch Converter", sub: true },
    ],
  },
  { items: [{ href: "/settings", label: "Settings" }] },
];

export default function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // The drawer is "open" only for the route it was opened on, so navigating closes it without an effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isActive = (i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          Build<span>Lab</span>
        </Link>
        <button
          type="button"
          className="btn"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className="sidebar" data-open={open} id="primary-nav">
        <Link href="/" className="brand">
          Build<span>Lab</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {NAV.map((g, gi) => (
            <div key={gi} className="nav">
              {g.label && <div className="nav-label">{g.label}</div>}
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={i.sub ? "sub" : undefined}
                  aria-current={isActive(i) ? "page" : undefined}
                >
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span style={{ overflowWrap: "anywhere" }}>{email}</span>
          <form action={signOut}>
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
