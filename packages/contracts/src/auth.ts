import { z } from 'zod';
import { memberRoleSchema } from './enums';
import { uuidSchema } from './common';

/** Auth contracts. Mirrors api_specification.md §3. */

export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(256);

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(120),
  locale: z.string().max(10).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const stepUpSchema = z.object({ totpCode: totpCodeSchema });
export type StepUpInput = z.infer<typeof stepUpSchema>;

/** Email verification (api_specification.md §3): the token from the email link. */
export const verifyEmailConfirmSchema = z.object({
  token: z.string().trim().min(20).max(200),
});
export type VerifyEmailConfirmInput = z.infer<typeof verifyEmailConfirmSchema>;


export const membershipSummarySchema = z.object({
  institutionId: uuidSchema,
  institutionName: z.string(),
  institutionSlug: z.string(),
  departmentId: uuidSchema.nullable(),
  programmeId: uuidSchema.nullable(),
  role: memberRoleSchema,
  status: z.enum(['active', 'pending', 'revoked']),
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export const userSummarySchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  identityLevel: z.enum(['unverified', 'email', 'identity_verified']),
  mfaEnabled: z.boolean(),
  /**
   * Active memberships in verified institutions. The client uses this to
   * pick the X-Institution-Id claim (there is no other way to discover it:
   * memberships are RLS-invisible without the claim).
   */
  memberships: z.array(membershipSummarySchema),
});
export type UserSummary = z.infer<typeof userSummarySchema>;
export const verifyEmailConfirmResponseSchema = z.object({
  user: userSummarySchema,
});
export type VerifyEmailConfirmResponse = z.infer<typeof verifyEmailConfirmResponseSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: userSummarySchema,
  mfaRequired: z.boolean(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * PRD §9.1: high-impact actions require a fresh step-up assertion.
 * Listed here so API and web cannot disagree about which actions qualify.
 */
export const STEP_UP_REQUIRED_ACTIONS = [
  'certificate.issue',
  'certificate.revoke',
  'institution.status.change',
  'member.role.change',
  'restricted.data.export',
  'record.verify',
] as const;
export type StepUpAction = (typeof STEP_UP_REQUIRED_ACTIONS)[number];
