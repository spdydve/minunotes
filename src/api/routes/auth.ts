import { Hono } from 'hono';
import { auth } from '../lib/auth';
import { validateCollaborationDisplayName } from '../lib/collaboration-identity';
import { getTrustedClientAddress, TRUSTED_CLIENT_ADDRESS_HEADER } from '../middleware/client-identity';

export const authRoutes = new Hono();

authRoutes.all('*', async (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(TRUSTED_CLIENT_ADDRESS_HEADER);
  const clientAddress = getTrustedClientAddress({
    headers,
    requestContext: (c.env as { requestContext?: { http?: { sourceIp?: string }; identity?: { sourceIp?: string } } })
      .requestContext,
  });
  if (clientAddress) headers.set(TRUSTED_CLIENT_ADDRESS_HEADER, clientAddress);

  let body: string | undefined;
  if (c.req.method === 'POST' && c.req.path.endsWith('/update-user')) {
    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = await c.req.raw.clone().json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    if ('name' in parsedBody) {
      const displayName = validateCollaborationDisplayName(parsedBody.name);
      if (!displayName.valid) {
        return c.json({ code: 'INVALID_DISPLAY_NAME', message: displayName.error }, 400);
      }
      parsedBody.name = displayName.value;
    }
    headers.delete('content-length');
    body = JSON.stringify(parsedBody);
  }

  return auth.handler(new Request(c.req.raw, { headers, body }));
});
