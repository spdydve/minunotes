import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { user } from '../db/schema';
import type { auth } from '../lib/auth';
import { serializeCollaborationUserIdentity } from '../lib/collaboration-identity';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
};

export const accountRoutes = new Hono<{ Variables: Variables }>();

accountRoutes.get('/profile', async (c) => {
  const currentUser = c.get('user');
  if (!currentUser) return c.json({ error: 'Unauthorized' }, 401);

  const [profile] = await db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image })
    .from(user)
    .where(eq(user.id, currentUser.id))
    .limit(1);
  if (!profile) return c.json({ error: 'Unauthorized' }, 401);

  return c.json({
    profile: {
      identity: serializeCollaborationUserIdentity({ ...profile, currentUserId: profile.id }),
      email: profile.email,
      imageUrl: profile.image,
    },
  });
});
