import { Match } from "effect";
import type { DomainEvent } from "../core/events";

export const renderWhatsAppMessage = (event: DomainEvent): string => {
  return Match.value(event).pipe(
    Match.when({ type: "WALLET_PROVISIONED" }, (e) => ` *Prepaid Dispatch Wallet Activated*\nMerchant: ${e.merchantId}\nInitial Balance: ₦${(e.initialBalanceKobo / 100).toLocaleString()}`),
    Match.when({ type: "SHORTFALL_DETECTED" }, (e) => `️ *Insufficient Wallet Balance*\nRequired: ₦${(e.requiredKobo / 100).toLocaleString()}\nAvailable: ₦${(e.availableKobo / 100).toLocaleString()}\nShortfall: ₦${(e.shortKobo / 100).toLocaleString()}\n\n *Top Up Link*: ${e.checkoutUrl ?? "Use initialize_wallet_topup"}`),
    Match.when({ type: "TOPUP_INITIATED" }, (e) => ` *Payment Checkout Link Generated*\nReference: \`${e.reference}\`\nAmount: ₦${(e.amountKobo / 100).toLocaleString()}\nCheckout URL: ${e.checkoutUrl}`),
    Match.when({ type: "TOPUP_CONFIRMED" }, (e) => ` *Payment Confirmed*\nCredited: ₦${(e.amountKobo / 100).toLocaleString()}\nNew Wallet Balance: ₦${(e.newBalanceKobo / 100).toLocaleString()}`),
    Match.when({ type: "DISPATCH_BOOKED" }, (e) => ` *Dispatch Order Confirmed*\nDispatch ID: \`${e.dispatchId}\`\nDestination Zone: ${e.zone}\nTotal Fee: ₦${(e.totalFeeKobo / 100).toLocaleString()}`),
    Match.when({ type: "INVENTORY_AUDITED" }, (e) => ` *Stock Audit Completed*\nMerchant: ${e.merchantId} | SKUs Audited: ${e.skuCount}`),
    Match.exhaustive
  );
};