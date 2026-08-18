import { notFound } from "next/navigation";
import { FarmDetail, type FarmDetailData } from "@/components/farms/detail";
import { authenticatedJson } from "@/lib/auth/server-session";

export default async function FarmPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const { response, body } = await authenticatedJson<FarmDetailData>(`/farms/${farmId}`);

  if (response.status === 404) notFound();
  if (!response.ok)
    return (
      <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-xs font-semibold text-danger">
          Could not load this farm right now. Try refreshing the page.
        </p>
      </div>
    );

  return <FarmDetail farm={body} />;
}
