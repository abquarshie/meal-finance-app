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
      <div className="grid min-h-dvh place-items-start justify-center px-4 pt-[8vh]"><div className="card w-full max-w-md"><div className="note error">
        Couldn&apos;t reach the database. Check DATABASE_URL in your settings.
      </div></div></div>
    );
  }
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-start justify-center px-4 pt-[8vh] pb-8">
      <div className="card w-[min(28rem,calc(100vw-2rem))] p-6">
        <div className="mb-5 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 size-12" />
          <div className="text-2xl font-bold tracking-tight">Cashew</div>
          <div className="mt-0.5 text-sm text-muted">{first ? "Set up your family's Cashew" : "Family money, together"}</div>
        </div>
        <AuthForms first={first} next={next ?? "/"} />
      </div>
    </div>
  );
}
