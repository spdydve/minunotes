export function isPublicResourcePath(pathname: string) {
  return pathname === '/resources' || pathname.startsWith('/resources/');
}
