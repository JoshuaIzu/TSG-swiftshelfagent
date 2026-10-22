import { appRuntime as toolRuntime } from "../core/runtime";
import { tool_get_inventory_summary } from "../inventory/tools";
import { tool_get_zone_conditions } from "../logistics/tools";
import { tool_check_or_create_wallet, tool_initialize_wallet_topup } from "../wallet/tools";
import { tool_book_dispatch } from "../dispatch/tools";
import type { ChordToolCall, ChordToolResult } from "./types";
import type { LagosZone } from "../logistics/types";

export async function executeToolCall(toolCall: ChordToolCall): Promise<ChordToolResult> {
  const { id, name, parameters } = toolCall;

  try {
    let result: unknown;

    switch (name) {
      case "get_inventory_summary": {
        const { merchant_id, version } = parameters as { merchant_id: string; version?: 1 | 2 };
        const effect = tool_get_inventory_summary(merchant_id, version ?? 1);
        result = await toolRuntime.runPromise(effect);
        break;
      }

      case "get_zone_conditions": {
        const { zone } = parameters as { zone: string };
        const effect = tool_get_zone_conditions(zone);
        result = await toolRuntime.runPromise(effect);
        break;
      }

      case "check_or_create_wallet": {
        const { merchant_id, email } = parameters as { merchant_id: string; email: string };
        const effect = tool_check_or_create_wallet(merchant_id, email);
        result = await toolRuntime.runPromise(effect);
        break;
      }

      case "initialize_wallet_topup": {
        const { merchant_id, amount_ngn, reference } = parameters as {
          merchant_id: string;
          amount_ngn: number;
          reference?: string;
        };
        const effect = tool_initialize_wallet_topup(merchant_id, amount_ngn, reference);
        result = await toolRuntime.runPromise(effect);
        break;
      }

      case "book_dispatch": {
        const { merchant_id, sku, qty, zone, accept_advisory } = parameters as {
          merchant_id: string;
          sku: string;
          qty: number;
          zone: LagosZone;
          accept_advisory: boolean;
        };
        const effect = tool_book_dispatch(merchant_id, sku, qty, zone, accept_advisory);
        result = await toolRuntime.runPromise(effect);
        break;
      }

      default:
        return {
          tool_call_id: id,
          result: null,
          error: `Unknown tool: ${name}`,
        };
    }

    return {
      tool_call_id: id,
      result,
    };
  } catch (error) {
    return {
      tool_call_id: id,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeToolCalls(toolCalls: ChordToolCall[]): Promise<ChordToolResult[]> {
  return Promise.all(toolCalls.map(executeToolCall));
}