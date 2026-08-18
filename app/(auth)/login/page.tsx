import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = {
  title: "Sign in | FasalGuard AI",
  description: "Sign in to manage your farms and monitor crop health.",
};

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_85%_10%,rgba(217,245,199,.34),transparent_28%),#fbfcfa] lg:grid lg:grid-cols-[minmax(0,1.02fr)_minmax(520px,.98fr)]">
      <section
        className="relative hidden min-h-dvh overflow-hidden bg-brand-dark text-white lg:flex lg:flex-col lg:justify-between"
        aria-label="About FasalGuard AI"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/login-field-hero.png')" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,54,35,.40),rgba(0,54,35,.16)_35%,rgba(0,45,29,.88))]" />
        <div className="relative p-10 xl:p-12">
          <div className="flex items-center gap-3">
            <BrandLogo compact priority className="size-14 drop-shadow-lg" />
            <div>
              <p className="text-sm font-extrabold">FasalGuard AI</p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-brand-soft">
                Agricultural intelligence
              </p>
            </div>
          </div>
        </div>
        <div className="relative max-w-xl p-10 xl:p-12">
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-brand-soft">
            Protect every field
          </p>
          <h2 className="mt-3 text-2xl font-bold leading-8 xl:text-3xl">
            Detect crop threats before disease spreads.
          </h2>
          <p className="mt-3 max-w-lg text-xs leading-5 text-white/75">
            AI crop screening, expert verification and regional early warnings
            help protect your yield and livelihood.
          </p>
          <div className="mt-5 grid max-w-md grid-cols-2 gap-3">
            <Proof value="88%" label="AI confidence" />
            <Proof value="24/7" label="Field monitoring" />
          </div>
        </div>
        <p className="relative p-10 text-[10px] font-semibold text-white/65 xl:px-12">
          <span className="mr-2 inline-block size-2 rounded-full bg-lime-300" />
          Monitoring agricultural health across Pakistan
        </p>
      </section>
      <section className="flex min-h-dvh items-center justify-center border-l border-border/70 px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
        <LoginForm />
      </section>
    </main>
  );
}

function Proof({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/90 p-3 text-brand-dark shadow-lg backdrop-blur">
      <strong className="text-sm">{value}</strong>
      <p className="mt-0.5 text-[9px] text-muted">{label}</p>
    </div>
  );
}
