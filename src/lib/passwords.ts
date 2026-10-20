// Rules for usernames and passwords, shared by the server and the forms (so they can check as you type).
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const MIN_PASSWORD = 8;

export function usernameProblem(username: string): string | null {
  const u = (username ?? "").trim().toLowerCase();
  if (!u) return "Choose a username.";
  if (!USERNAME_RE.test(u)) {
    return "Use 3 to 30 letters, numbers, dots, dashes or underscores, starting with a letter or number.";
  }
  return null;
}

export function passwordProblem(password: string, username = ""): string | null {
  const p = password ?? "";
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (username && p.toLowerCase() === username.trim().toLowerCase()) return "Don't use your username as your password.";
  if (["password", "password1", "12345678", "123456789", "cashew123", "qwertyui"].includes(p.toLowerCase())) {
    return "That password is too easy to guess.";
  }
  return null;
}

export function passwordStrength(password: string): "Weak" | "Fair" | "Good" | "Strong" {
  const p = password ?? "";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  const score = Number(p.length >= 8) + Number(p.length >= 12) + Number(kinds >= 2) + Number(kinds >= 3);
  return (["Weak", "Weak", "Fair", "Good", "Strong"] as const)[score];
}

/** Something the person asked for that isn't allowed, said as it is (not as "That didn't save: ..."). */
export class Refusal extends Error {}
