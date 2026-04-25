import { SendHistoryEntry } from '../types';

const HISTORY_PREFIX = 'automail:send-history:';
const HISTORY_LIMIT = 100;

function getHistoryKey(userKey: string) {
  return `${HISTORY_PREFIX}${userKey}`;
}

export function loadSendHistory(userKey: string): SendHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(getHistoryKey(userKey));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SendHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSendHistory(userKey: string, entries: SendHistoryEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getHistoryKey(userKey), JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
}

export function appendSendHistory(userKey: string, entry: SendHistoryEntry) {
  const entries = loadSendHistory(userKey);
  saveSendHistory(userKey, [entry, ...entries]);
}
