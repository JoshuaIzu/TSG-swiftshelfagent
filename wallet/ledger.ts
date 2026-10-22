import { Effect, Context, Layer, SynchronizedRef, Option } from "effect";
import { EventBusService } from "../core/EventBus";
import { InsufficientWalletCreditError, PaymentGatewayError, DuplicateTransactionReferenceError, MerchantNotFoundError } from "./types";
import type { WalletLedger } from "./types";
import { initializePaystackCheckout } from "./paystack";

export interface WalletLedgerService {
  readonly getLedger: (merchantId: string) => Effect.Effect<Option.Option<WalletLedger>>;
  readonly provisionWallet: (merchantId: string, email: string) => Effect.Effect<WalletLedger>;
  readonly initializeTopup: (merchantId: string, amountNgn: number, refOverride?: string) => Effect.Effect<{ readonly reference: string; readonly checkoutUrl: string; readonly amountKobo: number }, PaymentGatewayError>;
  readonly creditTopup: (merchantId: string, reference: string, amountKobo: number) => Effect.Effect<{ readonly newBalanceKobo: number }, DuplicateTransactionReferenceError | MerchantNotFoundError>;
  readonly deductCreditAtomic: (merchantId: string, requiredKobo: number) => Effect.Effect<{ readonly newBalanceKobo: number }, InsufficientWalletCreditError>;
}

export const WalletLedgerService = Context.GenericTag<WalletLedgerService>("@swiftshelf/WalletLedgerService");

type DeductOutcome =
  | { readonly _tag: "DEDUCTED"; readonly newBalanceKobo: number }
  | { readonly _tag: "SHORTFALL"; readonly availableKobo: number; readonly shortKobo: number; readonly merchantEmail: string };

export const WalletLedgerLive = Layer.effect(
  WalletLedgerService,
  Effect.gen(function* () {
    const eventBus = yield* EventBusService;
    const storeRef = yield* SynchronizedRef.make<Map<string, WalletLedger>>(new Map());

    return WalletLedgerService.of({
      getLedger: (merchantId) => SynchronizedRef.get(storeRef).pipe(Effect.map((map) => Option.fromNullable(map.get(merchantId)))),
      provisionWallet: (merchantId, email) =>
        SynchronizedRef.updateAndGet(storeRef, (map) => {
          const newMap = new Map(map);
          if (!newMap.has(merchantId)) newMap.set(merchantId, { merchantId, merchantEmail: email, balanceKobo: 250000, processedReferences: new Set() });
          return newMap;
        }).pipe(
          Effect.map((map) => map.get(merchantId)!),
          Effect.tap((ledger) => eventBus.publish({ type: "WALLET_PROVISIONED", merchantId: ledger.merchantId, merchantEmail: ledger.merchantEmail, initialBalanceKobo: ledger.balanceKobo }))
        ),
      initializeTopup: (merchantId, amountNgn, refOverride) =>
        Effect.gen(function* () {
          const amountKobo = Math.round(amountNgn * 100);
          const reference = refOverride ?? `SWIFT-${merchantId.slice(0, 4)}-${Date.now()}`;
          const store = yield* SynchronizedRef.get(storeRef);
          const email = store.get(merchantId)?.merchantEmail ?? `merchant-${merchantId}@swiftshelf.dev`;
          const checkout = yield* initializePaystackCheckout({ email, amountKobo, reference, merchantId });
          yield* eventBus.publish({ type: "TOPUP_INITIATED", merchantId, reference: checkout.reference, amountKobo, checkoutUrl: checkout.authorizationUrl });
          return { reference: checkout.reference, checkoutUrl: checkout.authorizationUrl, amountKobo }
        }),
      creditTopup: (merchantId, reference, amountKobo) =>
        SynchronizedRef.modifyEffect(storeRef, (map) =>
          Effect.gen(function* () {
            const ledger = map.get(merchantId);
            if (!ledger) {
              return [yield* Effect.fail(new MerchantNotFoundError({ merchantId })), map] as const;
            }
            if (ledger.processedReferences.has(reference)) {
              return [yield* Effect.fail(new DuplicateTransactionReferenceError({ reference })), map] as const;
            }
            const newBalanceKobo = ledger.balanceKobo + amountKobo;
            const newMap = new Map(map);
            newMap.set(merchantId, { ...ledger, balanceKobo: newBalanceKobo, processedReferences: new Set([...ledger.processedReferences, reference]) });
            return [{ newBalanceKobo }, newMap] as const;
          })
        ),
      deductCreditAtomic: (merchantId, requiredKobo) =>
        Effect.gen(function* () {
          const outcome = yield* SynchronizedRef.modify(storeRef, (map): readonly [DeductOutcome, Map<string, WalletLedger>] => {
            const ledger = map.get(merchantId);
            const availableKobo = ledger ? ledger.balanceKobo : 0;
            if (availableKobo >= requiredKobo) {
              const newBalanceKobo = availableKobo - requiredKobo;
              const newMap = new Map(map);
              newMap.set(merchantId, { ...ledger!, balanceKobo: newBalanceKobo });
              return [{ _tag: "DEDUCTED" as const, newBalanceKobo }, newMap] as const;
            }
            const shortKobo = requiredKobo - availableKobo;
            const merchantEmail = ledger?.merchantEmail ?? `merchant-${merchantId}@swiftshelf.dev`;
            return [{ _tag: "SHORTFALL" as const, availableKobo, shortKobo, merchantEmail }, map] as const;
          });

          if (outcome._tag === "DEDUCTED") {
            return { newBalanceKobo: outcome.newBalanceKobo };
          }

          // Real top-up session for exactly the shortfall; degrade gracefully if the gateway is down.
          const reference = `SWIFT-SHORT-${merchantId.slice(0, 4)}-${Date.now()}`;
          const checkout = yield* Effect.option(
            initializePaystackCheckout({
              email: outcome.merchantEmail,
              amountKobo: outcome.shortKobo,
              reference,
              merchantId,
            })
          );
          yield* eventBus.publish({
            type: "SHORTFALL_DETECTED",
            merchantId,
            requiredKobo,
            availableKobo: outcome.availableKobo,
            shortKobo: outcome.shortKobo,
            checkoutUrl: Option.isSome(checkout) ? checkout.value.authorizationUrl : undefined
          });
          return yield* Effect.fail(new InsufficientWalletCreditError({ merchantId, requiredKobo, availableKobo: outcome.availableKobo, shortKobo: outcome.shortKobo, checkoutUrl: Option.isSome(checkout) ? checkout.value.authorizationUrl : undefined }));
        }),
    });
  })
);