import { publicSearchFiltersSchema, paginationQuerySchema } from '@alims/contracts';

/**
 * Combined query schema for GET /public/search: the 14 PRD §6.10 filter
 * dimensions plus the shared cursor-pagination envelope. Unknown keys are
 * dropped by the parser; malformed values fail closed with a 422.
 */
export const publicSearchQuerySchema = paginationQuerySchema.merge(publicSearchFiltersSchema);
