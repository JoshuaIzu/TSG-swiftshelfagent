export const CHORD_CONFIG = {
  baseUrl: process.env.CHORD_BASE_URL || "https://api.chordhq.xyz",
  apiKey: process.env.CHORD_API_KEY || "",
  teammateId: process.env.CHORD_TEAMMATE_ID || "",
  webhookSecret: process.env.CHORD_WEBHOOK_SECRET || "",
} as const;

export function validateConfig() {
  if (!CHORD_CONFIG.apiKey) {
    throw new Error("CHORD_API_KEY environment variable is required");
  }
  if (!CHORD_CONFIG.teammateId) {
    throw new Error("CHORD_TEAMMATE_ID environment variable is required");
  }
  if (!CHORD_CONFIG.webhookSecret) {
    throw new Error("CHORD_WEBHOOK_SECRET environment variable is required");
  }
}