"use client";
import { Problem } from "@/components/Problem";
import "./globals.css";

// The last resort, when even the outermost layout fails: it replaces the whole document.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body><Problem error={error} reset={reset} full /></body>
    </html>
  );
}
