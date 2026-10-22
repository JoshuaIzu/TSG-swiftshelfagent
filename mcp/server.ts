import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Cause, Effect, Exit, Option } from "effect";
import type { Request, Response } from "express";
import { appRuntime } from "../core/runtime";
import { tool_get_inventory_summary } from "../inventory/tools";
import { tool_get_zone_conditions } from "../logistics/tools";
import { tool_check_or_create_wallet, tool_initialize_wallet_topup } from "../wallet/tools";
import { tool_book_dispatch } from "../dispatch/tools";
import type { LagosZone } from "../logistics/types";

const describeError = (e: unknown): string => {
  if (e && typeof e === "object" && "_tag" in e) {
    const tagged = e as { _tag: string; message?: string } & Record<string, unknown>;
    const { _tag, message, ...fields } = tagged;
    return `${_tag}: ${message ?? ""} ${JSON.stringify(fields)}`.trim();
  }
  return e instanceof Error ? e.message : String(e);
};

const formatCause = (cause: Cause.Cause<unknown>): string => {
  const fail = Cause.failureOption(cause);
  if (Option.isSome(fail)) return describeError(fail.value);
  const die = Cause.dieOption(cause);
  if (Option.isSome(die)) return describeError(die.value);
  return Cause.pretty(cause);
};

const execute = async (effect: Effect.Effect<unknown, unknown, never | import("../core/EventBus").EventBusService | import("../wallet/ledger").WalletLedgerService | import("../logistics/pricing").PricingStrategy | import("../inventory/strategy").InventoryReportStrategy>) => {
  const exit = await appRuntime.runPromise(Effect.exit(effect));
  if (Exit.isSuccess(exit)) {
    return { content: [{ type: "text" as const, text: JSON.stringify(exit.value) }] };
  }
  return { content: [{ type: "text" as const, text: formatCause(exit.cause) }], isError: true };
};

const buildServer = (): McpServer => {
  const server = new McpServer({ name: "swiftshelf-tools", version: "1.0.0" });

  server.registerTool(
    "get_inventory_summary",
    { description: "Audit current SKU stock levels for a merchant.", inputSchema: { merchant_id: z.string(), version: z.union([z.literal(1), z.literal(2)]).optional() } },
    async (args: { merchant_id: string; version?: 1 | 2 }) => execute(tool_get_inventory_summary(args.merchant_id, args.version ?? 1))
  );

  server.registerTool(
    "get_zone_conditions",
    { description: "Fetch delivery zone disruption advisories and surcharges for Ikeja, Yaba, or Lekki.", inputSchema: { zone: z.enum(["Ikeja", "Yaba", "Lekki"]) } },
    async (args: { zone: string }) => execute(tool_get_zone_conditions(args.zone))
  );

  server.registerTool(
    "check_or_create_wallet",
    { description: "Check the merchant's prepaid dispatch wallet balance, or provision a new ledger.", inputSchema: { merchant_id: z.string(), email: z.string() } },
    async (args: { merchant_id: string; email: string }) => execute(tool_check_or_create_wallet(args.merchant_id, args.email))
  );

  server.registerTool(
    "initialize_wallet_topup",
    { description: "Generate a real Paystack checkout link to top up the merchant's dispatch wallet.", inputSchema: { merchant_id: z.string(), amount_ngn: z.number(), reference: z.string().optional() } },
    async (args: { merchant_id: string; amount_ngn: number; reference?: string }) => execute(tool_initialize_wallet_topup(args.merchant_id, args.amount_ngn, args.reference))
  );

  server.registerTool(
    "book_dispatch",
    { description: "Book a dispatch and deduct the fee from the prepaid wallet. Fails with InsufficientWalletCredit if the balance is short.", inputSchema: { merchant_id: z.string(), sku: z.string(), qty: z.number(), zone: z.enum(["Ikeja", "Yaba", "Lekki"]), accept_advisory: z.boolean() } },
    async (args: { merchant_id: string; sku: string; qty: number; zone: LagosZone; accept_advisory: boolean }) => execute(tool_book_dispatch(args.merchant_id, args.sku, args.qty, args.zone, args.accept_advisory))
  );

  return server;
};

const transports = new Map<string, StreamableHTTPServerTransport>();

export const createMcpRequestHandler = () => async (req: Request, res: Response) => {
  const expected = `Bearer ${process.env.MCP_AUTH_TOKEN}`;
  if (req.headers.authorization !== expected) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid bearer token" }, id: null });
    return;
  }

  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      const server = buildServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
        }
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP transport error:", e);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
};

export const createMcpGetHandler = () => async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or unknown session for GET /mcp");
    return;
  }
  await transport.handleRequest(req, res);
};

export const createMcpDeleteHandler = () => async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Missing or unknown session for DELETE /mcp");
    return;
  }
  await transport.handleRequest(req, res);
};
