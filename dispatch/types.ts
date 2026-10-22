import type { LagosZone } from "../logistics/types";

export type DispatchEvent = {
  readonly type: "DISPATCH_BOOKED";
  readonly dispatchId: string;
  readonly merchantId: string;
  readonly sku: string;
  readonly qty: number;
  readonly zone: LagosZone;
  readonly totalFeeKobo: number;
  readonly remainingBalanceKobo: number;
};