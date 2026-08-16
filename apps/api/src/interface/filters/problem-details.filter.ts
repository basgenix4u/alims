import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ProblemDetails } from '@alims/contracts';

/**
 * Converts every error into RFC 9457 Problem Details.
 *
 * PRD §9.1: "communicate safely during security or processing failures
 * without exposing sensitive system details." Unexpected errors are logged
 * with full context server-side but returned to the client as a generic
 * message plus a correlation id.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred. Please try again or contact support with the request id.';

    if (isHttp) {
      const body = exception.getResponse();
      title = exception.name;
      detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message as string) ?? exception.message;
      if (Array.isArray(detail)) detail = detail.join('; ');
    } else {
      // Never surface stack traces or driver errors to the client.
      this.logger.error(
        `Unhandled exception on ${req.method} ${req.url} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const problem: ProblemDetails = {
      type: `https://alims.org/errors/${status}`,
      title,
      status,
      detail,
      instance: req.url,
      requestId,
    };

    res.setHeader('X-Request-Id', requestId);
    res.status(status).json(problem);
  }
}
