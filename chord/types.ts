import type { ChordToolDefinition } from "./manifest";
export interface ChordTurnRequest {
  readonly thread_id: string;
  readonly session_id?: string;
  readonly message: string;
  readonly tools?: readonly ChordToolDefinition[];
  readonly tool_calls?: ChordToolCall[];
  readonly tool_results?: ChordToolResult[];
  readonly context?: Record<string, unknown>;
}

export interface ChordToolCall {
  readonly id: string;
  readonly name: string;
  readonly parameters: Record<string, unknown>;
}

export interface ChordTurnResponse {
  readonly message: string;
  readonly tool_results?: ChordToolResult[];
  readonly requires_handoff?: boolean;
  readonly session_id?: string;
}

export interface ChordToolResult {
  readonly tool_call_id: string;
  readonly result: unknown;
  readonly error?: string;
}

export interface ChordWebhookPayload {
  readonly event: "turn.created" | "thread.updated" | string;
  readonly data: {
    readonly thread_id: string;
    readonly turn_id: string;
    readonly message: string;
    readonly tool_calls?: ChordToolCall[];
    readonly session_id?: string;
  };
  readonly timestamp: string;
  readonly signature: string;
}
