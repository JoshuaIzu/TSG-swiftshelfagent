import { Context, Layer } from "effect";
import type { InventorySKU } from "./types";

export interface InventoryReportStrategy {
  readonly formatSummary: (merchantId: string, skus: ReadonlyArray<InventorySKU>, version: 1 | 2) => string;
}

export const InventoryReportStrategy = Context.GenericTag<InventoryReportStrategy>("@swiftshelf/InventoryReportStrategy");

export const InventoryReportStrategyLive = Layer.succeed(
  InventoryReportStrategy,
  InventoryReportStrategy.of({
    formatSummary: (merchantId, skus, version) => {
      const header = ` *SwiftShelf 3PL Stock Audit Ledger* (Merchant: ${merchantId})\n`;
      const skuLines = skus.map(s => `• *${s.name}* (${s.sku}): ${s.availableQty} units @ ₦${(s.unitPriceKobo / 100).toLocaleString()} | Velocity: ${s.velocityRate}`).join("\n");

      if (version === 1) return `${header}\n${skuLines}\n\n_Generated via SwiftShelf Core v1_`;

      return `${header}\n${skuLines}\n\n *Operational Ownership Matrix (v2)*:\n- [Procurement]: Reorder alert for SKUs below threshold\n- [Rider Ops]: Pre-assign bike riders for FAST velocity SKUs\n- [Finance]: Prepaid wallet reconciliation pending\n- [Warehouse]: Cycle count scheduled for Ikeja Hub\n\n_Generated via SwiftShelf Operational Engine v2_`;
    },
  })
);