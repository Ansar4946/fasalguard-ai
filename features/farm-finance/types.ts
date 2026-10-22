export interface UssdDemoResponse {
  text: string;
}

export interface FarmLedgerEntry {
  id: string;
  farmId: string;
  cropSeasonId: string;
  farmName: string;
  category: string;
  amountMinor: string;
  currency: "PKR";
  occurredOn: string;
  channel: "USSD";
  confirmedAt: string;
  createdAt: string;
}

