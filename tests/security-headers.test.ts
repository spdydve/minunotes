import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { securityHeadersMiddleware } from '../src/api/middleware/security-headers';

function createApp() {
  const app = new Hono();
  app.use('*', securityHeadersMiddleware);
  app.get('*', (c) => c.text('ok'));
  return app;
}

describe('security headers', () => {
  it('allows attachment content to be embedded by the web app on another origin', async () => {
    const response = await createApp().request('/internal/attachments/att_123/content');

    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it.each([
    '/internal/share/token/attachments/att_123/content',
    '/internal/share/folders/token/notes/note_123/attachments/att_123/content',
  ])('allows share-scoped attachment content across origins: %s', async (path) => {
    const response = await createApp().request(path);

    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('keeps other responses same-origin', async () => {
    const response = await createApp().request('/internal/notes/note_123');

    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });
});
