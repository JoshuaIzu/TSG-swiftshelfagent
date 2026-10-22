import { Data } from "effect";

export interface WalletLedger {
  readonly merchantId: string;
  readonly merchantEmail: string;
  readonly balanceKobo: number;
  readonly processedReferences: ReadonlySet<string>;
}

export type WalletEvent =
  | { readonly type: "WALLET_PROVISIONED"; readonly merchantId: string; readonly merchantEmail: string; readonly initialBalanceKobo: number; }
  | { readonly type: "SHORTFALL_DETECTED"; readonly merchantId: string; readonly requiredKobo: number; readonly availableKobo: number; readonly shortKobo: number; readonly checkoutUrl?: string; }
  | { readonly type: "TOPUP_INITIATED"; readonly merchantId: string; readonly reference: string; readonly amountKobo: number; readonly checkoutUrl: string; }
  | { readonly type: "TOPUP_CONFIRMED"; readonly merchantId: string; readonly reference: string; readonly amountKobo: number; readonly newBalanceKobo: number; };

export class InsufficientWalletCreditError extends Data.TaggedError("InsufficientWalletCredit")<{ readonly merchantId: string; readonly requiredKobo: number; readonly availableKobo: number; readonly shortKobo: number; readonly checkoutUrl?: string; }> {}
export class PaymentGatewayError extends Data.TaggedError("PaymentGateway")<{ readonly endpoint: string; readonly statusCode: number; readonly message: string; }> {}
export class DuplicateTransactionReferenceError extends Data.TaggedError("DuplicateTransactionReference")<{ readonly reference: string; }> {}
export class MerchantNotFoundError extends Data.TaggedError("MerchantNotFound")<{ readonly merchantId: string }> {}