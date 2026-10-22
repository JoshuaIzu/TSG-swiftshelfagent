import { Effect } from "effect";
import { InventoryReportStrategy } from "./strategy";
import { EventBusService }  from "../core/EventBus";
import type { InventorySKU } from "./types";

export const MOCK_INVENTORY: ReadonlyArray<InventorySKU> = [
    { sku: "SKU-PERFUME-01", name: "Oud Royale Perfume 100ml", availableQty: 45, unitPriceKobo: 1800000, velocityRate: "FAST", reorderLevel: 10 },
    { sku: "SKU-SILK-02", name: "Mulberry Silk Scarf", availableQty: 12, unitPriceKobo: 850000, velocityRate: "MEDIUM", reorderLevel: 5 },
    { sku: "SKU-GLOW-03", name: "Vitamin C Serum 50ml", availableQty: 3, unitPriceKobo: 650000, velocityRate: "FAST", reorderLevel: 10 },
];

export const tool_get_inventory_summary = (merchantId: string, version: 1 | 2 = 1) =>
  Effect.gen(function* () {
    const reporter = yield* InventoryReportStrategy;
    const eventBus = yield* EventBusService;

    const summaryText = reporter.formatSummary(merchantId, MOCK_INVENTORY, version);
    yield* eventBus.publish({ type: "INVENTORY_AUDITED", merchantId, version, skuCount: MOCK_INVENTORY.length });

    return { status: "SUCCESS" as const, summary: summaryText, skus: MOCK_INVENTORY };
  });