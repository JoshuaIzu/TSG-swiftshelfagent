import { Data } from "effect";

export interface InventorySKU {
  readonly sku: string;
  readonly name: string;
  readonly availableQty: number;
  readonly unitPriceKobo: number;
  readonly velocityRate: "FAST" | "MEDIUM" | "SLOW";
  readonly reorderLevel: number;
}

export type InventoryEvent = {
  readonly type: "INVENTORY_AUDITED";
  readonly merchantId: string;
  readonly version: 1 | 2;
  readonly skuCount: number;
};

export class StockUnavailableError extends Data.TaggedError("StockUnavailable")<{
  readonly sku: string;
  readonly requestedQty: number;
  readonly availableQty: number;
}> {}