"use client";
import { Problem } from "@/components/Problem";

// Anything that fails before a page's own layout is drawn (the sign-in page, or the app's frame itself).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Problem error={error} reset={reset} full />;
}
