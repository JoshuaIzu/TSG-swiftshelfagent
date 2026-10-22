import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { Effect } from "effect";

// Layer Dependencies
import { EventBusService } from "./core/EventBus";
import { WalletLedgerService } from "./wallet/ledger";
import { appRuntime as runtime } from "./core/runtime";
import { validateConfig } from "./chord/config";
import { createChordWebhookHandler } from "./chord/webhook";
import { createMcpRequestHandler, createMcpGetHandler, createMcpDeleteHandler } from "./mcp/server";

// Validate Chord configuration
validateConfig();

const app = express();
const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "sk_test_secret";

//Paystack Webhook
app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-paystack-signature"] as string;

  if (!signature) {
    return res.status(401).send("Missing Paystack signature");
  }

  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(req.body).digest("hex");

  if (hash !== signature) {
    return res.status(401).send("Invalid signature");
  }

  res.sendStatus(200);

  const eventData = JSON.parse(req.body.toString());

  if (eventData.event === "charge.success") {
    const { reference, amount, metadata } = eventData.data;
    const merchantId = metadata?.merchantId || "UNKNOWN_MERCHANT";
    console.log(`[Webhook] Payment confirmed for reference: ${reference}`);

    await runtime.runPromise(
      Effect.gen(function* () {
        const ledger = yield* WalletLedgerService;
        const eventBus = yield* EventBusService;
        const balance = yield* ledger.creditTopup(merchantId, reference, amount);
        yield* eventBus.publish({
          type: "TOPUP_CONFIRMED",
          merchantId,
          reference,
          amountKobo: amount,
          newBalanceKobo: balance.newBalanceKobo
        });
      }).pipe(
        Effect.catchTags({
          DuplicateTransactionReference: () => Effect.logInfo(`[Webhook] Duplicate charge.success ignored for ${reference}`),
          MerchantNotFound: () => Effect.logWarning(`[Webhook] No wallet found for merchant ${merchantId}`),
        })
      )
    );
  }
});

// Chord Webhook
app.post("/api/chord/webhook", createChordWebhookHandler());

// MCP server endpoint — Chord connects here as an MCP client (Streamable HTTP)
app.post("/mcp", express.json({ type: "application/json" }), createMcpRequestHandler());
app.get("/mcp", createMcpGetHandler());
app.delete("/mcp", createMcpDeleteHandler());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(` SwiftShelf Webhook Server & Effect Runtime listening on port ${PORT}`);
});
