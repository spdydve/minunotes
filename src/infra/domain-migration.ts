export const productionDomains = {
  legacy: {
    web: 'notes.dpklabs.com',
    api: 'api.notes.dpklabs.com',
    cookieDomain: 'notes.dpklabs.com',
  },
  target: {
    web: 'notes.minusculelabs.com',
    api: 'api.notes.minusculelabs.com',
    cookieDomain: 'notes.minusculelabs.com',
  },
} as const;

export type DomainMigrationPhase = 'expand' | 'cutover' | 'contract';

export type ProductionDomainMigrationConfig = {
  phase: DomainMigrationPhase;
  canonical: (typeof productionDomains)[keyof typeof productionDomains];
  web: {
    name: string;
    aliases: string[];
    redirectLegacy: boolean;
  };
  allowedWebOrigins: string[];
  keepLegacyApiDomain: boolean;
};

export function parseDomainMigrationPhase(value?: string): DomainMigrationPhase {
  const phase = value?.trim().toLowerCase();
  if (phase === 'expand' || phase === 'cutover' || phase === 'contract') return phase;
  throw new Error('DOMAIN_MIGRATION_PHASE must be set to expand, cutover, or contract for production deployments.');
}

export function getProductionDomainMigrationConfig(phase: DomainMigrationPhase): ProductionDomainMigrationConfig {
  if (phase === 'expand') {
    return {
      phase,
      canonical: productionDomains.legacy,
      web: {
        name: productionDomains.legacy.web,
        aliases: [productionDomains.target.web],
        redirectLegacy: false,
      },
      allowedWebOrigins: [productionDomains.legacy.web, productionDomains.target.web],
      keepLegacyApiDomain: true,
    };
  }

  if (phase === 'cutover') {
    return {
      phase,
      canonical: productionDomains.target,
      web: {
        name: productionDomains.target.web,
        aliases: [productionDomains.legacy.web],
        redirectLegacy: true,
      },
      allowedWebOrigins: [productionDomains.target.web, productionDomains.legacy.web],
      keepLegacyApiDomain: true,
    };
  }

  return {
    phase,
    canonical: productionDomains.target,
    web: {
      name: productionDomains.target.web,
      aliases: [],
      redirectLegacy: false,
    },
    allowedWebOrigins: [productionDomains.target.web],
    keepLegacyApiDomain: false,
  };
}

export function getLegacyWebRedirectInjection() {
  return `
if (event.request.headers.host && event.request.headers.host.value === '${productionDomains.legacy.web}') {
  var request = event.request;
  var queryParts = [];
  for (var key in request.querystring) {
    if (!Object.prototype.hasOwnProperty.call(request.querystring, key)) continue;
    var parameter = request.querystring[key];
    var values = parameter.multiValue || [parameter];
    for (var index = 0; index < values.length; index++) {
      queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(values[index].value || ''));
    }
  }
  var location = 'https://${productionDomains.target.web}' + request.uri;
  if (queryParts.length > 0) location += '?' + queryParts.join('&');
  return {
    statusCode: 308,
    statusDescription: 'Permanent Redirect',
    headers: {
      location: { value: location },
      'cache-control': { value: 'public, max-age=300' }
    }
  };
}
`;
}
