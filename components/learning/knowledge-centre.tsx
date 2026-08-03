"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { learningArticles } from "@/features/learning/data";

const categories = ["All topics", "Crops", "Diseases", "Pests", "Nutrient deficiencies", "Prevention", "Weather"] as const;
type Category = (typeof categories)[number];

const articleImages: Record<string, string> = {
  "learn-1": "/expert-case-leaf-evidence.png",
  "learn-2": "/expert-case-leaf-early.png",
  "learn-3": "/expert-case-leaf-healthy.png",
  "learn-4": "/expert-case-leaf-healthy.png",
  "learn-5": "/expert-case-leaf-evidence.png",
};

export function KnowledgeCentre() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All topics");
  const [saved, setSaved] = useState<string[]>([]);

  const articles = useMemo(() => {
    const search = query.trim().toLowerCase();
    return learningArticles.filter((article) => {
      const matchesCategory = category === "All topics" || article.category === category;
      const matchesSearch = !search || `${article.title} ${article.summary} ${article.crop ?? ""}`.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [category, query]);

  function toggleSaved(articleId: string) {
    setSaved((current) => current.includes(articleId) ? current.filter((id) => id !== articleId) : [...current, articleId]);
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f8f5ec]">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-7">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-success">Learn · prevent · protect</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-dark">Agriculture Knowledge Centre</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Expert-reviewed crop health, disease, pest and prevention guidance built for practical field decisions.</p>
          </div>
          <Link href="/scan" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-xs font-extrabold text-white shadow-lg shadow-green-900/15">Start a new scan</Link>
        </header>

        <section className="mt-4 rounded-2xl border border-brand/10 bg-white p-3 shadow-[0_8px_24px_rgba(15,45,32,.05)]">
          <label className="relative block">
            <span className="sr-only">Search learning topics</span>
            <Icon name="search" className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search crops, diseases, pests or farming topics" className="h-10 w-full rounded-xl border border-[#dfe8dc] bg-[#f7faf5] pl-12 pr-4 text-xs transition focus:border-brand focus:bg-white" />
          </label>
          <nav aria-label="Knowledge categories" className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`min-h-8 shrink-0 rounded-full px-3 text-[10px] font-bold transition ${category === item ? "bg-brand text-white shadow-sm" : "border border-border bg-white text-muted hover:border-brand/30 hover:text-brand"}`}>{item}</button>
            ))}
          </nav>
        </section>

        <section aria-label="Learning articles" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => article.featured ? (
            <FeaturedArticle key={article.id} article={article} saved={saved.includes(article.id)} onSave={() => toggleSaved(article.id)} />
          ) : (
            <article key={article.id} className="group overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-[0_8px_26px_rgba(15,45,32,.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,45,32,.12)]">
              <div className="relative h-36 overflow-hidden bg-[#dce8d7]">
                <Image src={articleImages[article.id]} alt={`${article.title} crop example`} fill priority={article.id === "learn-1"} unoptimized sizes="(max-width: 768px) 100vw, 30vw" className="object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/5" />
                <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-brand shadow-sm">{article.category}</span>
                <button onClick={() => toggleSaved(article.id)} aria-pressed={saved.includes(article.id)} aria-label={`${saved.includes(article.id) ? "Remove" : "Save"} ${article.title}`} className={`absolute right-3 top-3 grid size-9 place-items-center rounded-full border text-base shadow-sm backdrop-blur ${saved.includes(article.id) ? "border-brand bg-brand text-white" : "border-white/70 bg-white/90 text-brand"}`}>{saved.includes(article.id) ? "★" : "☆"}</button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted"><span>{article.level}</span><span>•</span><span>{article.readMinutes} min read</span>{article.crop && <><span>•</span><span>{article.crop}</span></>}</div>
                <h2 className="mt-2 text-base font-extrabold leading-5 text-brand-dark">{article.title}</h2>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{article.summary}</p>
                <Link href={`/learning/${article.slug}`} className="mt-3 inline-flex min-h-8 items-center gap-2 text-[11px] font-extrabold text-brand">Read full guide <span className="transition group-hover:translate-x-1">→</span></Link>
              </div>
            </article>
          ))}

          {!articles.length && (
            <div className="col-span-full rounded-2xl border border-brand/10 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="search" /></div>
              <h2 className="mt-4 text-lg font-extrabold">No matching guides</h2>
              <p className="mt-2 text-sm text-muted">Try another crop, symptom or topic.</p>
              <button onClick={() => { setQuery(""); setCategory("All topics"); }} className="mt-5 min-h-10 rounded-xl bg-brand px-5 text-xs font-bold text-white">Clear filters</button>
            </div>
          )}
        </section>

        <footer className="mt-5 flex flex-col gap-3 border-t border-brand/10 py-4 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {articles.length} of {learningArticles.length} reviewed learning resources</p>
          <div className="flex items-center gap-2"><button aria-label="Previous page" disabled className="grid size-9 place-items-center rounded-lg border border-border bg-white disabled:opacity-40">←</button><button aria-current="page" className="grid size-9 place-items-center rounded-lg bg-brand font-extrabold text-white">1</button><button className="grid size-9 place-items-center rounded-lg border border-border bg-white">2</button><button aria-label="Next page" className="grid size-9 place-items-center rounded-lg border border-border bg-white">→</button></div>
        </footer>
      </div>
    </div>
  );
}

function FeaturedArticle({ article, saved, onSave }: { article: (typeof learningArticles)[number]; saved: boolean; onSave: () => void }) {
  return (
    <article className="group relative min-h-[284px] overflow-hidden rounded-2xl bg-brand-dark text-white shadow-[0_18px_44px_rgba(0,50,31,.2)] md:col-span-2 xl:col-span-2">
      <Image src={articleImages[article.id]} alt="Cotton disease prevention field guide" fill unoptimized sizes="(max-width: 1280px) 66vw, 60vw" className="object-cover opacity-55 transition duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#003621] via-[#00452d]/80 to-transparent" />
      <div className="relative flex h-full min-h-[284px] flex-col justify-end p-5">
        <div className="absolute left-5 top-5 flex gap-2"><span className="rounded-full bg-brand-soft px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-brand-dark">Featured</span><span className="rounded-full bg-white/15 px-3 py-1 text-[9px] font-bold backdrop-blur">{article.readMinutes} min</span></div>
        <button onClick={onSave} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${article.title}`} className="absolute right-5 top-5 grid size-9 place-items-center rounded-full border border-white/30 bg-black/10 text-base backdrop-blur">{saved ? "★" : "☆"}</button>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-brand-soft">Essential field guide</p>
        <h2 className="mt-2 max-w-lg text-xl font-extrabold leading-7">{article.title}</h2>
        <p className="mt-2 max-w-xl text-xs leading-5 text-white/75">{article.summary}</p>
        <div className="mt-4 flex items-center gap-3"><Link href={`/learning/${article.slug}`} className="inline-flex min-h-10 items-center rounded-xl bg-brand-soft px-4 text-[11px] font-extrabold text-brand-dark">Open checklist</Link><button className="grid size-10 place-items-center rounded-full border border-white/30 bg-white/10 text-[10px] font-bold" aria-label="Listen to guide">Play</button><span className="text-[10px] text-white/70">Audio guide</span></div>
      </div>
    </article>
  );
}
