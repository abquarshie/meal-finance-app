// One deployment, two home-screen apps sharing one sign-in: Cashew for the family's money and Jollof for the kitchen.
// Which one you're in follows the page you open; anything else (the sign-in page) stays in whichever you came from.
export type Space = "money" | "meals";

export const APPS = {
  money: { name: "Cashew", tagline: "Family money, together", home: "/", manifest: "/manifest.json", icon: "/icon.svg", apple: "/apple-icon.png" },
  meals: { name: "Jollof", tagline: "Family meals, planned", home: "/meals", manifest: "/manifest-meals.json", icon: "/icon-meals.svg", apple: "/apple-icon-meals.png" },
} as const;

export const SPACE_COOKIE = "cashew_app";
export const SPACE_HEADER = "x-cashew-app";

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** The app a page belongs to, or null for pages outside both (sign-in). */
export function spaceOf(path: string): Space | null {
  if (["/meals", "/shopping", "/pantry"].some((r) => under(path, r))) return "meals";
  if (path === "/" || ["/transactions", "/budgets", "/goals", "/settings"].some((r) => under(path, r))) return "money";
  return null;
}

export const asSpace = (v: string | null | undefined): Space => (v === "meals" ? "meals" : "money");
