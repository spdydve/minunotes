import { afterEach, describe, expect, it } from 'vitest';
import {
  getLocalClientAddress,
  getTrustedAwsClientAddress,
  getTrustedClientAddress,
} from '../src/api/middleware/client-identity';

const originalEnvironment = process.env.ENVIRONMENT;

afterEach(() => {
  process.env.ENVIRONMENT = originalEnvironment;
});

describe('trusted client identity', () => {
  it('uses API Gateway request context instead of spoofable forwarding headers', () => {
    process.env.ENVIRONMENT = 'production';
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.20', 'x-real-ip': '198.51.100.21' });
    expect(getTrustedClientAddress({ headers, requestContext: { http: { sourceIp: '203.0.113.10' } } })).toBe(
      '203.0.113.10'
    );
    expect(getTrustedClientAddress({ headers })).toBeUndefined();
  });

  it('supports API Gateway v1 and bounded local forwarding headers', () => {
    expect(getTrustedAwsClientAddress({ identity: { sourceIp: '203.0.113.11' } })).toBe('203.0.113.11');

    process.env.ENVIRONMENT = 'local';
    expect(getLocalClientAddress(new Headers({ 'x-forwarded-for': '198.51.100.20, 10.0.0.1' }))).toBe('198.51.100.20');
  });

  it('returns no shared identity when the source is unavailable', () => {
    process.env.ENVIRONMENT = 'production';
    expect(getTrustedClientAddress({ headers: new Headers() })).toBeUndefined();
  });
});
