// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Inventory",
  description: "Multi-warehouse inventory reservation system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-stone-50 text-stone-900 font-dm-sans antialiased">
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5">
              <span className="w-7 h-7 bg-stone-900 rounded-md flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="1" width="5" height="5" fill="white" rx="0.5" />
                  <rect x="8" y="1" width="5" height="5" fill="white" rx="0.5" opacity="0.6" />
                  <rect x="1" y="8" width="5" height="5" fill="white" rx="0.5" opacity="0.6" />
                  <rect x="8" y="8" width="5" height="5" fill="white" rx="0.5" opacity="0.3" />
                </svg>
              </span>
              <span className="font-semibold tracking-tight text-stone-900">Allo</span>
              <span className="text-stone-400 text-sm font-normal">Inventory</span>
            </a>
            <span className="text-xs text-stone-400 font-mono">multi-warehouse</span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
