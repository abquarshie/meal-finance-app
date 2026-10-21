// Shown at once while a page reads the latest figures, in the shape of what's coming.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-5 grid gap-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-56" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="stack">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[92px] rounded-2xl md:h-[110px]" />)}
          </div>
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-12 rounded-2xl" />
        </div>
        <div className="stack">
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-14 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
