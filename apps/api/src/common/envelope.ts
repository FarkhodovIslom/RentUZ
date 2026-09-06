import type { PaginationMeta } from '@rentuz/contracts';

export interface EnvelopeSuccess<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

/** Build a success envelope directly (used by paginated endpoints). */
export function okEnvelope<T>(data: T, meta?: PaginationMeta, message = 'OK'): EnvelopeSuccess<T> {
  return meta ? { success: true, data, message, meta } : { success: true, data, message };
}

/** Anything already carrying a boolean `success` is treated as enveloped. */
export function isEnveloped(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as { success: unknown }).success === 'boolean'
  );
}
