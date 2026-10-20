import "server-only";
import { createHash, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { passwordProblem, Refusal, usernameProblem } from "./passwords";

// Sign-in works exactly like the Python app's core/auth.py, on the same tables:
// - passwords are salted PBKDF2-SHA256 hashes (600,000 rounds) in the same text format, so everyone keeps their
//   password when moving between the two apps;
// - after 5 wrong passwords an account is locked for 15 minutes;
// - the browser keeps a random token in an httpOnly cookie, and the database keeps only its sha256.

const derive = promisify(pbkdf2);
export const ITERATIONS = 600_000;
const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
const REMEMBER_DAYS = 30;
const SHORT_SESSION_HOURS = 12;
export const COOKIE = "cashew_session";

export type User = { id: number; username: string; name: string; isOwner: boolean };

// ---- passwords ------------------------------------------------------------------------------------------------
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await derive(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2_sha256$${ITERATIONS}$${salt.toString("base64")}$${digest.toString("base64")}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, rounds, salt, digest] = stored.split("$");
    const want = Buffer.from(digest, "base64");
    const got = await derive(password, Buffer.from(salt, "base64"), Number(rounds), want.length, "sha256");
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null; // checked when a username doesn't exist, so timing gives nothing away
function dummyHash() {
  dummy ??= hashPassword(randomBytes(8).toString("hex"));
  return dummy;
}

export { passwordProblem, passwordStrength, usernameProblem } from "./passwords";

// ---- accounts -------------------------------------------------------------------------------------------------
export async function userCount(): Promise<number> {
  return prisma.user.count();
}

export async function inviteCode(): Promise<string | null> {
  const row = await prisma.appMeta.findUnique({ where: { key: "invite_code" } });
  return row?.value ?? null;
}

export async function newInviteCode(): Promise<string> {
  const code = Array.from({ length: 3 }, () => randomBytes(2).toString("hex").toUpperCase()).join("-");
  await prisma.appMeta.upsert({ where: { key: "invite_code" }, create: { key: "invite_code", value: code },
    update: { value: code } });
  return code;
}

function sameCode(a: string, b: string) {
  const x = Buffer.from(a.trim().toUpperCase());
  const y = Buffer.from(b.trim().toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function register(usernameIn: string, displayName: string, password: string, code?: string)
  : Promise<{ user: User; error?: undefined } | { user?: undefined; error: string }> {
  const username = (usernameIn ?? "").trim().toLowerCase();
  const name = (displayName ?? "").trim() || username.replace(/^\w/, (c) => c.toUpperCase());
  const problem = usernameProblem(username) ?? passwordProblem(password, username);
  if (problem) return { error: problem };
  const hashed = await hashPassword(password); // slow on purpose, so done before the users table is locked

  const result = await prisma.$transaction(async (tx) => {
    // lock so two people can't both become the first (owner) account at once
    await tx.$executeRawUnsafe("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const first = (await tx.user.count()) === 0;
    if (!first) {
      const row = await tx.appMeta.findUnique({ where: { key: "invite_code" } });
      if (!row?.value || !code || !sameCode(row.value, code)) {
        return { error: "That invite code isn't right. Ask the account owner for the current code." };
      }
    }
    if (await tx.user.findUnique({ where: { username } })) return { error: "That username is taken." };
    const u = await tx.user.create({ data: { username, displayName: name.slice(0, 50), passwordHash: hashed,
      isOwner: first, lastLogin: new Date() } });
    return { user: { id: u.id, username: u.username, name: u.displayName, isOwner: u.isOwner } };
  });
  if (result.user?.isOwner) await newInviteCode();
  return result;
}

export async function signIn(usernameIn: string, password: string)
  : Promise<{ user: User; error?: undefined } | { user?: undefined; error: string }> {
  const username = (usernameIn ?? "").trim().toLowerCase();
  const u = await prisma.user.findUnique({ where: { username } });
  if (!u) {
    await checkPassword(password ?? "", await dummyHash());
    return { error: "Wrong username or password." };
  }
  const now = Date.now();
  if (u.lockedUntil && u.lockedUntil.getTime() > now) {
    const mins = Math.max(1, Math.floor((u.lockedUntil.getTime() - now) / 60000) + 1);
    return { error: `Too many wrong tries. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.` };
  }
  if (!(await checkPassword(password ?? "", u.passwordHash))) {
    const failed = u.failedLogins + 1;
    const lock = failed >= MAX_TRIES ? new Date(now + LOCK_MINUTES * 60000) : null;
    await prisma.user.update({ where: { id: u.id }, data: { failedLogins: lock ? 0 : failed, lockedUntil: lock } });
    if (lock) return { error: `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.` };
    const left = MAX_TRIES - failed;
    return { error: `Wrong username or password. ${left} tr${left !== 1 ? "ies" : "y"} left before a short lock.` };
  }
  await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null, lastLogin: new Date() } });
  return { user: { id: u.id, username: u.username, name: u.displayName, isOwner: u.isOwner } };
}

export async function changePassword(userId: number, current: string, next: string, keepToken?: string)
  : Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !(await checkPassword(current, u.passwordHash))) return "Your current password isn't right.";
  const problem = passwordProblem(next, u.username);
  if (problem) return problem;
  const hashed = await hashPassword(next);
  // every other device is signed out (a lost phone stops working); this browser stays signed in
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: hashed } }),
    prisma.session.deleteMany({ where: { userId, tokenHash: { not: tokenHash(keepToken) } } }),
  ]);
  return null;
}

/** Owner resets someone's password. Signs them out everywhere. */
export async function setPassword(userId: number, next: string, username = ""): Promise<string | null> {
  const problem = passwordProblem(next, username);
  if (problem) return problem;
  const hashed = await hashPassword(next);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: hashed, failedLogins: 0, lockedUntil: null } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return null;
}

// ---- sessions -------------------------------------------------------------------------------------------------
export function tokenHash(token?: string | null): string {
  return createHash("sha256").update(token ?? "").digest("hex");
}

/** Starts a session and puts its token in an httpOnly cookie. Only the token's hash is stored. */
export async function startSession(userId: number, remember: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const lifetimeMs = remember ? REMEMBER_DAYS * 86_400_000 : SHORT_SESSION_HOURS * 3_600_000;
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + lifetimeMs) } }),
  ]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    ...(remember ? { maxAge: lifetimeMs / 1000 } : {}), // otherwise it goes when the browser closes
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete(COOKIE);
}

export async function currentToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

/** Who is signed in, or null. Asked once per request however many components want it. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = await currentToken();
  if (!token || token.length > 100) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!s || s.expiresAt.getTime() <= Date.now()) return null;
  return { id: s.user.id, username: s.user.username, name: s.user.displayName, isOwner: s.user.isOwner };
});

/** For pages and server actions: the signed-in person, or off to the sign-in page. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (!user.isOwner) throw new Refusal("Only an owner can do that.");
  return user;
}
