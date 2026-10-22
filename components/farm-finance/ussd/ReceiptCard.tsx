export type ReceiptView = { id: string; tone: "verified" | "pending" | "problem"; message: string };

export function ReceiptCard({ receipt }: { receipt: ReceiptView }) {
  const ok = receipt.tone === "verified";
  const palette = ok ? "bg-emerald-50 text-emerald-950" : receipt.tone === "problem" ? "bg-red-50 text-red-950" : "bg-amber-50 text-amber-950";
  return (
    <div className={`mt-3 flex gap-3 rounded-xl p-3 ${palette}`}>
      <span aria-hidden="true" className={`fg-tick-circle grid size-10 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-600" : "bg-amber-600"}`}>
        {ok ? (
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="fg-tick-path" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M12 7v6M12 17h.01" /></svg>
        )}
      </span>
      <div className="min-w-0 text-xs leading-5">
        <p>{receipt.message}</p>
        <p className="mt-1 break-all">Receipt <bdi className="font-mono">{receipt.id}</bdi></p>
      </div>
    </div>
  );
}
