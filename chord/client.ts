import { CHORD_CONFIG } from "./config";
import type { ChordTurnRequest, ChordTurnResponse } from "./types";

export class ChordApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = "ChordApiError";
  }
}

export class ChordClient {
  private getHeaders() {
    return {
      "Authorization": `Bearer ${CHORD_CONFIG.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async sendTurn(request: ChordTurnRequest): Promise<ChordTurnResponse> {
    const url = `${CHORD_CONFIG.baseUrl}/v1/teammates/${CHORD_CONFIG.teammateId}/turns`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (response.status === 401) {
      throw new ChordApiError("Unauthorized: Invalid or expired API key", 401, url);
    }

    if (!response.ok) {
      throw new ChordApiError(
        `Chord API error: ${response.statusText}`,
        response.status,
        url
      );
    }
    try {
      return (await response.json()) as ChordTurnResponse;
    } catch {
      throw new ChordApiError("Invalid JSON in Chord response", response.status, url);
    }
  }

  async *streamTurn(request: ChordTurnRequest): AsyncGenerator<string, void, unknown> {
    const url = `${CHORD_CONFIG.baseUrl}/v1/teammates/${CHORD_CONFIG.teammateId}/turns/stream`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (response.status === 401) {
      throw new ChordApiError("Unauthorized: Invalid or expired API key", 401, url);
    }

    if (!response.ok) {
      throw new ChordApiError(
        `Chord API error: ${response.statusText}`,
        response.status,
        url
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              yield parsed.content;
            }
          } catch {
            // Skip invalid JSON
            console.warn("Unparseable stream line:", data);
          }
        }
      }
    }
  }
}
