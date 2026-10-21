"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { attempt, fail, ok, type Result } from "@/lib/action";
import * as auth from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Refusal } from "@/lib/passwords";

// ---- signing in and out ----------------------------------------------------------------------------------------
export type AuthState = { error?: string } | undefined;

/** Signing in must never show a crash page: a database problem becomes a message on the form. */
async function guarded(work: () => Promise<AuthState>): Promise<AuthState> {
  try {
    return await work();
  } catch (e) {
    unstable_rethrow(e); // signed in: let it redirect
    console.error(e);
    return { error: "Couldn't reach the database just now. Please try again in a moment." };
  }
}

export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  return guarded(async () => {
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");
    if (!username.trim() || !password) return { error: "Enter your username and password." };
    const { user, error } = await auth.signIn(username, password);
    if (!user) return { error };
    await auth.startSession(user.id, form.get("remember") === "on");
    redirect(safeNext(form.get("next")));
  });
}

export async function registerAction(_: AuthState, form: FormData): Promise<AuthState> {
  return guarded(async () => {
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("password2") ?? "")) return { error: "The two passwords don't match." };
    const { user, error } = await auth.register(String(form.get("username") ?? ""), String(form.get("name") ?? ""),
      password, String(form.get("code") ?? "") || undefined);
    if (!user) return { error };
    await auth.startSession(user.id, form.get("remember") === "on");
    redirect("/");
  });
}

export async function signOutAction(): Promise<void> {
  await auth.endSession();
  redirect("/login");
}

/** Only pages of this app, so a crafted link can't send someone elsewhere after signing in. */
function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
}

// ---- your own account ------------------------------------------------------------------------------------------
export async function saveName(name: string): Promise<Result> {
  const me = await auth.requireUser();
  return attempt(async () => {
    const n = z.string().trim().min(1, "The name can't be empty.").max(50).parse(name);
    await prisma.user.update({ where: { id: me.id }, data: { displayName: n } });
    return ok("Name saved");
  });
}

/** Every other device you're signed in on is signed out; this one stays signed in. */
export async function changeMyPassword(current: string, next: string): Promise<Result> {
  const me = await auth.requireUser();
  return attempt(async () => {
    const err = await auth.changePassword(me.id, current, next, await auth.currentToken());
    return err ? fail(err) : ok("Password changed. You've been signed out on your other devices.");
  });
}

// ---- owners only -----------------------------------------------------------------------------------------------
export async function makeInviteCode(): Promise<Result> {
  await auth.requireOwner();
  return attempt(async () => {
    await auth.newInviteCode();
    return ok("New invite code made. The old one no longer works.");
  });
}

async function other(id: number) {
  const me = await auth.requireOwner();
  const target = await prisma.user.findUnique({ where: { id: z.number().int().parse(id) } });
  if (!target) throw new Refusal("That person no longer has an account.");
  if (target.id === me.id) throw new Refusal("Use Your account for your own changes.");
  return target;
}

/** For when someone forgets theirs. They're signed out on every device. */
export async function resetPassword(id: number, next: string): Promise<Result> {
  return attempt(async () => {
    const t = await other(id);
    const err = await auth.setPassword(t.id, next, t.username);
    return err ? fail(err) : ok(`New password set for ${t.displayName}. Tell them in person or by phone.`);
  });
}

export async function setOwner(id: number, owner: boolean): Promise<Result> {
  return attempt(async () => {
    const t = await other(id);
    await prisma.user.update({ where: { id: t.id }, data: { isOwner: Boolean(owner) } });
    return ok(`${t.displayName} is now ${owner ? "an owner" : "a member"}`);
  });
}

/** Their entries stay. They just can't sign in any more. */
export async function removePerson(id: number): Promise<Result> {
  return attempt(async () => {
    const t = await other(id);
    await prisma.user.delete({ where: { id: t.id } });
    return ok(`Removed ${t.displayName}`);
  });
}
