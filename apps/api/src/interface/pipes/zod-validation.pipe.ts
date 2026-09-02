import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Validates request bodies against the shared Zod contracts.
 *
 * Using `packages/contracts` as the runtime validator means the API cannot
 * accept a shape the frontend does not know about, and vice versa — the
 * spec is enforced rather than merely documented.
 *
 * Zod strips unknown keys, which also blocks mass-assignment: a client
 * cannot smuggle `identityLevel` or `mfaEnabled` into a registration body.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        // 422 with field-level detail, matching the ProblemDetails contract.
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.issues.map((issue) => ({
            field: issue.path.join('.') || '(root)',
            code: issue.code,
            message: issue.message,
          })),
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
