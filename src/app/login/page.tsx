import { redirect } from "next/navigation";
import { APPS } from "@/lib/apps";
import { getUser, userCount } from "@/lib/auth";
import { currentSpace } from "@/lib/space";
import { AuthForms } from "./AuthForms";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  let first = false;
  let signedIn = false;
  try {
    signedIn = Boolean(await getUser());
    first = !signedIn && (await userCount()) === 0;
  } catch (e) {
    console.error(e);
    return (
      <div className="grid min-h-dvh place-items-start justify-center px-4 pt-[8vh]"><div className="card w-full max-w-md"><div className="note error">
        Couldn&apos;t reach the database. Check DATABASE_URL in your settings.
      </div></div></div>
    );
  }
  const { next } = await searchParams;
  const app = APPS[await currentSpace()];
  if (signedIn) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : app.home);
  return (
    <div className="grid min-h-dvh place-items-start justify-center px-4 pt-[8vh] pb-8">
      <div className="card w-[min(28rem,calc(100vw-2rem))] p-6">
        <div className="mb-5 text-center">
          <img src={app.icon} alt="" className="mx-auto mb-3 size-12" />
          <div className="text-2xl font-bold tracking-tight">{app.name}</div>
          <div className="mt-0.5 text-sm text-muted">{first ? `Set up your family's ${app.name}` : app.tagline}</div>
        </div>
        <AuthForms first={first} next={next ?? app.home} />
      </div>
    </div>
  );
}
