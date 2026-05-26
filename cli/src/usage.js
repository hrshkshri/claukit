'use strict';

async function fetchWithSession(url, sessionKey) {
  const res = await fetch(url, {
    headers: {
      Cookie: `sessionKey=${sessionKey}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://claude.ai',
      'Referer': 'https://claude.ai/',
      'anthropic-client-platform': 'web_claude_ai',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchOrgId(sessionKey) {
  try {
    const data = await fetchWithSession('https://claude.ai/api/bootstrap', sessionKey)
      ?? await fetchWithSession('https://claude.ai/api/auth/session', sessionKey);
    if (!data) return null;
    const org = (
      data?.account?.memberships?.[0]?.organization ??
      data?.memberships?.[0]?.organization ??
      data?.organizations?.[0] ??
      null
    );
    return org?.uuid ?? org?.id ?? null;
  } catch {
    return null;
  }
}

function processUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const processWindow = (data) => {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.utilization !== 'number' || !Number.isFinite(data.utilization)) return null;
    return {
      utilization: Math.max(0, Math.min(100, data.utilization)),
      resets_at: typeof data.resets_at === 'string' ? data.resets_at : null,
    };
  };

  const fiveHour = processWindow(raw.five_hour);
  const sevenDay = processWindow(raw.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return { five_hour: fiveHour, seven_day: sevenDay };
}

async function fetchUsage(sessionKey, orgId) {
  try {
    const raw = await fetchWithSession(
      `https://claude.ai/api/organizations/${orgId}/usage`,
      sessionKey
    );
    return processUsage(raw);
  } catch {
    return null;
  }
}

module.exports = { fetchUsage, fetchOrgId };
