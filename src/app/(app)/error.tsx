"use client";
import { Problem } from "@/components/Problem";

// A page that fails keeps the menu around it, so the rest of the app is one tap away.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Problem error={error} reset={reset} />;
}
