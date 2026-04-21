import "./globals.css";
import type { Metadata } from "next";
import { SessionProvider } from "@/contexts/SessionContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Sovereign AI | Private Enterprise RAG",
  description: "Self-hosted, high-computational AI infrastructure",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme — runs before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sovereign-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <SessionProvider>
            <div className="flex h-screen w-full overflow-hidden">
              {children}
            </div>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
