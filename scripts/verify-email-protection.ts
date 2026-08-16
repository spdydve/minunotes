import { createIdentityHasher, normalizeEmail } from '@minunotes/email-protection';
import { libsql } from '../src/api/db/client';
import { getApiRuntimeConfig } from '../src/api/lib/env';

const baseUrl = (process.env.EMAIL_PROTECTION_TEST_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const environment = process.env.ENVIRONMENT || 'local';

if (environment === 'production' && process.env.EMAIL_PROTECTION_ALLOW_PRODUCTION_TEST !== 'true') {
  throw new Error('Production verification requires EMAIL_PROTECTION_ALLOW_PRODUCTION_TEST=true');
}

const email = process.env.EMAIL_PROTECTION_TEST_EMAIL || `email-protection-${Date.now()}@mailinator.com`;
const clientAddress = '203.0.113.10';
const attempts = Number(process.env.EMAIL_PROTECTION_TEST_ATTEMPTS || '1');
const url = `${baseUrl}/internal/auth/email-otp/send-verification-otp`;

console.log('Email protection verification');
console.log({ environment, baseUrl, attempts });

try {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': clientAddress },
      body: JSON.stringify({ email, type: 'sign-in' }),
    });
    console.log({ attempt, status: response.status, body: await response.text() });
  }
} finally {
  if (process.env.EMAIL_PROTECTION_KEEP_TEST_STATE !== 'true') {
    const runtime = getApiRuntimeConfig();
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      const hashIdentity = createIdentityHasher(
        runtime.emailProtection.hashSecret || 'local-development-email-protection-secret'
      );
      await Promise.all([
        libsql.execute({
          sql: 'DELETE FROM email_protection_verdicts WHERE email_key = ?',
          args: [hashIdentity('email', normalizedEmail)],
        }),
        libsql.execute({
          sql: 'DELETE FROM email_protection_rate_limits WHERE bucket_key IN (?, ?)',
          args: [hashIdentity('rate', `email:${normalizedEmail}`), hashIdentity('rate', `client:${clientAddress}`)],
        }),
        libsql.execute({
          sql: 'DELETE FROM email_protection_client_reputation WHERE client_key = ?',
          args: [hashIdentity('client', clientAddress)],
        }),
      ]);
      console.log('Cleaned up verification state.');
    }
  }
  libsql.close();
}
