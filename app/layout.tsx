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
};

// Runs before hydration to avoid a flash of the wrong theme.
const themeInit = `
try {
  var t = localStorage.getItem('theme');
  var d = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (d) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
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
