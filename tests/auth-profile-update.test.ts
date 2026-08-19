import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authHandler = vi.fn(async (request: Request) => Response.json(await request.json()));

beforeEach(() => {
  vi.resetModules();
  authHandler.mockClear();
  vi.doMock('../src/api/lib/auth', () => ({ auth: { handler: authHandler } }));
});

describe('profile update authentication route', () => {
  it('normalizes display names before forwarding them to Better Auth', async () => {
    const { authRoutes } = await import('../src/api/routes/auth');
    const app = new Hono().route('/auth', authRoutes);

    const response = await app.request(
      '/auth/update-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '  Taylor   Kennedy  ' }),
      },
      { requestContext: {} }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'Taylor Kennedy' });
    expect(authHandler).toHaveBeenCalledOnce();
  });

  it.each([
    { name: 'a'.repeat(61) },
    { name: 'Taylor\u202eKennedy' },
    { name: null },
  ])('rejects an invalid display name without forwarding it', async (body) => {
    const { authRoutes } = await import('../src/api/routes/auth');
    const app = new Hono().route('/auth', authRoutes);

    const response = await app.request(
      '/auth/update-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      { requestContext: {} }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_DISPLAY_NAME' });
    expect(authHandler).not.toHaveBeenCalled();
  });
});
