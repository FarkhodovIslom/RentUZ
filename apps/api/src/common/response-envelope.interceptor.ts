import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { isEnveloped, okEnvelope } from './envelope.js';

/**
 * Wraps every successful handler response in the standard envelope (§38).
 * Controllers that need `meta` (pagination) return `okEnvelope(data, meta)`
 * themselves — the interceptor passes those through untouched.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => (isEnveloped(data) ? data : okEnvelope(data))));
  }
}
