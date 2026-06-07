export type PutObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
};

export type StoredObject = {
  body: Uint8Array;
  contentType?: string;
};

export interface ObjectStorage {
  provider: string;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(input: { key: string }): Promise<StoredObject | null>;
  deleteObject(input: { key: string }): Promise<void>;
  createSignedUploadUrl?(input: { key: string; contentType: string; expiresInSeconds: number }): Promise<string>;
  objectExists?(input: { key: string }): Promise<boolean>;
}
