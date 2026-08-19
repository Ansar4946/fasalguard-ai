interface Testimonial {
  id: string;
  feedback: string | null;
  feature: string;
  publicReferenceUrl: string | null;
  publishedAt: string;
  fullName: string | null;
}

async function loadTestimonials(): Promise<Testimonial[]> {
  const base = process.env.FASALGUARD_API_URL ?? "http://localhost:4000/api/v1";
  const res = await fetch(`${base}/growth/testimonials`, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as Testimonial[];
}

export default async function TestimonialsPage() {
  const testimonials = await loadTestimonials();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
        Real feedback from real farmers — published only with their explicit permission
      </p>
      <h1 className="mt-1 text-2xl font-bold text-brand-dark">What farmers say</h1>

      {testimonials.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No testimonials have been published yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {testimonials.map((t) => (
            <li key={t.id} className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
              <p className="text-sm text-brand-dark">&ldquo;{t.feedback}&rdquo;</p>
              <div className="mt-3 flex items-center justify-between text-[10px] text-muted">
                <span className="font-bold">{t.fullName ?? "A FasalGuard farmer"}</span>
                <span className="rounded-full bg-surface-soft px-2 py-0.5 font-bold uppercase">
                  {t.feature.replace(/_/g, " ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
