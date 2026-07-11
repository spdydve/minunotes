import { createMiddleware } from 'hono/factory';

export type RequestSizeLimitOptions = {
  maxBytes: number;
};

function getContentLength(headers: Headers) {
  const raw = headers.get('content-length');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isRequestBodyTooLarge(contentLength: number | null, maxBytes: number, actualBytes?: number) {
  if (contentLength !== null && contentLength > maxBytes) return true;
  if (actualBytes !== undefined && actualBytes > maxBytes) return true;
  return false;
}

export function createRequestSizeLimitMiddleware({ maxBytes }: RequestSizeLimitOptions) {
  return createMiddleware(async (c, next) => {
    if (!['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      await next();
      return;
    }

    const contentLength = getContentLength(c.req.raw.headers);
    if (isRequestBodyTooLarge(contentLength, maxBytes)) {
      return c.json({ error: 'Request body too large' }, 413);
    }

    const body = await c.req.raw.clone().arrayBuffer();
    if (isRequestBodyTooLarge(contentLength, maxBytes, body.byteLength)) {
      return c.json({ error: 'Request body too large' }, 413);
    }

    await next();
  });
}
