import { createMiddleware } from 'hono/factory';

const ATTACHMENT_CONTENT_PATH =
  /^\/(?:internal|api)\/(?:attachments\/[^/]+|share\/[^/]+\/attachments\/[^/]+|share\/folders\/[^/]+\/notes\/[^/]+\/attachments\/[^/]+)\/content$/;

export const securityHeadersMiddleware = createMiddleware(async (c, next) => {
  await next();

  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Cross-Origin-Resource-Policy', ATTACHMENT_CONTENT_PATH.test(c.req.path) ? 'cross-origin' : 'same-origin');

  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});
