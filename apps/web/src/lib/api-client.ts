import {
  createRecordSchema,
  depositReceiptSchema,
  healthResponseSchema,
  loginResponseSchema,
  paginatedSchema,
  problemDetailsSchema,
  publicVerificationSchema,
  readinessResponseSchema,
  recordSummarySchema,
  registerSchema,
  type CreateRecordInput,
  type DepositReceipt,
  type HealthResponse,
  type LoginInput,
  type LoginResponse,
  type ProblemDetails,
  type PublicVerification,
  type ReadinessResponse,
  type RecordSummary,
  type RegisterInput,
  userSummarySchema,
  type UserSummary,
} from '@alims/contracts';
import { z } from 'zod';

/**
 * Typed API client.
 *
 * Relative URLs only — the browser must call its own origin; Next.js
 * proxies to the API. Never target localhost from browser code.
 * Refresh tokens stay in the httpOnly cookie (PRD §9.1). Access tokens
 * are held in memory by the session store, never localStorage.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let memoryAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

const lineageNodeSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  nxrId: z.string().nullable().optional(),
  outputType: z.string().optional(),
  status: z.string().optional(),
});

const lineageEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relType: z.string(),
  evidenceState: z.string().optional(),
});

export const lineageGraphSchema = z.object({
  nodes: z.array(lineageNodeSchema),
  edges: z.array(lineageEdgeSchema),
});
export type LineageGraph = z.infer<typeof lineageGraphSchema>;

const recordSchemaField = z.object({
  name: z.string(),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  visibility: z.string().optional(),
  help: z.string().optional(),
});
export const recordFieldSchemaResponse = z.object({
  fields: z.array(recordSchemaField),
});
export type RecordFieldSchemaResponse = z.infer<typeof recordFieldSchemaResponse>;

const paginatedRecords = paginatedSchema(recordSummarySchema);

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  parse: (data: unknown) => T,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAccessToken) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 204) {
    return parse(null);
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const problem = problemDetailsSchema.safeParse(body);
    throw new ApiError(
      res.status,
      problem.success ? problem.data : null,
      problem.success ? problem.data.detail : `Request failed (${res.status})`,
    );
  }

  return parse(body);
}

export const api = {
  health: () => request('/health', { method: 'GET' }, (d) => healthResponseSchema.parse(d)),
  ready: () => request('/health/ready', { method: 'GET' }, (d) => readinessResponseSchema.parse(d)),

  auth: {
    register: (input: RegisterInput) =>
      request(
        '/auth/register',
        { method: 'POST', body: JSON.stringify(registerSchema.parse(input)) },
        (d) =>
          z.object({ user: userSummarySchema, verificationEmailSent: z.literal(true) }).parse(d),
      ),
    login: async (input: LoginInput): Promise<LoginResponse> => {
      const result = await request(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(input) },
        (d) => loginResponseSchema.parse(d),
      );
      if (!result.mfaRequired) {
        setAccessToken(result.accessToken);
      }
      return result;
    },
    me: () =>
      request('/auth/me', { method: 'GET' }, (d) => userSummarySchema.parse(d) as UserSummary),
    logout: async () => {
      await request('/auth/logout', { method: 'POST' }, () => null);
      setAccessToken(null);
    },
  },

  records: {
    list: (query?: { scope?: 'mine' | 'institution' | 'assigned'; limit?: number }) => {
      const params = new URLSearchParams();
      if (query?.scope) params.set('scope', query.scope);
      if (query?.limit) params.set('limit', String(query.limit));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request(`/records${suffix}`, { method: 'GET' }, (d) => paginatedRecords.parse(d));
    },
    get: (id: string) =>
      request(`/records/${id}`, { method: 'GET' }, (d) => recordSummarySchema.parse(d)),
    create: (input: CreateRecordInput) =>
      request(
        '/records',
        { method: 'POST', body: JSON.stringify(createRecordSchema.parse(input)) },
        (d) => recordSummarySchema.parse(d),
      ),
    schema: () =>
      request('/records/schema', { method: 'GET' }, (d) => recordFieldSchemaResponse.parse(d)),
    lineage: (id: string, depth = 2) =>
      request(`/records/${id}/lineage?depth=${depth}`, { method: 'GET' }, (d) =>
        lineageGraphSchema.parse(d),
      ),
  },

  public: {
    verify: (qrToken: string) =>
      request(`/public/verify/${encodeURIComponent(qrToken)}`, { method: 'GET' }, (d) =>
        publicVerificationSchema.parse(d),
      ),
  },

  uploads: {
    status: (uploadId: string) =>
      request(`/uploads/${uploadId}/status`, { method: 'GET' }, (d) =>
        z
          .object({
            scanStatus: z.string(),
            checksumStatus: z.string().optional(),
            progressPercent: z.number(),
            message: z.string().optional(),
          })
          .parse(d),
      ),
  },

  receipts: {
    parse: (data: unknown): DepositReceipt => depositReceiptSchema.parse(data),
  },
};

export type { HealthResponse, ReadinessResponse, RecordSummary, PublicVerification };
