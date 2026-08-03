import { notFound } from "next/navigation";
import { FieldsManagement } from "@/components/fields/fields-management";
import { getFarm } from "@/features/farms/data";

export default async function FieldsPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const farm = getFarm(farmId);
  if (!farm) notFound();
  return <FieldsManagement farm={farm} />;
}
