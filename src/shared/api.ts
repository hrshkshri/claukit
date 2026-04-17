/** Shape of a single usage window returned by /api/organizations/{orgId}/usage */
export interface UsageWindow {
  /** 0–100 percentage utilization */
  utilization: number;
  /** ISO-8601 timestamp or null if not provided */
  resets_at: string | null;
  /** Window duration in hours (5 for five_hour, 168 for seven_day) */
  window_hours: number;
}

/** Normalised usage extracted from either the REST endpoint or the SSE stream */
export interface NormalizedUsage {
  five_hour: UsageWindow | null;
  seven_day:  UsageWindow | null;
}

/** Shape of items inside a chat conversation's chat_messages array */
export interface ChatMessage {
  uuid: string;
  parent_message_uuid: string | null;
  sender: 'human' | 'assistant';
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: ContentItem[];
  attachments?: Attachment[];
}

export interface ContentItem {
  type: string;
  text?: string;
  title?: string;
  url?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: string | ContentItem[];
  id?: string;
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input?: Record<string, any>;
  tool_use_id?: string;
  is_error?: boolean;
}

export interface Attachment {
  extracted_content?: string;
}

/** Raw conversation data shape from the API */
export interface ConversationData {
  chat_messages: ChatMessage[];
  current_leaf_message_uuid: string | null;
}

/** Shape of a raw message_limit event payload from the SSE stream */
export interface RawMessageLimitWindow {
  utilization: number;
  resets_at?: number;
}

export interface RawMessageLimit {
  windows: Record<string, RawMessageLimitWindow>;
}

/** Computed output of token + cache analysis */
export interface ConversationMetrics {
  trunkMessageCount: number;
  totalTokens: number;
  lastAssistantMs: number | null;
  cachedUntil: number | null;
}
