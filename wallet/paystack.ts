import { Effect } from "effect";
import { PaymentGatewayError } from "./types";

export interface PaystackCheckout {
  readonly reference: string;
  readonly authorizationUrl: string;
}

interface InitializeResponse {
  readonly status: boolean;
  readonly message?: string;
  readonly data?: { readonly reference: string; readonly authorization_url: string };
}

export const initializePaystackCheckout = (params: {
  readonly email: string;
  readonly amountKobo: number;
  readonly reference: string;
  readonly merchantId: string;
}): Effect.Effect<PaystackCheckout, PaymentGatewayError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? "sk_test_secret"}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: params.email,
          amount: params.amountKobo,
          reference: params.reference,
          metadata: { merchantId: params.merchantId },
        }),
      });
      const json = (await response.json()) as InitializeResponse;
      if (!response.ok || !json.status || !json.data) {
        throw new Error(`Paystack initialize failed (HTTP ${response.status}): ${json.message ?? response.statusText}`);
      }
      return { reference: json.data.reference, authorizationUrl: json.data.authorization_url };
    },
    catch: (cause) =>
      new PaymentGatewayError({
        endpoint: "https://api.paystack.co/transaction/initialize",
        statusCode: 502,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });