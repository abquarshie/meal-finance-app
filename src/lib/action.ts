import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isISODate } from "./dates";
import { prisma, type Tx } from "./db";
import { KINDS } from "./money";
import { Refusal } from "./passwords";

export type Result<T = object> = ({ ok: true; message: string } & T) | { ok: false; error: string };

export function ok<T extends object>(message: string, extra?: T): Result<T> {
  revalidatePath("/", "layout"); // every page reads the same data, so all of them refresh
  return { ok: true, message, ...(extra as T) };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Runs a server action's work, turning a validation problem or a database error into a message for the form. */
export async function attempt<T extends object>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof Refusal) return fail(e.message);
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the form.");
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e; // signed out: let it redirect
    console.error(e);
    return fail("That didn't save. Please try again; if it keeps happening, the database may be unreachable.");
  }
}

// ---- shared input rules --------------------------------------------------------------------------------------
export const isoDate = z.string().refine(isISODate, "Pick a valid date.");
export const kind = z.enum(KINDS);
export const amount = z.number({ error: "Enter an amount." }).finite().positive("Enter an amount above zero.")
  .max(99_999_999, "That amount is too big.");
export const optionalMoney = z.number().finite().min(0, "This can't be below zero.").max(99_999_999).nullable();
export const name50 = z.string().trim().min(1, "The name can't be empty.").max(50, "Use 50 characters or fewer.");

/** The kitchen tables live in the Python app's "meals" schema; they may not exist in a fresh database. */
export async function hasKitchen(tx: Tx | typeof prisma = prisma): Promise<boolean> {
  const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('meals.ingredients') IS NOT NULL AS ok`;
  return Boolean(rows[0]?.ok);
}
