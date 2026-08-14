import { createHmac } from 'node:crypto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 320 ? email : null;
}

export function normalizeClientAddress(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function createIdentityHasher(secret: string) {
  if (secret.length < 32) throw new Error('Identity hash secret must contain at least 32 characters');

  return (namespace: 'email' | 'client' | 'rate', value: string) =>
    createHmac('sha256', secret).update(`${namespace}:${value}`).digest('hex');
}
