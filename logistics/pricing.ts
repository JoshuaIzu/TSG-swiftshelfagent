import { Effect, Context, Layer } from "effect";
import type { LagosZone, ZoneConditionBrief, InvalidZoneError } from "./types";

export interface PricingStrategy {
  readonly calculateDispatchFee: (zone: LagosZone, qty: number, brief: ZoneConditionBrief) => Effect.Effect<{ readonly baseFeeKobo: number; readonly surchargeKobo: number; readonly totalFeeKobo: number }, InvalidZoneError>;
}

export const PricingStrategy = Context.GenericTag<PricingStrategy>("@swiftshelf/PricingStrategy");

export const StandardPricingStrategyLive = Layer.succeed(
  PricingStrategy,
  PricingStrategy.of({
    calculateDispatchFee: (zone, qty, brief) =>
      Effect.gen(function* () {
        const baseBikeRateKobo = 200000;
        const qtySurchargeKobo = (qty - 1) * 20000;
        return {
          baseFeeKobo: baseBikeRateKobo + qtySurchargeKobo,
          surchargeKobo: brief.surchargeKobo,
          totalFeeKobo: baseBikeRateKobo + qtySurchargeKobo + brief.surchargeKobo
        };
      }),
  })
);