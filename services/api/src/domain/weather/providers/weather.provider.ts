export const WEATHER_PROVIDER = Symbol('WEATHER_PROVIDER');
export interface WeatherPoint {
  time: string;
  temperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPercent: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  solarRadiationWm2: number | null;
  et0Mm: number | null;
  soilMoistureM3M3: number | null;
  soilTemperatureC: number | null;
}
export interface WeatherBundle {
  provider: string;
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;
  current: WeatherPoint;
  hourly: WeatherPoint[];
  rawMetadata: Record<string, unknown>;
}
export interface WeatherProvider {
  getWeather(latitude: number, longitude: number): Promise<WeatherBundle>;
}
export class WeatherProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
  }
}
