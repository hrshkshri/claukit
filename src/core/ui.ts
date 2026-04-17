import type { NormalizedUsage, UsageWindow } from '../shared/api';
import { DOM, COLORS, CONST } from '../shared/constants';
import { waitForElement } from '../shared/dom';

// ── Formatting helpers ────────────────────────────────────────────────────

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatResetCountdown(timestampMs: number): string {
  const diffMs = timestampMs - Date.now();
  if (diffMs <= 0) return '0s';

  const totalSeconds  = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;

  const days     = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

// ── Tooltip helpers ───────────────────────────────────────────────────────

interface TooltipOptions { topOffset?: number }

function setupTooltip(element: HTMLElement, tooltip: HTMLElement, { topOffset = 10 }: TooltipOptions = {}): void {
  if (element.hasAttribute('data-tooltip-setup')) return;
  element.setAttribute('data-tooltip-setup', 'true');
  element.classList.add('cc-tooltipTrigger');

  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer:  ReturnType<typeof setTimeout> | undefined;

  const show = (): void => {
    const rect    = element.getBoundingClientRect();
    tooltip.style.opacity = '1';
    const tipRect = tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2;
    if (left + tipRect.width / 2 > window.innerWidth) left = window.innerWidth - tipRect.width / 2 - 10;
    if (left - tipRect.width / 2 < 0)                  left = tipRect.width / 2 + 10;

    let top = rect.top - tipRect.height - topOffset;
    if (top < 10) top = rect.bottom + 10;

    tooltip.style.left      = `${left}px`;
    tooltip.style.top       = `${top}px`;
    tooltip.style.transform = 'translateX(-50%)';
  };

  const hide = (): void => {
    tooltip.style.opacity = '0';
    clearTimeout(hideTimer);
  };

  element.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      pressTimer = setTimeout(() => {
        show();
        hideTimer = setTimeout(hide, 3000);
      }, 500);
    }
  });

  element.addEventListener('pointerup', () => clearTimeout(pressTimer));
  element.addEventListener('pointercancel', () => { clearTimeout(pressTimer); hide(); });
  element.addEventListener('pointerenter', (e: PointerEvent) => { if (e.pointerType === 'mouse') show(); });
  element.addEventListener('pointerleave', (e: PointerEvent) => { if (e.pointerType === 'mouse') hide(); });
}

function makeTooltip(text: string): HTMLElement {
  const tip = document.createElement('div');
  tip.className   = 'cc-tooltip';
  tip.textContent = text;
  document.body.appendChild(tip);
  return tip;
}

function makeInfoBtn(): HTMLElement {
  const btn = document.createElement('span');
  btn.className = 'cc-info-btn';
  btn.textContent = 'i';
  return btn;
}

// ── Progress chrome ───────────────────────────────────────────────────────

interface ProgressChrome {
  strokeColor: string;
  fillColor:   string;
  markerColor: string;
  boldColor:   string;
}

function getProgressChrome(): ProgressChrome {
  const root   = document.documentElement;
  const isDark = root.dataset['mode'] === 'dark';
  return {
    strokeColor: isDark ? COLORS.PROGRESS_OUTLINE_DARK : COLORS.PROGRESS_OUTLINE_LIGHT,
    fillColor:   isDark ? COLORS.PROGRESS_FILL_DARK    : COLORS.PROGRESS_FILL_LIGHT,
    markerColor: isDark ? COLORS.PROGRESS_MARKER_DARK  : COLORS.PROGRESS_MARKER_LIGHT,
    boldColor:   isDark ? COLORS.BOLD_DARK             : COLORS.BOLD_LIGHT,
  };
}

// ── CounterUI ─────────────────────────────────────────────────────────────

export interface CounterUIOptions {
  onUsageRefresh?: () => Promise<void>;
}

export interface ConversationMetricsInput {
  totalTokens: number;
  cachedUntil: number | null;
}

export class CounterUI {
  private readonly onUsageRefresh: (() => Promise<void>) | null;

  // Panel
  private panel:         HTMLDivElement  | null = null;

  // Token row
  private tokenRow:      HTMLDivElement  | null = null;
  private headerDisplay: HTMLSpanElement | null = null;
  private lengthGroup:   HTMLSpanElement | null = null;
  private lengthDisplay: HTMLSpanElement | null = null;
  private cachedDisplay: HTMLSpanElement | null = null;
  private lengthBar:     HTMLDivElement  | null = null;
  private lengthTooltip: HTMLElement     | null = null;
  private lastCachedUntilMs: number | null = null;
  private pendingCache  = false;
  private cacheTimeSpan: HTMLSpanElement | null = null;
  private hasTokens     = false;

  // Usage rows
  private sessionUsageSpan:   HTMLSpanElement | null = null;
  private weeklyUsageSpan:    HTMLSpanElement | null = null;
  private sessionBar:         HTMLDivElement  | null = null;
  private sessionBarFill:     HTMLDivElement  | null = null;
  private weeklyBar:          HTMLDivElement  | null = null;
  private weeklyBarFill:      HTMLDivElement  | null = null;
  private sessionResetMs:     number | null = null;
  private weeklyResetMs:      number | null = null;
  private sessionMarker:      HTMLDivElement  | null = null;
  private weeklyMarker:       HTMLDivElement  | null = null;
  private sessionWindowStartMs: number | null = null;
  private weeklyWindowStartMs:  number | null = null;
  private sessionGroup:       HTMLDivElement  | null = null;
  private weeklyGroup:        HTMLDivElement  | null = null;
  private hasUsage            = false;
  private refreshingUsage     = false;

  private domObserver: MutationObserver | null = null;

  constructor({ onUsageRefresh }: CounterUIOptions = {}) {
    this.onUsageRefresh = onUsageRefresh ?? null;
  }

  // Called once to create all DOM nodes
  initialize(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'cc-panel cc-hidden';

    // Branding header
    const header = document.createElement('div');
    header.className = 'cc-panel__header';
    const name = document.createElement('span');
    name.className = 'cc-panel__name';
    name.textContent = 'claukit';
    header.appendChild(name);
    this.panel.appendChild(header);

    this.tokenRow = document.createElement('div');
    this.tokenRow.className = 'cc-tokenRow cc-hidden';

    this.headerDisplay = document.createElement('span');
    this.headerDisplay.className = 'cc-headerItem';

    this.lengthGroup   = document.createElement('span');
    this.lengthDisplay = document.createElement('span');
    this.cachedDisplay = document.createElement('span');

    this.lengthGroup.appendChild(this.lengthDisplay);
    this.headerDisplay.appendChild(this.lengthGroup);
    this.tokenRow.appendChild(this.headerDisplay);
    this.panel.appendChild(this.tokenRow);

    this._initUsageRows();
    this._setupTooltips();
    this._observeDom();
    this._observeTheme();
  }

  private _observeTheme(): void {
    new MutationObserver(() => this._refreshProgressChrome()).observe(
      document.documentElement,
      { attributes: true, attributeFilter: ['data-mode'] },
    );
  }

  private _observeDom(): void {
    let reattachPending = false;
    this.domObserver = new MutationObserver(() => {
      if (this.panel && !document.contains(this.panel) && !reattachPending) {
        reattachPending = true;
        waitForElement(DOM.MODEL_SELECTOR_DROPDOWN, 60_000).then((el) => {
          reattachPending = false;
          if (el) this.attach();
        });
      }
    });
    this.domObserver.observe(document.body, { childList: true, subtree: true });
  }

  private _initUsageRows(): void {
    this.sessionUsageSpan         = document.createElement('span');
    this.sessionUsageSpan.className = 'cc-usageText';

    this.sessionBar               = document.createElement('div');
    this.sessionBar.className       = 'cc-bar cc-bar--usage';
    this.sessionBarFill             = document.createElement('div');
    this.sessionBarFill.className   = 'cc-bar__fill';
    this.sessionMarker              = document.createElement('div');
    this.sessionMarker.className    = 'cc-bar__marker cc-hidden';
    this.sessionMarker.style.left   = '0%';
    this.sessionBar.appendChild(this.sessionBarFill);
    this.sessionBar.appendChild(this.sessionMarker);

    this.weeklyUsageSpan          = document.createElement('span');
    this.weeklyUsageSpan.className  = 'cc-usageText';

    this.weeklyBar                = document.createElement('div');
    this.weeklyBar.className        = 'cc-bar cc-bar--usage';
    this.weeklyBarFill              = document.createElement('div');
    this.weeklyBarFill.className    = 'cc-bar__fill';
    this.weeklyMarker               = document.createElement('div');
    this.weeklyMarker.className     = 'cc-bar__marker cc-hidden';
    this.weeklyMarker.style.left    = '0%';
    this.weeklyBar.appendChild(this.weeklyBarFill);
    this.weeklyBar.appendChild(this.weeklyMarker);

    this.sessionGroup             = document.createElement('div');
    this.sessionGroup.className     = 'cc-usageGroup cc-hidden';
    this.sessionGroup.appendChild(this.sessionUsageSpan);
    this.sessionGroup.appendChild(this.sessionBar);

    this.weeklyGroup              = document.createElement('div');
    this.weeklyGroup.className      = 'cc-usageGroup cc-hidden';
    this.weeklyGroup.appendChild(this.weeklyUsageSpan);
    this.weeklyGroup.appendChild(this.weeklyBar);

    this.panel!.appendChild(this.sessionGroup);
    this.panel!.appendChild(this.weeklyGroup);

    this._refreshProgressChrome();

    this.panel!.addEventListener('click', async () => {
      if (!this.onUsageRefresh || this.refreshingUsage) return;
      this.refreshingUsage = true;
      this.panel!.classList.add('cc-panel--dim');
      try {
        await this.onUsageRefresh();
      } finally {
        this.panel!.classList.remove('cc-panel--dim');
        this.refreshingUsage = false;
      }
    });
  }

  private _setupTooltips(): void {
    // Token row — single [i] covers tokens + cache
    const tokenInfoBtn = makeInfoBtn();
    this.tokenRow!.appendChild(tokenInfoBtn);
    this.lengthTooltip = makeTooltip(
      "rough token count (system prompt not included)\ntokenizer's best guess — not exact\nbar fills to 200k · claude compacts before you actually hit it"
    );
    setupTooltip(tokenInfoBtn, this.lengthTooltip, { topOffset: 8 });

    // Session row
    const sessionInfoBtn = makeInfoBtn();
    this.sessionGroup!.appendChild(sessionInfoBtn);
    setupTooltip(sessionInfoBtn, makeTooltip(
      "5hr usage window\nbar = how much you've burned\nmarker = where you are in the window rn\nclick to refresh"
    ), { topOffset: 8 });

    // Weekly row
    const weeklyInfoBtn = makeInfoBtn();
    this.weeklyGroup!.appendChild(weeklyInfoBtn);
    setupTooltip(weeklyInfoBtn, makeTooltip(
      "7-day usage window\nsame vibe as session, just zoomed out\nmarker = your current position this week\nclick to refresh"
    ), { topOffset: 8 });
  }

  private _refreshProgressChrome(): void {
    const { strokeColor, fillColor, markerColor } = getProgressChrome();

    const applyBarChrome = (bar: HTMLElement | null, fillWarn?: string): void => {
      if (!bar) return;
      bar.style.setProperty('--cc-stroke',    strokeColor);
      bar.style.setProperty('--cc-fill',      fillColor);
      bar.style.setProperty('--cc-fill-warn', fillWarn ?? fillColor);
      bar.style.setProperty('--cc-marker',    markerColor);
    };

    applyBarChrome(this.lengthBar,  fillColor);
    applyBarChrome(this.sessionBar, COLORS.RED_WARNING);
    applyBarChrome(this.weeklyBar,  COLORS.RED_WARNING);
  }

  attach(): void {
    if (!this.panel) return;
    const modelSelector = document.querySelector<HTMLElement>(DOM.MODEL_SELECTOR_DROPDOWN);
    if (!modelSelector) return;

    const gridContainer = modelSelector.closest<HTMLElement>('[data-testid="chat-input-grid-container"]');
    const gridArea      = modelSelector.closest<HTMLElement>('[data-testid="chat-input-grid-area"]');

    const findToolbarRow = (el: HTMLElement, stopAt?: HTMLElement | null): HTMLElement | null => {
      let cur: HTMLElement | null = el;
      while (cur && cur !== document.body) {
        if (stopAt && cur === stopAt) break;
        if (cur !== el && cur.nodeType === 1) {
          const style = window.getComputedStyle(cur);
          if (style.display === 'flex' && style.flexDirection === 'row') {
            if (cur.querySelectorAll('button').length > 1) return cur;
          }
        }
        cur = cur.parentElement;
      }
      return null;
    };

    const toolbarRow =
      (gridContainer ? findToolbarRow(modelSelector, gridArea ?? gridContainer) : null) ??
      findToolbarRow(modelSelector) ??
      (modelSelector.parentElement?.parentElement?.parentElement ?? null);

    if (!toolbarRow) return;
    if (toolbarRow.nextElementSibling !== this.panel) toolbarRow.after(this.panel);
    this._refreshProgressChrome();
  }

  private _refreshPanelVisibility(): void {
    this.panel?.classList.toggle('cc-hidden', !this.hasTokens && !this.hasUsage);
  }

  setPendingCache(pending: boolean): void {
    this.pendingCache = pending;
    if (this.cacheTimeSpan) {
      if (pending) {
        this.cacheTimeSpan.style.color = '';
      } else {
        this.cacheTimeSpan.style.color = getProgressChrome().boldColor;
      }
    }
  }

  setConversationMetrics({ totalTokens, cachedUntil }: Partial<ConversationMetricsInput> = {}): void {
    this.pendingCache = false;

    if (typeof totalTokens !== 'number') {
      this.hasTokens = false;
      this.lengthDisplay!.textContent  = '';
      this.cachedDisplay!.textContent  = '';
      this.lastCachedUntilMs           = null;
      this._renderTokenRow();
      this._refreshPanelVisibility();
      return;
    }

    this.hasTokens = true;
    const pct = Math.max(0, Math.min(100, (totalTokens / CONST.CONTEXT_LIMIT_TOKENS) * 100));
    this.lengthDisplay!.textContent = `~${totalTokens.toLocaleString()} tokens`;

    const isFull = pct >= 99.5;
    if (isFull) {
      this.lengthDisplay!.style.opacity = '0.5';
      this.lengthBar = null;
      this.lengthGroup!.replaceChildren(this.lengthDisplay!);
      if (this.lengthTooltip) {
        this.lengthTooltip.textContent =
          "Approximate tokens (excludes system prompt).\nUses a generic tokenizer, may differ from Claude's count.\nThis count is invalid after compaction.";
      }
    } else {
      this.lengthDisplay!.style.opacity = '';
      const bar  = document.createElement('div');
      bar.className = 'cc-bar cc-bar--mini';
      this.lengthBar = bar;
      const fill = document.createElement('div');
      fill.className  = 'cc-bar__fill';
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      this._refreshProgressChrome();

      const barContainer = document.createElement('span');
      barContainer.className = 'inline-flex items-center';
      barContainer.appendChild(bar);
      this.lengthGroup!.replaceChildren(this.lengthDisplay!, document.createTextNode('\u00A0'), barContainer);
    }

    const now = Date.now();
    if (typeof cachedUntil === 'number' && cachedUntil > now) {
      this.lastCachedUntilMs = cachedUntil;
      const secondsLeft      = Math.max(0, Math.ceil((cachedUntil - now) / 1000));
      const { boldColor }    = getProgressChrome();
      this.cacheTimeSpan     = Object.assign(document.createElement('span'), {
        className:   'cc-cacheTime',
        textContent: formatSeconds(secondsLeft),
      });
      this.cacheTimeSpan.style.color = boldColor;
      this.cachedDisplay!.replaceChildren(document.createTextNode('cached\u00A0·\u00A0'), this.cacheTimeSpan);
    } else {
      this.lastCachedUntilMs = null;
      this.cacheTimeSpan     = null;
      this.cachedDisplay!.textContent = '';
    }

    this._renderTokenRow();
    this._refreshPanelVisibility();
  }

  private _renderTokenRow(): void {
    if (!this.lengthDisplay!.textContent) {
      this.tokenRow!.classList.add('cc-hidden');
      return;
    }
    const hasCache = !!this.cachedDisplay!.textContent;
    if (hasCache) {
      const dot = document.createElement('span');
      dot.className   = 'cc-headerDot';
      dot.textContent = '·';
      this.headerDisplay!.replaceChildren(this.lengthGroup!, dot, this.cachedDisplay!);
    } else {
      this.headerDisplay!.replaceChildren(this.lengthGroup!);
    }
    this.tokenRow!.classList.remove('cc-hidden');
  }

  setUsage(usage: NormalizedUsage | null): void {
    this._refreshProgressChrome();
    const session: UsageWindow | null = usage?.five_hour ?? null;
    const weekly:  UsageWindow | null = usage?.seven_day  ?? null;
    const hasSession = !!(session && typeof session.utilization === 'number');
    const hasWeekly  = !!(weekly  && typeof weekly.utilization  === 'number');
    this.hasUsage = hasSession || hasWeekly;

    this.sessionGroup?.classList.toggle('cc-hidden', !hasSession);
    if (hasSession && session) {
      const rawPct = session.utilization;
      const pct    = Math.round(rawPct * 10) / 10;
      this.sessionResetMs         = session.resets_at ? Date.parse(session.resets_at) : null;
      this.sessionWindowStartMs   = this.sessionResetMs ? this.sessionResetMs - 5 * 60 * 60 * 1000 : null;
      const resetText             = this.sessionResetMs ? ` · ${formatResetCountdown(this.sessionResetMs)} left` : '';
      this.sessionUsageSpan!.textContent = `session ${pct}%${resetText}`;

      const width = Math.max(0, Math.min(100, rawPct));
      this.sessionBarFill!.style.width = `${width}%`;
      this.sessionBarFill!.classList.toggle('cc-warn', width >= 90);
      this.sessionBarFill!.classList.toggle('cc-full', width >= 99.5);
    } else {
      this.sessionUsageSpan!.textContent = '';
      this.sessionBarFill!.style.width   = '0%';
      this.sessionBarFill!.classList.remove('cc-warn', 'cc-full');
      this.sessionResetMs       = null;
      this.sessionWindowStartMs = null;
    }

    this.weeklyGroup?.classList.toggle('cc-hidden', !hasWeekly);
    if (hasWeekly && weekly) {
      const rawPct = weekly.utilization;
      const pct    = Math.round(rawPct * 10) / 10;
      this.weeklyResetMs         = weekly.resets_at ? Date.parse(weekly.resets_at) : null;
      this.weeklyWindowStartMs   = this.weeklyResetMs ? this.weeklyResetMs - 7 * 24 * 60 * 60 * 1000 : null;
      const resetText            = this.weeklyResetMs ? ` · ${formatResetCountdown(this.weeklyResetMs)} left` : '';
      this.weeklyUsageSpan!.textContent = `weekly ${pct}%${resetText}`;

      const width = Math.max(0, Math.min(100, rawPct));
      this.weeklyBarFill!.style.width = `${width}%`;
      this.weeklyBarFill!.classList.toggle('cc-warn', width >= 90);
      this.weeklyBarFill!.classList.toggle('cc-full', width >= 99.5);
    } else {
      this.weeklyUsageSpan!.textContent = '';
      this.weeklyBarFill!.style.width   = '0%';
      this.weeklyResetMs       = null;
      this.weeklyWindowStartMs = null;
      this.weeklyBarFill!.classList.remove('cc-warn', 'cc-full');
    }

    this._refreshPanelVisibility();
    this._updateMarkers();
  }

  private _updateMarkers(): void {
    const now = Date.now();

    if (this.sessionMarker && this.sessionWindowStartMs && this.sessionResetMs) {
      const total   = this.sessionResetMs - this.sessionWindowStartMs;
      const elapsed = Math.max(0, Math.min(total, now - this.sessionWindowStartMs));
      const pct     = Math.max(0, Math.min(100, (total > 0 ? elapsed / total : 0) * 100));
      this.sessionMarker.classList.remove('cc-hidden');
      this.sessionMarker.style.left = `${pct}%`;
    } else {
      this.sessionMarker?.classList.add('cc-hidden');
    }

    if (this.weeklyMarker && this.weeklyWindowStartMs && this.weeklyResetMs) {
      const total   = this.weeklyResetMs - this.weeklyWindowStartMs;
      const elapsed = Math.max(0, Math.min(total, now - this.weeklyWindowStartMs));
      const pct     = Math.max(0, Math.min(100, (total > 0 ? elapsed / total : 0) * 100));
      this.weeklyMarker.classList.remove('cc-hidden');
      this.weeklyMarker.style.left = `${pct}%`;
    } else {
      this.weeklyMarker?.classList.add('cc-hidden');
    }
  }

  tick(): void {
    const now = Date.now();

    // Cache countdown
    if (this.lastCachedUntilMs && this.lastCachedUntilMs > now) {
      const secondsLeft = Math.max(0, Math.ceil((this.lastCachedUntilMs - now) / 1000));
      if (this.cacheTimeSpan) this.cacheTimeSpan.textContent = formatSeconds(secondsLeft);
    } else if (this.lastCachedUntilMs && this.lastCachedUntilMs <= now) {
      this.lastCachedUntilMs = null;
      this.cacheTimeSpan     = null;
      this.pendingCache      = false;
      this.cachedDisplay!.textContent = '';
      this._renderTokenRow();
    }

    // Reset countdown text
    if (this.sessionResetMs && this.sessionUsageSpan?.textContent) {
      const idx = this.sessionUsageSpan.textContent.indexOf(' · ');
      if (idx !== -1) {
        const prefix = this.sessionUsageSpan.textContent.slice(0, idx + ' · '.length);
        this.sessionUsageSpan.textContent = `${prefix}${formatResetCountdown(this.sessionResetMs)} left`;
      }
    }

    if (this.weeklyResetMs && this.weeklyUsageSpan?.textContent) {
      const idx = this.weeklyUsageSpan.textContent.indexOf(' · ');
      if (idx !== -1) {
        const prefix = this.weeklyUsageSpan.textContent.slice(0, idx + ' · '.length);
        this.weeklyUsageSpan.textContent = `${prefix}${formatResetCountdown(this.weeklyResetMs)} left`;
      }
    }

    this._updateMarkers();
  }

}
