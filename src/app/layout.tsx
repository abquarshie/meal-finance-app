import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/Toaster";
import { APPS } from "@/lib/apps";
import { currentSpace } from "@/lib/space";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const app = APPS[await currentSpace()];
  return {
    title: { default: app.name, template: `%s · ${app.name}` },
    description: app.tagline,
    applicationName: app.name,
    manifest: app.manifest,
    icons: { icon: { url: app.icon, type: "image/svg+xml" }, apple: app.apple },
    appleWebApp: { capable: true, title: app.name, statusBarStyle: "default" },
  };
}

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
