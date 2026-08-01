import { Hono } from 'hono';
import { buildResolverCacheKey, cachedJson } from '../middleware/shared-cache';
import { ResolverError, resolveWikilinks, type WikilinkResolution } from '../shared/wikilink-resolver';

export const sharedResolveRoutes = new Hono();

const MAX_TARGETS = 500;
const MAX_TARGET_LENGTH = 256;

type ResolveBody = {
  token?: unknown;
  targets?: unknown;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

sharedResolveRoutes.post('/resolve', async (c) => {
  let body: ResolveBody;
  try {
    body = (await c.req.json()) as ResolveBody;
  } catch {
    return c.json({ error: 'Malformed JSON body' }, 400);
  }

  if (typeof body.token !== 'string' || !body.token.trim()) {
    return c.json({ error: 'token is required' }, 400);
  }
  if (!isStringArray(body.targets)) {
    return c.json({ error: 'targets must be an array of strings' }, 400);
  }
  if (body.targets.length > MAX_TARGETS) {
    return c.json({ error: `Maximum ${MAX_TARGETS} targets allowed` }, 400);
  }
  for (const target of body.targets) {
    if (target.length > MAX_TARGET_LENGTH) {
      return c.json({ error: `Target exceeds ${MAX_TARGET_LENGTH} characters` }, 400);
    }
  }

  try {
    const token = body.token.trim();
    const result = await cachedJson({
      key: buildResolverCacheKey(token, body.targets as string[]),
      token,
      compute: async () => {
        const resolutions: WikilinkResolution[] = await resolveWikilinks(token, body.targets as string[]);
        return { resolutions };
      },
    });
    return c.json(result);
  } catch (error) {
    if (error instanceof ResolverError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    throw error;
  }
});
