import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditFarmForm, type EditFarmFormData } from "@/components/farms/edit-farm-form";
import { authenticatedJson } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  title: "Edit Farm",
  description: "Update farm details and its mapped boundary.",
};

export default async function EditFarmPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const { response, body } = await authenticatedJson<EditFarmFormData>(`/farms/${farmId}`);

  if (response.status === 404) notFound();
  if (!response.ok)
    return (
      <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-xs font-semibold text-danger">
          Could not load this farm right now. Try refreshing the page.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
      <header>
        <h1 className="text-[28px] font-extrabold leading-tight text-brand-dark">Edit Farm</h1>
        <p className="mt-1 text-sm text-muted">Update the boundary or details for {body.name}.</p>
      </header>
      <EditFarmForm farm={body} />
    </div>
  );
}
