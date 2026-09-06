import type { ErrorCode } from './error-codes.js';
import type { PaginationMeta } from './pagination.js';

/**
 * Standard response envelopes. Spec §38 (success) and §91 (failure).
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  message: string;
  error: { code: ErrorCode };
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
