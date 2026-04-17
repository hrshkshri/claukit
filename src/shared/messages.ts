/**
 * Discriminated union for all postMessage events emitted by bridge.ts
 * and consumed by bridge-client.ts.
 */

export interface ConversationPayload {
  orgId: string;
  conversationId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

export interface MessageLimit {
  windows: Record<string, {
    utilization: number;
    resets_at?: number;
  }>;
}

/** Events pushed from page-context → content-script */
export type BridgeEvent =
  | { type: 'cc:generation_start'; payload: Record<never, never> }
  | { type: 'cc:conversation';     payload: ConversationPayload }
  | { type: 'cc:message_limit';    payload: MessageLimit };

/** Requests sent from content-script → page-context */
export type BridgeRequest =
  | { kind: 'hash';         payload: { text: string } }
  | { kind: 'usage';        payload: { orgId: string } }
  | { kind: 'conversation'; payload: { orgId: string; conversationId: string } };

/** The wire format posted via window.postMessage for requests */
export type BridgeRequestMessage = BridgeRequest & {
  cc: 'ClaudeCounter';
  type: 'cc:request';
  requestId: string;
};

/** The wire format posted via window.postMessage for responses */
export interface BridgeResponseMessage {
  cc: 'ClaudeCounter';
  type: 'cc:response';
  requestId: string;
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  error: string | null;
}

/** A message event coming in from the bridge — either a response or a pushed event */
export type IncomingBridgeMessage = BridgeResponseMessage | (BridgeEvent & { cc: 'ClaudeCounter' });
