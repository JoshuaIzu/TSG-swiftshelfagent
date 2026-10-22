import { Layer, ManagedRuntime } from "effect";
import { EventBusLive } from "./EventBus";
import { StandardPricingStrategyLive } from "../logistics/pricing";
import { InventoryReportStrategyLive } from "../inventory/strategy";
import { WalletLedgerLive } from "../wallet/ledger";

export const AppLayer = Layer.mergeAll(
  StandardPricingStrategyLive,
  InventoryReportStrategyLive,
  WalletLedgerLive.pipe(Layer.provideMerge(EventBusLive))
);

export const appRuntime = ManagedRuntime.make(AppLayer);