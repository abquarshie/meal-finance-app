import { redirect } from "next/navigation";
import { getUser, userCount } from "@/lib/auth";
import { AuthForms } from "./AuthForms";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getUser()) redirect("/");
  let first = false;
  try {
    first = (await userCount()) === 0;
  } catch (e) {
    console.error(e);
    return (
      <div className="auth"><div className="card"><div className="note error">
        Couldn&apos;t reach the database. Check DATABASE_URL in your settings.
      </div></div></div>
    );
  }
  const { next } = await searchParams;
  return (
    <div className="auth">
      <div className="card">
        <div className="auth-head">
          <img src="/icon.svg" alt="" />
          <div className="auth-title">Cashew</div>
          <div className="auth-sub">{first ? "Set up your family's Cashew" : "Family money, together"}</div>
        </div>
        <AuthForms first={first} next={next ?? "/"} />
      </div>
    </div>
  );
}
