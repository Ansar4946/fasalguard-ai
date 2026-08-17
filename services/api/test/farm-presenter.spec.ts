import { toCommunityFarmRepresentation } from '../src/domain/farms/farm-presenter';

describe('community farm representation', () => {
  it('never exposes exact coordinates, owner identity or farm names', () => {
    const result = toCommunityFarmRepresentation({
      id: 'public-alias',
      province: 'Punjab',
      district: 'Multan',
      areaHectares: 2.4,
    });
    expect(result).toEqual({
      id: 'public-alias',
      province: 'Punjab',
      district: 'Multan',
      areaBand: '1_to_5_ha',
    });
    expect(result).not.toHaveProperty('boundary');
    expect(result).not.toHaveProperty('centroid');
    expect(result).not.toHaveProperty('farmerId');
  });
});
