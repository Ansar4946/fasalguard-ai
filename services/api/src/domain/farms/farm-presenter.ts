export interface CommunityFarmRepresentation {
  id: string;
  province: string | null;
  district: string | null;
  areaBand: 'under_1_ha' | '1_to_5_ha' | 'over_5_ha';
}

/** Public/community projections deliberately omit names, boundaries, centroids and owner IDs. */
export function toCommunityFarmRepresentation(input: {
  id: string;
  province: string | null;
  district: string | null;
  areaHectares: number;
}): CommunityFarmRepresentation {
  return {
    id: input.id,
    province: input.province,
    district: input.district,
    areaBand:
      input.areaHectares < 1 ? 'under_1_ha' : input.areaHectares <= 5 ? '1_to_5_ha' : 'over_5_ha',
  };
}
