export const MARKET_PRICE_PROVIDER = Symbol('MARKET_PRICE_PROVIDER');

export interface MarketPriceObservation {
  crop: string;
  market: string;
  district: string;
  province: string;
  minimumPrice: number;
  maximumPrice: number;
  averagePrice: number;
  quantity: number;
  unit: string;
  source: string;
  priceDate: string;
  sourceIdentifier: string;
  sourceUrl: string;
}

export interface MarketPriceProvider {
  fetchCurrentPrices(): Promise<MarketPriceObservation[]>;
}

export class MarketPriceProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
