"use client";
import { useTransition } from "react";
import { safe } from "./safe";
import { useToast } from "./Toaster";

type R = { ok: boolean; message?: string; error?: string };

/** Runs a server action and says how it went in a toast (a lost connection included). */
export function useAct(): [boolean, (work: () => Promise<R>, then?: () => void) => void] {
  const toast = useToast();
  const [busy, start] = useTransition();
  return [busy, (work, then) => start(async () => {
    const r = await safe(work);
    if (r.ok) {
      toast(r.message!);
      then?.();
    } else toast(r.error!, { tone: "warn" });
  })];
}
