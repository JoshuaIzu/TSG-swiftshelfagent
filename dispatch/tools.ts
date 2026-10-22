import { Effect } from "effect";
import { PricingStrategy } from "../logistics/pricing";
import { WalletLedgerService } from "../wallet/ledger";
import { EventBusService } from "../core/EventBus";
import { StockUnavailableError } from "../inventory/types";
import { AdvisoryNotAcceptedError } from "../logistics/types";
import { MOCK_INVENTORY } from "../inventory/tools";
import { MOCK_ZONE_BRIEFS } from "../logistics/tools";
import type { LagosZone } from "../logistics/types";

export const tool_book_dispatch = (merchantId: string, sku: string, qty: number, zone: LagosZone, acceptAdvisory: boolean) =>
  Effect.gen(function* () {
    const pricer = yield* PricingStrategy;
    const ledgerService = yield* WalletLedgerService;
    const eventBus = yield* EventBusService;

    // 1. Inventory Check
    const item = MOCK_INVENTORY.find((i) => i.sku === sku);
    if (!item || item.availableQty < qty) {
      return yield* Effect.fail(new StockUnavailableError({ sku, requestedQty: qty, availableQty: item ? item.availableQty : 0 }));
    }

    // 2. Logistics & Zone Brief
    const brief = MOCK_ZONE_BRIEFS[zone];
    if (brief.disruptionLevel === "HIGH_DISRUPTION" && !acceptAdvisory) {
      return yield* Effect.fail(new AdvisoryNotAcceptedError({ zone, advisoryText: brief.advisoryText, surchargeKobo: brief.surchargeKobo }));
    }

    // 3. Pricing
    const feeBreakdown = yield* pricer.calculateDispatchFee(zone, qty, brief);

    // 4. Wallet Deduction
    const deduction = yield* ledgerService.deductCreditAtomic(merchantId, feeBreakdown.totalFeeKobo);

    const dispatchId = `DSP-${Date.now().toString().slice(-6)}`;

    yield* eventBus.publish({
      type: "DISPATCH_BOOKED",
      dispatchId, merchantId, sku, qty, zone,
      totalFeeKobo: feeBreakdown.totalFeeKobo,
      remainingBalanceKobo: deduction.newBalanceKobo
    });

    return {
      status: "BOOKED" as const,
      dispatchId, merchantId, sku, qty, zone,
      feeBreakdown: { totalFeeNgn: feeBreakdown.totalFeeKobo / 100 },
      remainingBalanceNgn: deduction.newBalanceKobo / 100
    };
  });