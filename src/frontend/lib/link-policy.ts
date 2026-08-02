export type InternalNoteLinkKind = 'wikilink' | 'canvas-node';
export type InternalNoteLinkTarget = 'current-tab' | 'new-tab';

export const internalNoteLinkPolicy: Record<InternalNoteLinkKind, InternalNoteLinkTarget> = {
  wikilink: 'current-tab',
  'canvas-node': 'new-tab',
};

export function internalNoteLinkTarget(kind: InternalNoteLinkKind) {
  return internalNoteLinkPolicy[kind];
}
