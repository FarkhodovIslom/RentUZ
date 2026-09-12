/**
 * Common error codes returned in the `error.code` field of every failure
 * envelope. Spec §91. Domain-specific codes are appended here as phases land.
 */
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const DOMAIN_ERROR_CODES = [
  'PROPERTY_NOT_FOUND',
  'PROPERTY_NOT_AVAILABLE',
  'DUPLICATE_PENDING_REQUEST',
  'INSUFFICIENT_PERMISSIONS',
  'CANNOT_CHAT_SELF',
  'CANNOT_REPORT_SELF',
  'REPORT_ALREADY_OPEN',
  'OWNER_SUSPENDED',
  // Phase 5 chat (§54/§94)
  'CONVERSATION_NOT_FOUND',
  'NOT_PARTICIPANT',
  'INVALID_TICKET',
  'INVALID_ATTACHMENT_KEY',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

import { z } from 'zod';

export const errorCodeSchema = z.enum(ERROR_CODES);
export const domainErrorCodeSchema = z.enum(DOMAIN_ERROR_CODES);

