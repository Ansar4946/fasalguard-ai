export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1180px] animate-pulse p-4 md:p-6 xl:p-7" role="status">
      <div className="h-8 w-64 rounded-xl bg-brand/10" />
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-brand/10" />)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(245px,.82fr)]">
        <div className="h-96 rounded-2xl bg-brand/10" />
        <div className="h-96 rounded-2xl bg-brand/10" />
      </div>
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
