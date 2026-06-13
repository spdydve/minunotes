export type ActorType = "user" | "agent" | "system";
export type NoteType = "note" | "template";

export type Folder = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  folderId: string;
  title: string;
  content: string;
  type: NoteType;
  isApiEditable: boolean;
  updatedByActorType: ActorType | null;
  updatedByActorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteResponse = { note: Note; contentHash: string };
export type NoteStatus = { noteId: string; contentHash: string; updatedAt: string };
export type NoteEvent = { id: string; noteId: string; userId: string; actorType: ActorType; actorId: string | null; eventType: string; summary: string; beforeHash: string | null; afterHash: string | null; createdAt: string };
export type NoteEventsResponse = { noteId: string; events: NoteEvent[] };
export type SearchNote = Note & { folderTitle: string };

export type DocumentEdit =
  | { type: "append"; text: string }
  | { type: "replace_text"; oldText: string; newText: string }
  | { type: "replace_range"; from: number; to: number; text: string };

export type DocumentSection = {
  id: string;
  heading: string;
  level: number;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
};

export type LineRangeInput = { from?: number; to?: number };
export type LineSearchInput = { query: string; folderId?: string; context?: number; limit?: number; caseSensitive?: boolean };
export type NumberedLine = { line: number; text: string };
export type LineSearchMatch = {
  noteId?: string;
  folderId?: string;
  title?: string;
  line: number;
  column: number;
  text: string;
  before: NumberedLine[];
  after: NumberedLine[];
};
export type LineSearchResponse = { query: string; matches: LineSearchMatch[] };

export type SectionResponse = {
  noteId: string;
  contentHash: string;
  section: DocumentSection & { markdown: string; content: string };
};

export type CreateNoteInput = {
  title?: string;
  content?: string;
  type?: NoteType;
};

export type UpdateNoteInput = Partial<Pick<Note, "title" | "content" | "folderId" | "isApiEditable">> & {
  baseHash?: string;
};

export type CreateFolderInput = { title: string };
export type UpdateFolderInput = { title: string };
