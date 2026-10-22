export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/** Converts Leaflet-order [lat, lng] vertices into a closed GeoJSON [lng, lat] polygon ring. */
export function toGeoJsonPolygon(points: [number, number][], holes: [number, number][][] = []): GeoJsonPolygon {
  const coordinates = [points, ...holes].map((vertices) => {
    const ring = vertices.map(([lat, lng]) => [lng, lat]);
    if (ring.length > 0) ring.push([...ring[0]]);
    return ring;
  });
  return { type: "Polygon", coordinates };
}

export function polygonRings(polygon: GeoJsonPolygon): [number, number][][] {
  return polygon.coordinates.map((ring) => fromGeoJsonPolygon({ type: "Polygon", coordinates: [ring] }));
}

/** Converts a GeoJSON [lng, lat] polygon's outer ring back into Leaflet-order [lat, lng] vertices. */
export function fromGeoJsonPolygon(polygon: GeoJsonPolygon): [number, number][] {
  const ring = polygon.coordinates[0] ?? [];
  const points = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  if (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1])
    points.pop();
  return points;
}
