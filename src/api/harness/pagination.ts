import { createHash } from 'node:crypto';

export type PageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

type CursorEnvelope = {
  version: 1;
  scope: string;
  position: unknown;
};

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor');
    this.name = 'InvalidCursorError';
  }
}

export function parsePageLimit(value: string | undefined, defaultLimit = 25, maxLimit = 100) {
  if (value === undefined) return defaultLimit;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

export function paginationScope(...parts: string[]) {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

export function encodeCursor<T>(scope: string, position: T) {
  const envelope: CursorEnvelope = { version: 1, scope, position };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

export function decodeCursor<T>(
  value: string | undefined,
  scope: string,
  isPosition: (value: unknown) => value is T
): T | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CursorEnvelope>;
    if (decoded.version !== 1 || decoded.scope !== scope || !isPosition(decoded.position)) {
      throw new InvalidCursorError();
    }
    return decoded.position;
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
}

export function compareCursorText(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function compareTitleIdPositions(left: { title: string; id: string }, right: { title: string; id: string }) {
  return compareCursorText(left.title, right.title) || compareCursorText(left.id, right.id);
}

export function isTitleIdPosition(value: unknown): value is { title: string; id: string } {
  if (!value || typeof value !== 'object') return false;
  const position = value as { title?: unknown; id?: unknown };
  return typeof position.title === 'string' && typeof position.id === 'string';
}

export function paginateItems<T, P>(
  items: T[],
  limit: number,
  cursor: string | undefined,
  scope: string,
  position: (item: T) => P,
  compare: (left: P, right: P) => number,
  isPosition: (value: unknown) => value is P
) {
  const cursorPosition = decodeCursor(cursor, scope, isPosition);
  const start = cursorPosition === null ? 0 : items.findIndex((item) => compare(position(item), cursorPosition) > 0);
  const offset = start < 0 ? items.length : start;
  const page = items.slice(offset, offset + limit + 1);
  const visible = page.slice(0, limit);
  const hasMore = page.length > limit;
  return {
    items: visible,
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? encodeCursor(scope, position(visible[visible.length - 1])) : null,
    } satisfies PageInfo,
  };
}
