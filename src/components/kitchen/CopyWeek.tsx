"use client";
import { useTransition } from "react";
import { copyLastWeek } from "@/actions/plan-help";
import { safe } from "@/components/safe";
import { useToast } from "@/components/Toaster";

export function CopyWeek({ label, primary }: { label: string; primary: boolean }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  return (
    <button type="button" className={`btn wide${primary ? " primary" : ""}`} disabled={busy}
      title="Each empty breakfast, lunch or supper in the next two weeks gets what was planned 7 days earlier. Meals already planned stay as they are."
      onClick={() => start(async () => {
        const r = await safe(copyLastWeek);
        toast(r.ok ? r.message : r.error, r.ok ? undefined : { tone: "warn" });
      })}>📋 {label}</button>
  );
}
