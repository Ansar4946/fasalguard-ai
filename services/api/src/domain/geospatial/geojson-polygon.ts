import type { Position, Polygon } from 'geojson';

export class InvalidPolygonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPolygonError';
  }
}

function validatePosition(position: Position, path: string): void {
  if (position.length < 2)
    throw new InvalidPolygonError(`${path} must contain longitude and latitude.`);
  const [longitude, latitude] = position;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  )
    throw new InvalidPolygonError(`${path} coordinates must be finite numbers.`);
  if (longitude < -180 || longitude > 180)
    throw new InvalidPolygonError(`${path} longitude must be between -180 and 180.`);
  if (latitude < -90 || latitude > 90)
    throw new InvalidPolygonError(`${path} latitude must be between -90 and 90.`);
}
function positionsEqual(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function validateGeoJsonPolygon(value: unknown): asserts value is Polygon {
  if (!value || typeof value !== 'object')
    throw new InvalidPolygonError('Boundary must be a GeoJSON Polygon object.');
  const candidate = value as Partial<Polygon>;
  if (candidate.type !== 'Polygon' || !Array.isArray(candidate.coordinates))
    throw new InvalidPolygonError('Boundary type must be Polygon.');
  if (candidate.coordinates.length === 0)
    throw new InvalidPolygonError('Polygon must contain an exterior ring.');
  candidate.coordinates.forEach((ring, ringIndex) => {
    if (!Array.isArray(ring) || ring.length < 4)
      throw new InvalidPolygonError(`Ring ${ringIndex} must contain at least four positions.`);
    ring.forEach((position, positionIndex) =>
      validatePosition(position, `Ring ${ringIndex}, position ${positionIndex}`),
    );
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || !positionsEqual(first, last))
      throw new InvalidPolygonError(`Ring ${ringIndex} must be closed.`);
    const unique = new Set(ring.slice(0, -1).map((position) => `${position[0]},${position[1]}`));
    if (unique.size < 3)
      throw new InvalidPolygonError(
        `Ring ${ringIndex} must contain at least three distinct positions.`,
      );
  });
}
