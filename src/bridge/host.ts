/**
 * bridge.ts — injected into the page context (NOT the content-script sandbox).
 * Runs with full access to the page's `window.fetch` and history APIs.
 * Communicates with the content script via postMessage.
 *
 * Built as a separate esbuild bundle: src/injected/bridge.ts → dist/bridge.js
 */

import type { BridgeEvent, BridgeRequest } from '../shared/messages';

const CC_MARKER = 'ClaudeCounter';

// ── Capture originals before any framework can wrap them ──────────────────

const originalFetch = window.fetch.bind(window);

const originalPushState    = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (...args: Parameters<typeof history.pushState>) {
  const result = originalPushState(...args);
  window.dispatchEvent(new CustomEvent('cc:urlchange'));
  return result;
};

history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
  const result = originalReplaceState(...args);
  window.dispatchEvent(new CustomEvent('cc:urlchange'));
  return result;
};

// ── Fetch interceptor ─────────────────────────────────────────────────────

window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const url  = toAbsoluteUrl(args[0]);
  const opts = (args[1] ?? {}) as RequestInit;

  if (url && opts.method === 'POST' && (url.includes('/completion') || url.includes('/retry_completion'))) {
    post('cc:generation_start', {});
  }

  const response = await originalFetch(...args);

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('event-stream')) {
    void handleEventStream(response);
  }

  if (url && url.includes('/chat_conversations/') && url.includes('tree=')) {
    const meta = getConversationMeta(url);
    if (meta) void handleConversationResponse(meta, response);
  }

  return response;
};

// ── postMessage helpers ───────────────────────────────────────────────────

function post<T extends BridgeEvent['type']>(
  type: T,
  payload: Extract<BridgeEvent, { type: T }>['payload'],
): void {
  window.postMessage({ cc: CC_MARKER, type, payload }, '*');
}

function postResponse(
  requestId: string,
  ok: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  error: string | null,
): void {
  window.postMessage({ cc: CC_MARKER, type: 'cc:response', requestId, ok, payload, error }, '*');
}

// ── URL helpers ───────────────────────────────────────────────────────────

function toAbsoluteUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input.startsWith('/') ? `https://claude.ai${input}` : input;
  }
  if (input instanceof URL)     return input.href;
  if (input instanceof Request) return input.url;
  return '';
}

interface ConversationMeta { orgId: string; conversationId: string }

function getConversationMeta(url: string): ConversationMeta | null {
  const match = url.match(/^https:\/\/claude\.ai\/api\/organizations\/([^/]+)\/chat_conversations\/([^/?]+)/);
  return match ? { orgId: match[1]!, conversationId: match[2]! } : null;
}

// ── Response handlers ─────────────────────────────────────────────────────

async function handleConversationResponse(
  { orgId, conversationId }: ConversationMeta,
  response: Response,
): Promise<void> {
  try {
    const data = await response.clone().json();
    post('cc:conversation', { orgId, conversationId, data });
  } catch {
    // ignore parse failures
  }
}

async function handleEventStream(response: Response): Promise<void> {
  try {
    const reader = response.clone().body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = JSON.parse(raw) as Record<string, any>;
          if (json['type'] === 'message_limit' && json['message_limit']) {
            post('cc:message_limit', json['message_limit']);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // best-effort; don't break claude.ai
  }
}

// ── Request listener ──────────────────────────────────────────────────────

window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source !== window) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = event.data as Record<string, any> | null;
  if (!data || data['cc'] !== CC_MARKER) return;
  if (data['type'] !== 'cc:request') return;

  const requestId: string             = data['requestId'];
  const kind:      BridgeRequest['kind'] = data['kind'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload:   Record<string, any>   = data['payload'] ?? {};

  try {
    if (kind === 'hash') {
      const text = typeof payload['text'] === 'string' ? payload['text'] : '';
      if (!text || !crypto?.subtle?.digest) {
        postResponse(requestId, false, null, 'Hash unavailable');
        return;
      }
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const bytes  = new Uint8Array(buffer);
      const hash   = Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
      postResponse(requestId, true, { hash }, null);
      return;
    }

    if (kind === 'usage') {
      const orgId = payload['orgId'];
      if (typeof orgId !== 'string' || !orgId) throw new Error('Missing orgId');
      const res  = await originalFetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
        method: 'GET',
        credentials: 'include',
      });
      postResponse(requestId, true, await res.json(), null);
      return;
    }

    if (kind === 'conversation') {
      const orgId          = payload['orgId'];
      const conversationId = payload['conversationId'];
      if (typeof orgId !== 'string' || !orgId) throw new Error('Missing orgId');
      if (typeof conversationId !== 'string' || !conversationId) throw new Error('Missing conversationId');

      const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;
      const res = await originalFetch(url, { method: 'GET', credentials: 'include' });
      const json = await res.json();
      post('cc:conversation', { orgId, conversationId, data: json });
      postResponse(requestId, true, json, null);
      return;
    }

    throw new Error(`Unknown request kind: ${kind}`);
  } catch (e) {
    postResponse(requestId, false, null, e instanceof Error ? e.message : String(e));
  }
});
