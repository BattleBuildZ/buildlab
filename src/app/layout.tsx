import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BuildLab", template: "%s · BuildLab" },
  description: "Workshop project management: cut lists, hardware, print checklists, electronics inventory and testing.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applies a saved light/dark override before first paint so the page never flashes the wrong theme.
const themeInit = `try{var t=localStorage.getItem("buildlab-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
