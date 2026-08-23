import { ZodError } from 'zod';

/**
 * Typed domain errors for the Records module.
 *
 * The controller maps these to RFC 9457 Problem Details responses. Messages
 * are always safe plain-language (PRD §9.1) and never leak internals.
 */
export class RecordsDomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly errors?: Array<{ field: string; code: string; message: string }>,
  ) {
    super(message);
    this.name = 'RecordsDomainError';
  }

  static notFound(): RecordsDomainError {
    return new RecordsDomainError(404, 'NOT_FOUND', 'Record not found.');
  }

  static notDraft(): RecordsDomainError {
    return new RecordsDomainError(
      409,
      'NOT_DRAFT',
      'Only a draft can be edited directly. Submitted or published records must progress via a new version.',
    );
  }

  static validation(
    issues: ZodError['issues'],
    _input: unknown,
  ): RecordsDomainError {
    const errors = issues.map((issue) => ({
      field: String(issue.path.join('.') || '(root)'),
      code: issue.code.toUpperCase(),
      message: issue.message,
    }));
    return new RecordsDomainError(422, 'VALIDATION', 'One or more fields are invalid.', errors);
  }

  static submissionIncomplete(
    missing: Array<{ field: string; code: string; message: string }>,
  ): RecordsDomainError {
    return new RecordsDomainError(
      422,
      'SUBMISSION_INCOMPLETE',
      'The record is not ready to submit.',
      missing,
    );
  }
}
