import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ledgerly — Fees Collection & Expense Tracker",
  description:
    "Multi-tenant SaaS to manage institute fees, expenses, accounts, and reporting.",
  openGraph: {
    title: "Ledgerly — Fees Collection & Expense Tracker",
    description:
      "Multi-tenant SaaS to manage institute fees, expenses, accounts, and reporting.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Runs while the browser parses <head>, so the theme is right before the first
 * paint. It mutates <html> ahead of hydration, which is why <html> carries
 * suppressHydrationWarning — see "Preventing flash before hydration" in the
 * Next.js docs.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
