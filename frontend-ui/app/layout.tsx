// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sovereign AI | Private Enterprise RAG",
  description: "Self-hosted, high-computational AI infrastructure",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-50 antialiased">
        <div className="flex h-screen w-full overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}