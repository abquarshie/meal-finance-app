import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cashew", template: "%s · Cashew" },
  description: "Family money, together",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Cashew", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F5F7F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1417" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body><Toaster>{children}</Toaster></body>
    </html>
  );
}
