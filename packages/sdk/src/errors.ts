export class NotesApiError extends Error {
  readonly name = "NotesApiError";

  constructor(
    message: string,
    readonly status: number,
    readonly response?: unknown,
  ) {
    super(message);
  }
}

export class NotesConfigurationError extends Error {
  readonly name = "NotesConfigurationError";
}
