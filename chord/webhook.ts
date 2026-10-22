import express from "express";
import crypto from "crypto";
import { CHORD_CONFIG } from "./config";
import { ChordClient, ChordApiError } from "./client";
import { SWIFTSHELF_TOOL_MANIFEST } from "./manifest";
import type { ChordWebhookPayload, ChordTurnResponse, ChordTurnRequest } from "./types";
import { executeToolCalls } from "./router";
import { registerMerchantThread } from "../presentation/MerchantThreadRegistry";

export function createChordWebhookHandler() {
  const raw = express.raw({ type: "application/json" });

  return (req: express.Request, res: express.Response) => {
    raw(req, res, () => {
      handleChordWebhook(req, res).catch((error) => {
        console.error("Chord webhook error:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      });
    });
  };
}

async function handleChordWebhook(req: express.Request, res: express.Response) {
  const signature = req.headers["x-chord-signature"] as string;

  if (!signature) {
    res.status(401).json({ error: "Missing Chord signature" });
    return;
  }

  const hmac = crypto.createHmac("sha256", CHORD_CONFIG.webhookSecret);
  hmac.update(req.body as Buffer);
  const expectedSignature = hmac.digest("hex");

  if (signature !== expectedSignature) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const payload = JSON.parse(req.body.toString()) as ChordWebhookPayload;

  if (payload.event !== "turn.created") {
    res.status(200).json({ received: true });
    return;
  }

  const { thread_id, turn_id, tool_calls, session_id } = payload.data;

  // Bind merchants in this turn's tool calls to the chat thread,
  // so EventBus-driven WhatsApp replies can find their way back.
  for (const tc of tool_calls ?? []) {
    const merchantId = tc.parameters?.merchant_id;
    if (typeof merchantId === "string") {
      registerMerchantThread(merchantId, { threadId: thread_id, sessionId: session_id });
    }
  }

  const toolResults =
    tool_calls && tool_calls.length > 0 ? await executeToolCalls(tool_calls) : undefined;

  const response: ChordTurnResponse = {
    message: toolResults
      ? formatToolResultsResponse(toolResults)
      : "I received your message. How can I help you with SwiftShelf fulfillment?",
    tool_results: toolResults,
    session_id: session_id || thread_id,
  };

  try {
    const client = new ChordClient();
    const turnRequest: ChordTurnRequest = {
      thread_id,
      session_id: session_id || thread_id,
      message: response.message,
      tool_results: response.tool_results,
      tools: SWIFTSHELF_TOOL_MANIFEST,
    };
    await client.sendTurn(turnRequest);
  } catch (e) {
    if (e instanceof ChordApiError) {
      console.error(`Chord API error: ${e.statusCode} at ${e.endpoint}`);
    } else {
      console.error("Failed to send response to Chord:", e);
    }
  }

  res.status(200).json({ received: true, turn_id });
}

function formatToolResultsResponse(results: any[]): string {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  let message = "";

  if (successful.length > 0) {
    message += "I've completed the following actions:\n";
    successful.forEach(r => {
      if (r.result?.status === "BOOKED") {
        message += `- Dispatch booked: ${r.result.dispatchId}\n`;
      } else if (r.result?.status === "SUCCESS") {
        message += `- Operation completed successfully\n`;
      } else if (r.result?.checkoutUrl) {
        message += `- Payment link generated: ${r.result.checkoutUrl}\n`;
      }
    });
  }

  if (failed.length > 0) {
    message += "\nSome actions failed:\n";
    failed.forEach(r => {
      message += `- Error: ${r.error}\n`;
    });
  }

  return message.trim();
}