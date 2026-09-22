import type { PaginationMeta } from '@poultry/shared-types';

export interface PaginateParams {
  page: number;
  pageSize: number;
  total: number;
}

export function paginate({ page, pageSize, total }: PaginateParams): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}