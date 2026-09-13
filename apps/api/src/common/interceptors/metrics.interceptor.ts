import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsController } from '../../health/metrics.controller.js';

/**
 * Prometheus HTTP instrumentation (8_Phase.md §1.5 item 34): records every
 * request's duration + status into the rentuz_http_* metrics on the shared
 * MetricsController registry. Cardinality guard: routes are recorded at the
 * TEMPLATE level (e.g. /api/v1/properties/:id), not the raw URL, so UUIDs
 * cannot explode the label space.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsController) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { route?: { path?: string } }>();
    const response = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    const route = request.route?.path ?? request.path ?? 'unknown';
    const method = request.method ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: () => this.record(route, method, response.statusCode, start),
        error: () => this.record(route, method, response.statusCode, start),
      }),
    );
  }

  private record(route: string, method: string, status: number, start: bigint): void {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    this.metrics.httpDuration.observe({ route, method, status: String(status) }, seconds);
    this.metrics.httpTotal.inc({ route, method, status: String(status) });
  }
}
