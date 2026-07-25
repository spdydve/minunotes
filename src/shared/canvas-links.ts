export type MinuNotesNodeLink = {
  type: 'note';
  id: string;
};

export type MinuNotesNodeMetadata = {
  link?: MinuNotesNodeLink;
};

export type MinuNotesNodeExtra = {
  [key: string]: unknown;
  minunotes?: MinuNotesNodeMetadata;
};

const NOTE_ID_PATTERN = /^note_[a-zA-Z0-9]+$/;

export function getMinuNotesNodeLink(node: unknown): MinuNotesNodeLink | null {
  if (!node || typeof node !== 'object') return null;
  const metadata = (node as { minunotes?: unknown }).minunotes;
  if (!metadata || typeof metadata !== 'object') return null;
  const link = (metadata as { link?: unknown }).link;
  if (!link || typeof link !== 'object') return null;
  const type = (link as { type?: unknown }).type;
  const id = (link as { id?: unknown }).id;
  if (type !== 'note' || typeof id !== 'string' || !NOTE_ID_PATTERN.test(id)) return null;
  return { type, id };
}
