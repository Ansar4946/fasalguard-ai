import { notFound } from "next/navigation";
import { FarmDetail } from "@/components/farms/detail";
import { farms, getFarm } from "@/features/farms/data";

export function generateStaticParams() {
  return farms.map((farm) => ({ farmId: farm.id }));
}

export default async function FarmPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const farm = getFarm(farmId);

  if (!farm) notFound();

  return <FarmDetail farm={farm} />;
}
