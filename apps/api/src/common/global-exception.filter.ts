import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorCode } from '@rentuz/contracts';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

/**
 * Renders every thrown error in the standard failure envelope (§91) with a
 * request id from pino-http.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor() {
    /* no DI dependencies — filter is registered through APP_FILTER and gets
       instantiated before nestjs-pino's PinoLogger is fully bound. */
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
    const message =
      exception instanceof HttpException ? this.extractMessage(exception) : 'Internal server error';
    const requestId = (request as { id?: string }).id;

    if (status >= 500) {
      this.logger.error({ err: exception, status, requestId }, message);
    } else {
      this.logger.warn({ status, requestId }, message);
    }

    response.status(status).json({
      success: false,
      message,
      error: { code },
      ...(requestId ? { requestId } : {}),
    });
  }

  private extractMessage(exception: HttpException): string {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message: unknown }).message;
      return Array.isArray(m) ? m.join('; ') : String(m);
    }
    return exception.message;
  }
}
