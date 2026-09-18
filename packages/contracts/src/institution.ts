import { z } from 'zod';
import { institutionStatusSchema, memberRoleSchema, membershipStatusSchema } from './enums';
import { paginationQuerySchema, paginatedSchema, uuidSchema } from './common';

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

// ── Members (api_specification.md §4 "Members") ───────────────────────────

export const memberSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  role: memberRoleSchema,
  status: membershipStatusSchema,
  departmentId: uuidSchema.nullable(),
  programmeId: uuidSchema.nullable(),
  createdAt: z.string(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberListQuerySchema = paginationQuerySchema.extend({
  role: memberRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
  /** Free-text search over email and display name. */
  q: z.string().trim().min(1).max(200).optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const paginatedMembersSchema = paginatedSchema(memberSchema);

/** Direct add: the person must already have an ALIMS account. */
export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: memberRoleSchema,
  departmentId: uuidSchema.optional(),
  programmeId: uuidSchema.optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

/**
 * Role/status change (step-up required at the route). At least one field.
 * Status transitions: pending→active, either→revoked; revoked is terminal.
 */
export const updateMemberSchema = z
  .object({
    role: memberRoleSchema.optional(),
    status: membershipStatusSchema.optional(),
    departmentId: uuidSchema.optional(),
    programmeId: uuidSchema.optional(),
  })
  .refine((input) => Object.values(input).some((v) => v !== undefined), {
    message: 'Provide at least one change (role, status, departmentId, programmeId).',
    path: [],
  });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/** Bulk invite — up to 500 emails, processed per-item, never all-or-nothing. */
export const bulkInviteItemSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: memberRoleSchema.default('student'),
  departmentId: uuidSchema.optional(),
  programmeId: uuidSchema.optional(),
});
export const bulkInviteSchema = z.object({
  invitations: z.array(bulkInviteItemSchema).min(1).max(500),
});
export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;

export const bulkInviteOutcomeSchema = z.enum(['invited', 'already_member', 'no_account']);
export const bulkInvitationResultSchema = z.object({
  email: z.string().email(),
  outcome: bulkInviteOutcomeSchema,
  member: memberSchema.nullable(),
});
export type BulkInvitationResult = z.infer<typeof bulkInvitationResultSchema>;

export const bulkInviteResponseSchema = z.object({
  invitations: z.array(bulkInvitationResultSchema),
});
export type BulkInviteResponse = z.infer<typeof bulkInviteResponseSchema>;
