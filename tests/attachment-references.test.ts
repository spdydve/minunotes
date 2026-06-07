import { describe, expect, it } from "vitest";
import { extractAppAttachmentIds } from "../apps/api/src/attachments/references";

describe("attachment markdown references", () => {
  it("extracts unique app-owned attachment ids from image markdown", () => {
    const markdown = "![one](/api/attachments/att_abc123/content)\n\n![dupe](/api/attachments/att_abc123/content?download=1)\n";
    expect(extractAppAttachmentIds(markdown)).toEqual(["att_abc123"]);
  });

  it("extracts app-owned attachment ids from absolute URLs", () => {
    const markdown = "![img](https://notes.example.com/api/attachments/att_xyz789/content)";
    expect(extractAppAttachmentIds(markdown)).toEqual(["att_xyz789"]);
  });

  it("ignores external image URLs and non-attachment links", () => {
    const markdown = "![external](https://example.com/image.png)\n[api](/api/not-attachments/att_nope/content)";
    expect(extractAppAttachmentIds(markdown)).toEqual([]);
  });

  it("extracts linked attachment URLs as well as image URLs", () => {
    const markdown = "[download](/api/attachments/att_file123/content)";
    expect(extractAppAttachmentIds(markdown)).toEqual(["att_file123"]);
  });
});
