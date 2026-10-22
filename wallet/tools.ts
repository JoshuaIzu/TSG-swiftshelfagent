import { Effect, Option } from "effect";
import { WalletLedgerService } from "./ledger";

export const tool_check_or_create_wallet = (merchantId: string, email: string) =>
  Effect.gen(function* () {
    const ledgerService = yield* WalletLedgerService;
    const existing = yield* ledgerService.getLedger(merchantId);

    if (Option.isSome(existing)) {
      return { status: "EXISTS" as const, wallet: existing.value, balanceNgn: existing.value.balanceKobo / 100 };
    }

    const created = yield* ledgerService.provisionWallet(merchantId, email);
    return { status: "CREATED" as const, wallet: created, balanceNgn: created.balanceKobo / 100 };
  });

export const tool_initialize_wallet_topup = (merchantId: string, amountNgn: number, reference?: string) =>
  Effect.gen(function* () {
    const ledgerService = yield* WalletLedgerService;
    const topupInfo = yield* ledgerService.initializeTopup(merchantId, amountNgn, reference);
    return { status: "INITIALIZED" as const, merchantId, reference: topupInfo.reference, checkoutUrl: topupInfo.checkoutUrl, amountNgn };
  });