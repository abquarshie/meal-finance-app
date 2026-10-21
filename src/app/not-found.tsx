import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-soft text-2xl" aria-hidden>🔍</div>
        <h1 className="m-0 text-lg font-bold">That page isn&apos;t here</h1>
        <p className="mt-1.5 mb-4 text-sm text-muted">The link may be old, or the item was removed.</p>
        <Link className="btn primary" href="/">Go to Home</Link>
      </div>
    </div>
  );
}
