import { createHash } from 'node:crypto';

export function hashMarkdown(markdown: string) {
  return createHash('sha256').update(markdown).digest('hex');
}
