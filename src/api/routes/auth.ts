import { Hono } from 'hono';
import { auth } from '../lib/auth';

export const authRoutes = new Hono();

authRoutes.all('*', (c) => auth.handler(c.req.raw));
