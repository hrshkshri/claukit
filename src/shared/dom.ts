export function waitForElement(selector: string, timeoutMs?: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) { resolve(existing); return; }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    if (timeoutMs !== undefined) {
      timeoutId = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
    }
  });
}
