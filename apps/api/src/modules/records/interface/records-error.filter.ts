import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ProblemDetails } from '@alims/contracts';
import { RecordsDomainError } from '../application/records-errors';

/**
 * Module-scoped filter that emits RFC 9457 Problem Details for Records domain
 * errors, preserving the machine `code` and per-field `errors[]` that the
 * global filter would otherwise collapse (api_specification.md §1, PRD §6.2).
 */
@Catch(RecordsDomainError)
export class RecordsErrorFilter implements ExceptionFilter {
  catch(exception: RecordsDomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();

    const problem: ProblemDetails = {
      type: `https://alims.org/errors/${exception.status}`,
      title: exception.code,
      status: exception.status,
      detail: exception.message,
      instance: req.url,
      requestId,
      errors: exception.errors,
    };

    res.setHeader('X-Request-Id', requestId);
    res.status(exception.status).json(problem);
  }
}
