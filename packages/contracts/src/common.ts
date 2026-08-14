import { z } from 'zod';

/** Shared envelopes and primitives. Mirrors api_specification.md §1. */

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime();

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  limit: z.number().int(),
});

/** Collection response envelope: `{ data, pagination }`. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), pagination: paginationMetaSchema });
}

/**
 * RFC 9457 Problem Details.
 * PRD §9.1: `detail` must be safe plain language and never leak internals.
 */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  requestId: z.string(),
  errors: z
    .array(z.object({ field: z.string(), code: z.string(), message: z.string() }))
    .optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptime: z.number(),
  timestamp: isoDateTimeSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.enum(['up', 'down', 'unknown']),
    redis: z.enum(['up', 'down', 'unknown']),
    storage: z.enum(['up', 'down', 'unknown']),
  }),
  timestamp: isoDateTimeSchema,
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
