export interface CropOption {
  id: string;
  slug: string;
  name: string;
  varieties: Array<{ id: string; name: string }>;
}

export const growthStages = ["Sowing", "Germination", "Vegetative", "Flowering", "Fruiting / boll formation", "Maturity"] as const;

/** Fetches the reference crop catalogue; resolves to [] when it can't be loaded. */
export async function loadCrops(): Promise<CropOption[]> {
  try {
    const response = await fetch("/api/crops");
    if (!response.ok) return [];
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? (body as CropOption[]) : [];
  } catch {
    return [];
  }
}
