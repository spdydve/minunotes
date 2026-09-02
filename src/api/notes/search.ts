export function buildLiteralFtsPrefixQuery(query: string) {
  return `"${query.replaceAll('"', '""')}"*`;
}
