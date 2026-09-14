import { z } from 'zod';
import { institutionStatusSchema } from './enums';
import { paginationQuerySchema, paginatedSchema } from './common';

/** Institutions — api_specification.md §4. */

export const institutionCategorySchema = z.enum([
  'university',
  'polytechnic',
  'college',
  'research_institute',
  'other',
]);
export type InstitutionCategory = z.infer<typeof institutionCategorySchema>;

const emailSchema = z.string().email().max(320);
const countryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, 'ISO 3166-1 alpha-2 country code')
  .transform((value) => value.toUpperCase());
const domainSchema = z
  .string()
  .min(4)
  .max(253)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'a valid domain, e.g. university.edu');

export const createInstitutionSchema = z.object({
  legalName: z.string().min(4).max(300),
  displayName: z.string().min(2).max(200),
  countryCode: countryCodeSchema,
  category: institutionCategorySchema,
  officialDomain: domainSchema,
  representativeEmail: emailSchema,
  privacyContactEmail: emailSchema,
  academicContactEmail: emailSchema,
  libraryContactEmail: emailSchema.optional(),
  branding: z
    .object({
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      logoUrl: z.string().url().optional(),
    })
    .optional(),
});
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;

export const updateInstitutionSchema = z.object({
  legalName: z.string().min(4).max(300).optional(),
  displayName: z.string().min(2).max(200).optional(),
  officialDomain: domainSchema.optional(),
  representativeEmail: emailSchema.optional(),
  privacyContactEmail: emailSchema.optional(),
  academicContactEmail: emailSchema.optional(),
  libraryContactEmail: emailSchema.optional(),
  branding: z
    .object({
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
      logoUrl: z.string().url().nullish(),
    })
    .optional(),
});
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;

export const institutionStatusChangeSchema = z.object({
  status: institutionStatusSchema.exclude(['pending_verification']),
  note: z.string().max(500).optional(),
});
export type InstitutionStatusChangeInput = z.infer<typeof institutionStatusChangeSchema>;

export const institutionSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  slug: z.string(),
  countryCode: z.string(),
  category: z.string(),
  status: institutionStatusSchema,
});
export type InstitutionSummary = z.infer<typeof institutionSummarySchema>;

export const institutionDetailSchema = institutionSummarySchema.extend({
  legalName: z.string(),
  officialDomain: z.string(),
  branding: z.object({
    primaryColor: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  previousNames: z.array(z.object({ name: z.string(), changedAt: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InstitutionDetail = z.infer<typeof institutionDetailSchema>;

export const institutionListQuerySchema = paginationQuerySchema.extend({
  status: institutionStatusSchema.optional(),
  country: countryCodeSchema.optional(),
  q: z.string().max(200).optional(),
});
export type InstitutionListQuery = z.infer<typeof institutionListQuerySchema>;

export const paginatedInstitutionsSchema = paginatedSchema(institutionSummarySchema);
