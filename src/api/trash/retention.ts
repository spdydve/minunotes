export const TRASH_RETENTION_DAYS = 30;
export const DEFAULT_TRASH_PURGE_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrashAutoPurgeMode = 'disabled' | 'dry-run' | 'enabled';

export function getTrashPurgeAfter(now = new Date()) {
  return new Date(now.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

export function getTrashAutoPurgeMode(value = process.env.TRASH_AUTO_PURGE_MODE): TrashAutoPurgeMode {
  return value === 'dry-run' || value === 'enabled' ? value : 'disabled';
}

export function getTrashPurgeLimit(value = process.env.TRASH_AUTO_PURGE_LIMIT) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : DEFAULT_TRASH_PURGE_LIMIT;
}
