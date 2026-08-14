type AwsRequestContext = {
  http?: { sourceIp?: string };
  identity?: { sourceIp?: string };
};

export function getTrustedAwsClientAddress(requestContext?: AwsRequestContext) {
  return requestContext?.http?.sourceIp?.trim() || requestContext?.identity?.sourceIp?.trim() || undefined;
}

export function getLocalClientAddress(headers: Headers) {
  if (process.env.ENVIRONMENT !== 'local') return undefined;
  return headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
}

export function getTrustedClientAddress(options: { requestContext?: AwsRequestContext; headers: Headers }) {
  return getTrustedAwsClientAddress(options.requestContext) ?? getLocalClientAddress(options.headers);
}

export const TRUSTED_CLIENT_ADDRESS_HEADER = 'x-minunotes-client-address';
