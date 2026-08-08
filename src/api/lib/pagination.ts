export type PageRequest = {
  page: number;
  limit: number;
  offset: number;
};

export type PageMetadata = {
  page: number;
  limit: number;
  hasMore: boolean;
};

export function parsePageRequest(
  pageValue: string | undefined,
  limitValue: string | undefined,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): PageRequest {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 100;
  const parsedPage = Number(pageValue);
  const parsedLimit = Number(limitValue);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, maxLimit) : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}

export function pageRows<T>(rows: T[], request: PageRequest) {
  const hasMore = rows.length > request.limit;
  return {
    items: hasMore ? rows.slice(0, request.limit) : rows,
    page: request.page,
    limit: request.limit,
    hasMore,
  };
}
