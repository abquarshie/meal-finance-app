"use client";
import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";

export type Failed = { ok: false; error: string };

export const OFFLINE = "Couldn't reach Cashew. Check your connection and try again.";
export const UPDATED = "Cashew was just updated. Reload the page, then try again.";

/** Why a server action call failed before it could answer: the phone is offline, the server fell over, or a new
 * version was deployed while this page was open (its actions no longer exist). */
export function failure(e: unknown): Failed {
  unstable_rethrow(e); // a redirect (signed out) or a not-found still does its job
  if (unstable_isUnrecognizedActionError(e)) return { ok: false, error: UPDATED };
  console.error(e);
  return { ok: false, error: OFFLINE };
}

/** Calls a server action and always comes back with an answer, so a dropped connection shows a message instead of
 * breaking the page. */
export async function safe<T extends { ok: boolean }>(work: () => Promise<T>): Promise<T | Failed> {
  try {
    return (await work()) ?? { ok: false, error: OFFLINE };
  } catch (e) {
    return failure(e);
  }
}

/** For the read-only lookups (hints, defaults): on any failure, quietly use `fallback`. */
export async function quiet<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return fallback;
  }
}
