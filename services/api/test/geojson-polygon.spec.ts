import type { Polygon } from 'geojson';
import {
  InvalidPolygonError,
  validateGeoJsonPolygon,
} from '../src/domain/geospatial/geojson-polygon';
const valid: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [71.4, 30.1],
      [71.5, 30.1],
      [71.5, 30.2],
      [71.4, 30.1],
    ],
  ],
};
describe('validateGeoJsonPolygon', () => {
  it('accepts a closed polygon with valid WGS84 coordinates', () =>
    expect(() => validateGeoJsonPolygon(valid)).not.toThrow());
  it('rejects impossible longitude and latitude', () =>
    expect(() =>
      validateGeoJsonPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [181, 30],
            [71, 91],
            [72, 30],
            [181, 30],
          ],
        ],
      }),
    ).toThrow(InvalidPolygonError));
  it('rejects an open ring', () =>
    expect(() =>
      validateGeoJsonPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [71, 30],
            [72, 30],
            [72, 31],
            [71, 31],
          ],
        ],
      }),
    ).toThrow('must be closed'));
  it('rejects rings with fewer than three distinct positions', () =>
    expect(() =>
      validateGeoJsonPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [71, 30],
            [72, 30],
            [71, 30],
            [71, 30],
          ],
        ],
      }),
    ).toThrow('three distinct'));
});
