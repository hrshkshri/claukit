import type { BridgeClient } from '../bridge/client';
import type { ConversationData, ConversationMetrics, ContentItem, Attachment } from '../shared/api';
import { CONST } from '../shared/constants';

// ── Tokenizer access ──────────────────────────────────────────────────────

function getTokenizer(): { countTokens(text: string): number } | null {
  return typeof GPTTokenizer_o200k_base !== 'undefined' ? GPTTokenizer_o200k_base : null;
}

function countTokens(text: string): number {
  if (!text) return 0;
  const tokenizer = getTokenizer();
  if (!tokenizer) return 0;
  try {
    return tokenizer.countTokens(text);
  } catch {
    return 0;
  }
}

// ── Stable JSON stringification ───────────────────────────────────────────

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    seen.add(v);

    if (Array.isArray(v)) return v.map(normalize);

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as object).sort()) {
      out[key] = normalize((v as Record<string, unknown>)[key]);
    }
    return out;
  };

  try {
    return JSON.stringify(normalize(value)) ?? '';
  } catch {
    return '';
  }
}

// ── Conversation trunk extraction ─────────────────────────────────────────

const ROOT_MESSAGE_ID = '00000000-0000-4000-8000-000000000000';

function buildTrunk(conversation: ConversationData): ConversationData['chat_messages'] {
  const messages = Array.isArray(conversation.chat_messages) ? conversation.chat_messages : [];
  const byId     = new Map(messages.filter((m) => m.uuid).map((m) => [m.uuid, m]));

  const leaf = conversation.current_leaf_message_uuid;
  if (!leaf) return [];

  const trunk: ConversationData['chat_messages'] = [];
  let currentId: string | null = leaf;

  while (currentId && currentId !== ROOT_MESSAGE_ID) {
    const msg = byId.get(currentId);
    if (!msg) break;
    trunk.push(msg);
    currentId = msg.parent_message_uuid;
  }

  return trunk.reverse();
}

// ── Content stringification ───────────────────────────────────────────────

function isCountableContentItem(item: unknown): item is ContentItem {
  if (!item || typeof item !== 'object') return false;
  const it = item as ContentItem;
  if (typeof it.type !== 'string') return false;
  if (it.type === 'thinking' || it.type === 'redacted_thinking') return false;
  if (it.type === 'image'    || it.type === 'document')          return false;
  return true;
}

function stringifyCountableContentItem(item: ContentItem): string {
  if (!isCountableContentItem(item)) return '';

  if (item.type === 'text' && typeof item.text === 'string') return item.text;

  if (item.type === 'tool_use') {
    return stableStringify({ id: item.id, name: item.name, input: item.input });
  }

  if (item.type === 'tool_result') {
    return stableStringify({ tool_use_id: item.tool_use_id, is_error: item.is_error, content: item.content });
  }

  // Fallback: collect known textual fields only
  const minimal: Record<string, unknown> = {};
  if (typeof item.text    === 'string') minimal['text']    = item.text;
  if (typeof item.title   === 'string') minimal['title']   = item.title;
  if (typeof item.url     === 'string') minimal['url']     = item.url;
  if (typeof item.content === 'string') minimal['content'] = item.content;
  if (Array.isArray(item.content))      minimal['content'] = item.content;
  return Object.keys(minimal).length === 0 ? '' : stableStringify(minimal);
}

function stringifyMessageCountables(message: ConversationData['chat_messages'][number]): string {
  const parts: string[] = [];

  const content: ContentItem[] = Array.isArray(message.content) ? message.content : [];
  for (const item of content) {
    const s = stringifyCountableContentItem(item);
    if (s) parts.push(s);
  }

  const attachments: Attachment[] = Array.isArray(message.attachments) ? message.attachments : [];
  for (const a of attachments) {
    if (typeof a.extracted_content === 'string' && a.extracted_content) {
      parts.push(a.extracted_content);
    }
  }

  return parts.join('\n');
}

// ── Hashing / fingerprinting ──────────────────────────────────────────────

async function hashString(bridge: BridgeClient, str: string): Promise<string | null> {
  try {
    const res = await bridge.requestHash(str);
    return res?.hash ?? null;
  } catch {
    return null;
  }
}

async function fingerprint(bridge: BridgeClient, text: string): Promise<string | null> {
  if (!text) return null;
  const hash = await hashString(bridge, text);
  return hash ? `${text.length}:${hash}` : null;
}

// ── TokenCache ────────────────────────────────────────────────────────────

interface CacheEntry { fp: string; tokens: number }

export class TokenCache {
  private readonly _byMessageId = new Map<string, CacheEntry>();

  async getMessageTokens(bridge: BridgeClient, messageId: string, messageText: string): Promise<number> {
    const fp = await fingerprint(bridge, messageText);
    if (!fp) return countTokens(messageText);

    const cached = this._byMessageId.get(messageId);
    if (cached && cached.fp === fp) return cached.tokens;

    const tokens = countTokens(messageText);
    this._byMessageId.set(messageId, { fp, tokens });
    return tokens;
  }

  pruneToMessageIds(keepIds: string[]): void {
    const keep = new Set(keepIds);
    for (const id of this._byMessageId.keys()) {
      if (!keep.has(id)) this._byMessageId.delete(id);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────

const tokenCache = new TokenCache();

export async function computeConversationMetrics(
  bridge: BridgeClient,
  conversation: ConversationData,
): Promise<ConversationMetrics> {
  const trunk    = buildTrunk(conversation);
  const trunkIds = trunk.map((m) => m.uuid).filter(Boolean) as string[];
  tokenCache.pruneToMessageIds(trunkIds);

  let totalTokens     = 0;
  let lastAssistantMs: number | null = null;

  for (const msg of trunk) {
    if (msg.sender === 'assistant' && msg.created_at) {
      const msgMs = Date.parse(msg.created_at);
      if (!lastAssistantMs || msgMs > lastAssistantMs) lastAssistantMs = msgMs;
    }

    const msgText   = stringifyMessageCountables(msg);
    const msgTokens = msg.uuid
      ? await tokenCache.getMessageTokens(bridge, msg.uuid, msgText)
      : countTokens(msgText);
    totalTokens += msgTokens;
  }

  const cachedUntil = lastAssistantMs ? lastAssistantMs + CONST.CACHE_WINDOW_MS : null;

  return { trunkMessageCount: trunk.length, totalTokens, lastAssistantMs, cachedUntil };
}
