/** DOM selector constants used across the extension */
export const DOM = Object.freeze({
  CHAT_MENU_TRIGGER:        '[data-testid="chat-menu-trigger"]',
  MODEL_SELECTOR_DROPDOWN:  '[data-testid="model-selector-dropdown"]',
  CHAT_PROJECT_WRAPPER:     '.chat-project-wrapper',
  BRIDGE_SCRIPT_ID:         'cc-bridge-script',
} as const);

/** Timing + sizing constants */
export const CONST = Object.freeze({
  CACHE_WINDOW_MS:      5 * 60 * 1000,
  CONTEXT_LIMIT_TOKENS: 200_000,
} as const);

/** Color constants for progress bars and text */
export const COLORS = Object.freeze({
  PROGRESS_FILL_DARK:     '#DA7756',
  PROGRESS_FILL_LIGHT:    '#C15832',
  PROGRESS_OUTLINE_DARK:  'rgba(218, 119, 86, 0.45)',
  PROGRESS_OUTLINE_LIGHT: 'rgba(193, 88, 50, 0.40)',
  PROGRESS_MARKER_DARK:   '#ffffff',
  PROGRESS_MARKER_LIGHT:  '#1a0e0a',
  RED_WARNING:            '#e53e3e',
  BOLD_LIGHT:             '#9a3d16',
  BOLD_DARK:              '#f0a882',
} as const);

export type DomConstants    = typeof DOM;
export type AppConstants     = typeof CONST;
export type ColorConstants   = typeof COLORS;
