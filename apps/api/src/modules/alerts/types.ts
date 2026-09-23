import type { Alert } from '@prisma/client';

export interface AlertListParams {
  unread?: boolean;
  type?: string;
  page: number;
  pageSize: number;
}

/** Alert wire shape — the Prisma row as-is (Decimal-free; timestamps are ISO strings). */
export type AlertResponse = Alert;