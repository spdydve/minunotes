import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./object-storage";

function safeJoin(root: string, key: string) {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(normalizedRoot, key);
  if (!target.startsWith(`${normalizedRoot}${path.sep}`) && target !== normalizedRoot) {
    throw new Error("Storage key escapes storage root");
  }
  return target;
}

export class FilesystemObjectStorage implements ObjectStorage {
  provider = "filesystem";

  constructor(private rootPath: string) {}

  async putObject(input: PutObjectInput): Promise<void> {
    const filePath = safeJoin(this.rootPath, input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(input.body));
    await writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType: input.contentType, metadata: input.metadata ?? {} }));
  }

  async getObject(input: { key: string }): Promise<StoredObject | null> {
    const filePath = safeJoin(this.rootPath, input.key);
    try {
      const [body, rawMeta] = await Promise.all([
        readFile(filePath),
        readFile(`${filePath}.meta.json`, "utf8").catch(() => null),
      ]);
      const meta = rawMeta ? JSON.parse(rawMeta) as { contentType?: string } : {};
      return { body: new Uint8Array(body), contentType: meta.contentType };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async deleteObject(input: { key: string }): Promise<void> {
    const filePath = safeJoin(this.rootPath, input.key);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(`${filePath}.meta.json`, { force: true }),
    ]);
  }
}
