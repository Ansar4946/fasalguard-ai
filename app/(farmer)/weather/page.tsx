import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { WeatherIntelligenceLoader } from "@/components/intelligence/weather-intelligence-loader";
import { authenticatedJson } from "@/lib/auth/server-session";
import type { FieldOption } from "@/features/weather/types";

export const metadata: Metadata = {
  title: "Weather Intelligence",
  description: "Crop-aware weather guidance and agricultural risk alerts.",
};

interface FarmSummaryResponse {
  id: string;
  name: string;
  soilType: string | null;
  irrigationType: string | null;
}

interface FieldSummaryResponse {
  id: string;
  name: string;
  currentCropCycle: { growthStage: string | null; status: string } | null;
}

export default async function WeatherPage() {
  const { response: farmsResponse, body: farmsBody } = await authenticatedJson<FarmSummaryResponse[]>("/farms");

  if (!farmsResponse.ok) {
    return (
      <div className="page-container">
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-xs font-semibold text-danger">
          Could not load your farms right now. Try refreshing the page.
        </p>
      </div>
    );
  }

  const farms = Array.isArray(farmsBody) ? farmsBody : [];

  if (farms.length === 0) {
    return <EmptyState title="No farms yet" message="Add a farm and field to see weather forecasts for your crops." />;
  }

  const perFarmFields = await Promise.all(
    farms.map(async (farm): Promise<FieldOption[]> => {
      const { response, body } = await authenticatedJson<FieldSummaryResponse[]>(`/farms/${farm.id}/fields`);
      if (!response.ok || !Array.isArray(body)) return [];
      return body.map((field) => ({
        id: field.id,
        farmId: farm.id,
        name: field.name,
        farmName: farm.name,
        soilType: farm.soilType,
        irrigationType: farm.irrigationType,
        growthStage: field.currentCropCycle?.growthStage ?? null,
        cropCycleStatus: field.currentCropCycle?.status ?? null,
      }));
    }),
  );
  const fields = perFarmFields.flat();

  if (fields.length === 0) {
    return <EmptyState title="No fields yet" message="Add a field to one of your farms to see weather forecasts for your crops." />;
  }

  return <WeatherIntelligenceLoader fields={fields} />;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="page-container">
      <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-brand/20 bg-white/35 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name="weather" />
        </span>
        <strong className="mt-1 text-base text-brand-dark">{title}</strong>
        <p className="max-w-xs text-xs text-muted">{message}</p>
        <Link
          href="/farms/new"
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-xs font-extrabold text-white"
        >
          <Icon name="plus" className="size-4" />
          Add Farm
        </Link>
      </div>
    </div>
  );
}
