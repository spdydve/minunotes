import { notes } from '../db/schema';

export const compactNoteSelection = {
  id: notes.id,
  folderId: notes.folderId,
  title: notes.title,
  documentType: notes.documentType,
  type: notes.type,
  isApiEditable: notes.isApiEditable,
  updatedByActorType: notes.updatedByActorType,
  updatedByActorId: notes.updatedByActorId,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};
