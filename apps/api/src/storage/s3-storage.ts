import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./object-storage";

export type S3ObjectStorageOptions = {
  bucket: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  provider?: "s3" | "s3-compatible";
};

export class S3ObjectStorage implements ObjectStorage {
  provider: string;
  private client: S3Client;

  constructor(private options: S3ObjectStorageOptions) {
    this.provider = options.provider ?? "s3";
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
    });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }));
  }

  async getObject(input: { key: string }): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
      }));

      const body = result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
      return { body, contentType: result.ContentType };
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && (error.name === "NoSuchKey" || error.name === "NotFound")) return null;
      throw error;
    }
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
    }));
  }

  async createSignedUploadUrl(input: { key: string; contentType: string; expiresInSeconds: number }): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
      ContentType: input.contentType,
    }), { expiresIn: input.expiresInSeconds });
  }

  async objectExists(input: { key: string }): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
      }));
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && (error.name === "NoSuchKey" || error.name === "NotFound" || error.name === "NotFoundError")) return false;
      throw error;
    }
  }
}
