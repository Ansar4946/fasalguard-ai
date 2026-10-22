import { DEMO_SHORT_CODE } from "@/features/farm-finance/ussd-formatters";

const steps = [
  `Dial ${DEMO_SHORT_CODE} and press the green call button.`,
  "Enter your transaction PIN, then pick a farm, crop season and expense category.",
  "Type the amount, choose the date and confirm. The receipt is then checked against your ledger.",
];

export function ExplainCard() {
  return (
    <section className="rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-white p-5 text-amber-950 shadow-[0_14px_40px_-20px_rgb(162_92_0/.45)]" role="note" aria-labelledby="explain-heading">
      <p className="inline-block rounded-full bg-amber-200/70 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.14em]">Simulation</p>
      <h2 id="explain-heading" className="mt-2 text-lg font-extrabold">No mobile operator or short code is connected</h2>
      <p className="mt-1 text-sm leading-6">
        This browser reproduces the application flow. It does not place a USSD call or transfer money. Confirming an expense creates a real ledger record.
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-900 text-xs font-bold text-white">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
