export interface ChordToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export const SWIFTSHELF_TOOL_MANIFEST: readonly ChordToolDefinition[] = [
  { name: "get_inventory_summary", description: "Audit current SKU stock levels.", parameters: { type: "object", properties: { merchant_id: { type: "string" }, version: { type: "number", enum: [1, 2] } }, required: ["merchant_id", "version"] } },
  { name: "get_zone_conditions", description: "Fetch pre-computed delivery zone disruption advisories.", parameters: { type: "object", properties: { zone: { type: "string", enum: ["Ikeja", "Yaba", "Lekki"] } }, required: ["zone"] } },
  { name: "check_or_create_wallet", description: "Check prepaid wallet balance or provision new ledger.", parameters: { type: "object", properties: { merchant_id: { type: "string" }, email: { type: "string" } }, required: ["merchant_id", "email"] } },
  { name: "initialize_wallet_topup", description: "Generate Paystack checkout URL.", parameters: { type: "object", properties: { merchant_id: { type: "string" }, amount_ngn: { type: "number" }, reference: { type: "string" } }, required: ["merchant_id", "amount_ngn"] } },
  { name: "book_dispatch", description: "Book order dispatch and deduct balance.", parameters: { type: "object", properties: { merchant_id: { type: "string" }, sku: { type: "string" }, qty: { type: "number" }, zone: { type: "string", enum: ["Ikeja", "Yaba", "Lekki"] }, accept_advisory: { type: "boolean" } }, required: ["merchant_id", "sku", "qty", "zone", "accept_advisory"] } }
];