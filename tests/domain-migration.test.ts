import { describe, expect, it } from 'vitest';
import {
  getLegacyWebRedirectInjection,
  getProductionDomainMigrationConfig,
  parseDomainMigrationPhase,
  productionDomains,
} from '../src/infra/domain-migration';

describe('production domain migration', () => {
  it('expands onto the new domains while keeping the legacy origins canonical', () => {
    expect(getProductionDomainMigrationConfig('expand')).toEqual({
      phase: 'expand',
      canonical: productionDomains.legacy,
      web: {
        name: productionDomains.legacy.web,
        aliases: [productionDomains.target.web],
        redirectLegacy: false,
      },
      allowedWebOrigins: [productionDomains.legacy.web, productionDomains.target.web],
      keepLegacyApiDomain: true,
    });
  });

  it('cuts over canonical origins while keeping compatibility resources', () => {
    expect(getProductionDomainMigrationConfig('cutover')).toEqual({
      phase: 'cutover',
      canonical: productionDomains.target,
      web: {
        name: productionDomains.target.web,
        aliases: [productionDomains.legacy.web],
        redirectLegacy: true,
      },
      allowedWebOrigins: [productionDomains.target.web, productionDomains.legacy.web],
      keepLegacyApiDomain: true,
    });
  });

  it('contracts onto only the target domains', () => {
    expect(getProductionDomainMigrationConfig('contract')).toEqual({
      phase: 'contract',
      canonical: productionDomains.target,
      web: {
        name: productionDomains.target.web,
        aliases: [],
        redirectLegacy: false,
      },
      allowedWebOrigins: [productionDomains.target.web],
      keepLegacyApiDomain: false,
    });
  });

  it('requires a recognized phase', () => {
    expect(parseDomainMigrationPhase(' CUTOVER ')).toBe('cutover');
    expect(() => parseDomainMigrationPhase()).toThrow('DOMAIN_MIGRATION_PHASE');
    expect(() => parseDomainMigrationPhase('complete')).toThrow('DOMAIN_MIGRATION_PHASE');
  });

  it('redirects the legacy web host while preserving paths and query parameters', async () => {
    const runInjection = new Function(
      'event',
      `return (async () => { ${getLegacyWebRedirectInjection()} return event.request; })();`
    ) as (event: unknown) => Promise<unknown>;

    await expect(
      runInjection({
        request: {
          uri: '/notes/note_abc',
          headers: { host: { value: productionDomains.legacy.web } },
          querystring: {
            review: { value: 'open' },
            tag: { multiValue: [{ value: 'one' }, { value: 'two%20words' }] },
          },
        },
      })
    ).resolves.toMatchObject({
      statusCode: 308,
      headers: {
        location: {
          value: `https://${productionDomains.target.web}/notes/note_abc?review=open&tag=one&tag=two%20words`,
        },
      },
    });
  });
});
