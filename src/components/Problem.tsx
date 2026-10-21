"use client";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

/** What a page shows instead of crashing: what went wrong in plain words, and a way to try again. */
export function Problem({ error, reset, full = false }: { error: Error & { digest?: string }; reset: () => void; full?: boolean }) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    console.error(error);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
  }, [error]);
  return (
    <div className={full ? "grid min-h-dvh place-items-center px-4" : "grid place-items-center py-10"}>
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-warn-soft text-2xl" aria-hidden>
          {offline ? "📶" : "⚠️"}
        </div>
        <h1 className="m-0 text-lg font-bold">{offline ? "You're offline" : "This page didn't load"}</h1>
        <p className="mt-1.5 mb-4 text-sm text-muted">
          {offline ? "Cashew needs the internet to show your latest figures. Reconnect, then try again."
            : "Nothing you saved is lost. This is usually a brief hiccup reaching the database."}
        </p>
        <div className="btns justify-center">
          <button type="button" className="btn primary" onClick={() => startTransition(() => {
            router.refresh(); // ask the server again, not just redraw what failed
            reset();
          })}>Try again</button>
          <a className="btn" href="/">Go to Home</a>
        </div>
        {error.digest ? <p className="caption mb-0">Reference: {error.digest}</p> : null}
      </div>
    </div>
  );
}
