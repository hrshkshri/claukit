/**
 * main.ts — content-script entry point.
 * Wires together BridgeClient, computeConversationMetrics, and CounterUI.
 * No globalThis references.
 */

import { BridgeClient, injectBridgeOnce } from './bridge/client';
import { computeConversationMetrics }      from './core/tokens';
import { CounterUI }                       from './core/ui';
import type { NormalizedUsage, ConversationData, RawMessageLimit } from './shared/api';
import { DOM }                             from './shared/constants';
import { waitForElement }                  from './shared/dom';

// ── Guard against double execution ────────────────────────────────────────

const STARTED_KEY = '__cc_started__';
if ((window as unknown as Record<string, unknown>)[STARTED_KEY]) {
  // Already running — bail out immediately (e.g. after an extension reload)
  throw new Error('[ClaudeCounter] already started');
}
(window as unknown as Record<string, unknown>)[STARTED_KEY] = true;

// ── Core instances ────────────────────────────────────────────────────────

const bridge = new BridgeClient();
const bridgeReady = injectBridgeOnce();

const ui = new CounterUI({
  onUsageRefresh: async () => { await refreshUsage(); },
});
ui.initialize();

// ── State ─────────────────────────────────────────────────────────────────

let currentConversationId: string | null = null;
let currentOrgId:          string | null = null;

let usageState:       NormalizedUsage | null                   = null;
let usageResetMs:     { five_hour: number | null; seven_day: number | null } = { five_hour: null, seven_day: null };
let lastUsageSseMs  = 0;
let usageFetchInFlight = false;
let lastUsageUpdateMs  = 0;

const rolloverHandledForResetMs: { five_hour: number | null; seven_day: number | null } = {
  five_hour: null,
  seven_day: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────

function getConversationId(): string | null {
  const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
  return match ? (match[1] ?? null) : null;
}

function getOrgIdFromCookie(): string | null {
  try {
    return (
      document.cookie
        .split('; ')
        .find((row) => row.startsWith('lastActiveOrg='))
        ?.split('=')[1] ?? null
    );
  } catch {
    return null;
  }
}

function observeUrlChanges(callback: () => void): () => void {
  let lastPath = window.location.pathname;

  const fireIfChanged = (): void => {
    const current = window.location.pathname;
    if (current !== lastPath) { lastPath = current; callback(); }
  };

  window.addEventListener('cc:urlchange', fireIfChanged);
  window.addEventListener('popstate',     fireIfChanged);

  return () => {
    window.removeEventListener('cc:urlchange', fireIfChanged);
    window.removeEventListener('popstate',     fireIfChanged);
  };
}

// ── Usage parsing ─────────────────────────────────────────────────────────

function parseUsageFromUsageEndpoint(raw: unknown): NormalizedUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const normalizeWindow = (w: unknown, hours: number): NormalizedUsage['five_hour'] => {
    if (!w || typeof w !== 'object') return null;
    const win = w as Record<string, unknown>;
    if (typeof win['utilization'] !== 'number' || !Number.isFinite(win['utilization'] as number)) return null;
    const utilization = Math.max(0, Math.min(100, win['utilization'] as number));
    const resets_at   = typeof win['resets_at'] === 'string' ? win['resets_at'] : null;
    return { utilization, resets_at, window_hours: hours };
  };

  const fiveHour = normalizeWindow(r['five_hour'], 5);
  const sevenDay = normalizeWindow(r['seven_day'], 24 * 7);
  if (!fiveHour && !sevenDay) return null;
  return { five_hour: fiveHour, seven_day: sevenDay };
}

function parseUsageFromMessageLimit(raw: unknown): NormalizedUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawMessageLimit;
  if (!r.windows || typeof r.windows !== 'object') return null;

  const normalizeWindow = (w: RawMessageLimit['windows'][string] | undefined, hours: number): NormalizedUsage['five_hour'] => {
    if (!w || typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return null;
    const utilization = Math.max(0, Math.min(100, w.utilization * 100));
    const resets_at   =
      typeof w.resets_at === 'number' && Number.isFinite(w.resets_at)
        ? new Date(w.resets_at * 1000).toISOString()
        : null;
    return { utilization, resets_at, window_hours: hours };
  };

  const fiveHour = normalizeWindow(r.windows['5h'], 5);
  const sevenDay = normalizeWindow(r.windows['7d'], 24 * 7);
  if (!fiveHour && !sevenDay) return null;
  return { five_hour: fiveHour, seven_day: sevenDay };
}

// ── State management ──────────────────────────────────────────────────────

function updateOrgIdIfNeeded(newOrgId: string | null | undefined): void {
  if (newOrgId && typeof newOrgId === 'string' && newOrgId !== currentOrgId) {
    currentOrgId = newOrgId;
  }
}

function applyUsageUpdate(normalized: NormalizedUsage | null, source: 'sse' | 'usage'): void {
  if (!normalized) return;
  const now = Date.now();
  usageState        = normalized;
  lastUsageUpdateMs = now;
  if (source === 'sse') lastUsageSseMs = now;

  usageResetMs.five_hour = normalized.five_hour?.resets_at ? Date.parse(normalized.five_hour.resets_at) : null;
  usageResetMs.seven_day = normalized.seven_day?.resets_at ? Date.parse(normalized.seven_day.resets_at)  : null;
  ui.setUsage(normalized);
}

// ── Bridge-backed async actions ───────────────────────────────────────────

async function refreshUsage(): Promise<void> {
  await bridgeReady;
  const orgId = currentOrgId ?? getOrgIdFromCookie();
  if (!orgId) return;
  updateOrgIdIfNeeded(orgId);

  if (usageFetchInFlight) return;
  usageFetchInFlight = true;
  let raw: unknown;
  try {
    raw = await bridge.requestUsage(orgId);
  } catch {
    return;
  } finally {
    usageFetchInFlight = false;
  }

  applyUsageUpdate(parseUsageFromUsageEndpoint(raw), 'usage');
}

async function refreshConversation(): Promise<void> {
  await bridgeReady;
  if (!currentConversationId) { ui.setConversationMetrics(); return; }

  const orgId = currentOrgId ?? getOrgIdFromCookie();
  if (!orgId) return;
  updateOrgIdIfNeeded(orgId);

  try {
    await bridge.requestConversation(orgId, currentConversationId);
  } catch {
    // ignore
  }
}

// ── Bridge event handlers ─────────────────────────────────────────────────

function handleGenerationStart(): void {
  if (!currentConversationId) return;
  ui.setPendingCache(true);
}

async function handleConversationPayload({
  orgId,
  conversationId,
  data,
}: { orgId: string; conversationId: string; data: ConversationData }): Promise<void> {
  if (!conversationId || conversationId !== currentConversationId) return;
  updateOrgIdIfNeeded(orgId);
  if (!data) return;

  const metrics = await computeConversationMetrics(bridge, data);
  ui.setConversationMetrics({ totalTokens: metrics.totalTokens, cachedUntil: metrics.cachedUntil });
}

function handleMessageLimit(messageLimit: unknown): void {
  applyUsageUpdate(parseUsageFromMessageLimit(messageLimit), 'sse');
}

bridge.on('cc:generation_start', handleGenerationStart);
bridge.on('cc:conversation',     (p) => void handleConversationPayload(p as Parameters<typeof handleConversationPayload>[0]));
bridge.on('cc:message_limit',    handleMessageLimit);

// ── URL change handling ───────────────────────────────────────────────────

async function handleUrlChange(): Promise<void> {
  currentConversationId = getConversationId();

  waitForElement(DOM.MODEL_SELECTOR_DROPDOWN, 60_000).then((el) => { if (el) ui.attach(); });

  if (!currentConversationId) { ui.setConversationMetrics(); return; }

  updateOrgIdIfNeeded(getOrgIdFromCookie());
  await refreshConversation();

  if (!usageState) await refreshUsage();
}

const unobserveUrl = observeUrlChanges(() => void handleUrlChange());
window.addEventListener('beforeunload', unobserveUrl);

// ── Branch navigation ─────────────────────────────────────────────────────

let branchObserver: MutationObserver | null = null;

document.addEventListener('click', (e: MouseEvent) => {
  if (!currentConversationId) return;
  const btn = (e.target as Element).closest<HTMLButtonElement>('button[aria-label="Previous"], button[aria-label="Next"]');
  if (!btn) return;

  const container = btn.closest('.inline-flex');
  const spans     = container?.querySelectorAll('span') ?? [];
  const indicator = Array.from(spans).find((s) => /^\d+\s*\/\s*\d+$/.test(s.textContent?.trim() ?? ''));
  if (!indicator) return;

  const originalText = indicator.textContent;

  if (branchObserver) branchObserver.disconnect();

  branchObserver = new MutationObserver(() => {
    if (indicator.textContent !== originalText) {
      branchObserver!.disconnect();
      branchObserver = null;
      void refreshConversation();
    }
  });

  branchObserver.observe(indicator, { childList: true, characterData: true, subtree: true });

  setTimeout(() => {
    if (branchObserver) { branchObserver.disconnect(); branchObserver = null; }
  }, 60_000);
});

// ── Initial boot ──────────────────────────────────────────────────────────

void handleUrlChange();

// ── Tick loop ─────────────────────────────────────────────────────────────

function tick(): void {
  ui.tick();

  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  if (
    usageResetMs.five_hour &&
    now >= usageResetMs.five_hour &&
    rolloverHandledForResetMs.five_hour !== usageResetMs.five_hour
  ) {
    rolloverHandledForResetMs.five_hour = usageResetMs.five_hour;
    void refreshUsage();
  }

  if (
    usageResetMs.seven_day &&
    now >= usageResetMs.seven_day &&
    rolloverHandledForResetMs.seven_day !== usageResetMs.seven_day
  ) {
    rolloverHandledForResetMs.seven_day = usageResetMs.seven_day;
    void refreshUsage();
  }

  const sseAge = now - lastUsageSseMs;
  const anyAge = now - lastUsageUpdateMs;
  if (!document.hidden && sseAge > ONE_HOUR_MS && anyAge > ONE_HOUR_MS) {
    void refreshUsage();
  }
}

setInterval(tick, 1000);
