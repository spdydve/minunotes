import { Hono } from 'hono';
import { auth } from '../lib/auth';
import { getTrustedClientAddress, TRUSTED_CLIENT_ADDRESS_HEADER } from '../middleware/client-identity';

export const authRoutes = new Hono();

authRoutes.all('*', (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(TRUSTED_CLIENT_ADDRESS_HEADER);
  const clientAddress = getTrustedClientAddress({
    headers,
    requestContext: (c.env as { requestContext?: { http?: { sourceIp?: string }; identity?: { sourceIp?: string } } })
      .requestContext,
  });
  if (clientAddress) headers.set(TRUSTED_CLIENT_ADDRESS_HEADER, clientAddress);
  return auth.handler(new Request(c.req.raw, { headers }));
});
