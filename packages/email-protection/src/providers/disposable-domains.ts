import disposableDomains from 'disposable-email-domains' with { type: 'json' };
import type { DisposableEmailVerifier } from '../types.js';

const domainSet = new Set<string>(disposableDomains);

export function createDisposableEmailVerifier(domains: ReadonlySet<string> = domainSet): DisposableEmailVerifier {
  return {
    isDisposable(email) {
      const domain = email.split('@')[1]?.toLowerCase();
      return Boolean(domain && domains.has(domain));
    },
  };
}
