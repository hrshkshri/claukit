import type { BridgeEvent, BridgeRequest } from '../shared/messages';
import { DOM } from '../shared/constants';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal subset of the extension runtime API we need. */
interface ExtensionRuntime {
  getURL(path: string): string;
}

interface ExtensionGlobal {
  runtime?: ExtensionRuntime;
}

function getRuntime(): ExtensionRuntime | null {
  // Firefox exposes `browser`, Chromium exposes `chrome`.  Both have runtime.getURL.
  const g = globalThis as unknown as { browser?: ExtensionGlobal; chrome?: ExtensionGlobal };
  return g.browser?.runtime ?? g.chrome?.runtime ?? null;
}

function makeRequestId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ── Pending request bookkeeping ────────────────────────────────────────────

interface PendingRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (value: any) => void;
  reject:  (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// ── BridgeClient ───────────────────────────────────────────────────────────

type EventListener<T = unknown> = (payload: T) => void;

export class BridgeClient {
  private readonly _pending   = new Map<string, PendingRequest>();
  private readonly _listeners = new Map<string, Set<EventListener>>();

  constructor() {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = event.data as Record<string, any> | null;
      if (!data || data['cc'] !== 'ClaudeCounter') return;

      if (data['type'] === 'cc:response') {
        const requestId: string = data['requestId'];
        const ok: boolean       = data['ok'];
        const payload           = data['payload'];
        const error: string | null = data['error'] ?? null;

        const pending = this._pending.get(requestId);
        if (!pending) return;
        this._pending.delete(requestId);
        clearTimeout(pending.timeoutId);
        if (ok) pending.resolve(payload);
        else     pending.reject(new Error(error ?? 'Bridge request failed'));
        return;
      }

      // Push event (cc:generation_start, cc:conversation, cc:message_limit, …)
      this._emit(data['type'] as BridgeEvent['type'], data['payload']);
    });
  }

  private _emit(type: string, payload: unknown): void {
    const listeners = this._listeners.get(type);
    if (!listeners) return;
    for (const fn of listeners) fn(payload);
  }

  on<K extends BridgeEvent['type']>(
    type: K,
    fn: EventListener<Extract<BridgeEvent, { type: K }>['payload']>,
  ): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this._listeners.get(type)!.add(fn as EventListener);
    return () => this._listeners.get(type)?.delete(fn as EventListener);
  }

  request<K extends BridgeRequest['kind']>(
    kind: K,
    payload: Extract<BridgeRequest, { kind: K }>['payload'],
    { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    const requestId = makeRequestId();
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._pending.delete(requestId);
        reject(new Error(`Bridge request timed out (${kind})`));
      }, timeoutMs);

      this._pending.set(requestId, { resolve, reject, timeoutId });
      window.postMessage(
        { cc: 'ClaudeCounter', type: 'cc:request', requestId, kind, payload },
        '*',
      );
    });
  }

  async requestUsage(orgId: string): Promise<unknown> {
    return this.request('usage', { orgId }, { timeoutMs: 15_000 });
  }

  async requestConversation(orgId: string, conversationId: string): Promise<unknown> {
    return this.request('conversation', { orgId, conversationId }, { timeoutMs: 20_000 });
  }

  async requestHash(text: string): Promise<{ hash: string } | null> {
    try {
      const res = await this.request('hash', { text }, { timeoutMs: 5_000 });
      const r = res as { hash?: string };
      return r.hash ? { hash: r.hash } : null;
    } catch {
      return null;
    }
  }
}

// ── Bridge injection ───────────────────────────────────────────────────────

let bridgeReadyPromise: Promise<boolean> | null = null;

export function injectBridgeOnce(): Promise<boolean> {
  if (bridgeReadyPromise) return bridgeReadyPromise;

  const runtime = getRuntime();
  if (!runtime) return Promise.resolve(false);

  if (document.getElementById(DOM.BRIDGE_SCRIPT_ID)) {
    return Promise.resolve(true);
  }

  bridgeReadyPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.id  = DOM.BRIDGE_SCRIPT_ID;
    script.src = runtime.getURL('dist/bridge.js');
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    (document.head ?? document.documentElement).appendChild(script);
  });

  return bridgeReadyPromise;
}
