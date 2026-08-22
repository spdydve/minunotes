export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectRasterImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif';
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function validateImageBytes(input: { bytes: Uint8Array; claimedMimeType: string }) {
  if (!ALLOWED_IMAGE_TYPES.has(input.claimedMimeType)) return { ok: false, error: 'Unsupported image type' } as const;
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: 'Image is too large' } as const;
  if (input.bytes.byteLength === 0) return { ok: false, error: 'Image is empty' } as const;
  const detectedMimeType = detectRasterImageType(input.bytes);
  if (!detectedMimeType || detectedMimeType !== input.claimedMimeType)
    return { ok: false, error: 'Image content does not match its declared type' } as const;
  return { ok: true, detectedMimeType, size: input.bytes.byteLength } as const;
}
