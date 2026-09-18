import {
  createRecordSchema,
  depositReceiptSchema,
  healthResponseSchema,
  loginResponseSchema,
  problemDetailsSchema,
  publicVerificationSchema,
  readinessResponseSchema,
  registerSchema,
  userSummarySchema,
  type CreateRecordInput,
  type DepositReceipt,
  type LoginInput,
  type LoginResponse,
  type ProblemDetails,
  type RegisterInput,
  type UserSummary,
} from '@alims/contracts';
import { z } from 'zod';

/**
 * Typed API client.
 *
 * Relative URLs only — the browser must call its own origin; Next.js
 * proxies to the API. Never target localhost from browser code. Refresh
 * tokens stay in the httpOnly cookie (PRD §9.1). Access tokens are held
 * in memory by the session store, never localStorage.
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

/**
 * The active institution claim (X-Institution-Id). In-memory like the
 * access token; the session provider reconciles it against the user's
 * live memberships after every login/me refresh.
 */
let activeInstitutionId: string | null = null;

export function setActiveInstitution(institutionId: string | null): void {
  activeInstitutionId = institutionId;
}

export function getActiveInstitution(): string | null {
  return activeInstitutionId;
}

// ── Client-side response shapes (matching the API exactly) ────────────────

/** The record entity the API returns (full shape; UI picks fields). */
const recordEntitySchema = z.object({
  id: z.string(),
  nxrId: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  outputType: z.string(),
  verificationLevel: z.string(),
  accessLevel: z.string(),
  abstract: z.string().nullable(),
  disciplines: z.array(z.string()),
  keywords: z.array(z.string()),
  researchYear: z.number().int().nullable(),
  institutionId: z.string().nullable(),
  ownerUserId: z.string(),
  embargoUntil: z.string().nullable(),
  updatedAt: z.string(),
});
export type RecordEntity = z.infer<typeof recordEntitySchema>;

const recordListSchema = z.object({
  items: z.array(recordEntitySchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

const versionSchema = z.object({
  id: z.string(),
  versionNo: z.number().int().positive(),
  changeSummary: z.string(),
  state: z.string(),
  fileName: z.string().nullable(),
  fileSizeBytes: z.number().int().nullable(),
  mimeType: z.string().nullable(),
  sha256: z.string().nullable(),
  scanStatus: z.string(),
  submittedBy: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  submittedAt: z.string().nullable(),
  isImmutable: z.boolean(),
  createdAt: z.string(),
});
export type Version = z.infer<typeof versionSchema>;

const uploadInitResponseSchema = z.object({
  uploadId: z.string(),
  parts: z.array(
    z.object({ partNumber: z.number().int().positive(), url: z.string(), expiresAt: z.string() }),
  ),
  partSizeBytes: z.number().int().positive(),
  maxFileSize: z.number().int().positive(),
  acceptedMimeTypes: z.array(z.string()),
});
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;

export type DepositReceiptView = DepositReceipt;

const uploadCompleteResponseSchema = z.object({
  versionId: z.string(),
  scanStatus: z.string(),
  receipt: depositReceiptSchema,
});

const uploadStatusSchema = z.object({
  scanStatus: z.string(),
  checksumStatus: z.string(),
  progressPercent: z.number().int(),
  message: z.string().nullable(),
});
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

const taskSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  recordTitle: z.string(),
  versionId: z.string(),
  versionNo: z.number().int().positive(),
  stage: z.string(),
  status: z.string(),
  dueAt: z.string().nullable(),
  isOverdue: z.boolean(),
  assignedAt: z.string(),
});
export type ReviewTaskView = z.infer<typeof taskSchema>;

const taskDetailSchema = taskSchema.extend({
  recordStatus: z.string(),
  outputType: z.string(),
  verificationLevel: z.string(),
  institutionId: z.string().nullable(),
  changeSummary: z.string().nullable(),
  fileName: z.string().nullable(),
  scanStatus: z.string(),
  contributors: z.array(
    z.object({ displayName: z.string(), isSupervision: z.boolean(), ackStatus: z.string() }),
  ),
  priorDecisions: z.array(
    z.object({
      decision: z.string(),
      comment: z.string(),
      decidedAt: z.string(),
      reviewerName: z.string(),
    }),
  ),
});
export type ReviewTaskDetailView = z.infer<typeof taskDetailSchema>;

const taskListSchema = z.object({
  data: z.array(taskSchema),
  pagination: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean(), limit: z.number() }),
});

const decisionResponseSchema = z.object({
  recordStatus: z.string(),
  nextStage: z.string().nullable(),
});

const verifyResponseSchema = z.object({
  recordStatus: z.string(),
  nxrId: z.string(),
  versionId: z.string(),
});

const certificateSchema = z.object({
  id: z.string(),
  certificateNo: z.string(),
  recordId: z.string(),
  recordTitle: z.string(),
  institutionName: z.string(),
  versionId: z.string(),
  versionNo: z.number().int().positive(),
  nxrId: z.string(),
  status: z.string(),
  verificationLevel: z.string(),
  outputType: z.string(),
  issuedBy: z.object({ id: z.string(), displayName: z.string() }),
  issuedAt: z.string(),
  supersededBy: z.string().nullable(),
  revokedReason: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type CertificateView = z.infer<typeof certificateSchema>;

const mfaEnrollResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  recoveryCodes: z.array(z.string()),
});

const mfaVerifyResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: userSummarySchema,
});

const stepUpResponseSchema = z.object({
  stepUpToken: z.string(),
  expiresIn: z.number(),
});

const submitResponseSchema = z.object({
  record: recordEntitySchema,
  taskId: z.string(),
});

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

// ── Request core: auth header, one automatic refresh-and-retry ────────────

async function rawRequest(path: string, init: RequestInit | undefined): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body && !(init?.body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAccessToken) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }
  if (activeInstitutionId) {
    headers.set('X-Institution-Id', activeInstitutionId);
  }
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include' });
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  parse: (data: unknown) => T,
  isRetry = false,
): Promise<T> {
  let res = await rawRequest(path, init);

  // A single transparent refresh-and-retry keeps sessions alive without
  // ever persisting tokens. The refresh endpoint itself must not recurse.
  if (res.status === 401 && !isRetry && !path.startsWith('/auth/refresh')) {
    const refreshed = await api.auth.refresh().catch(() => null);
    if (refreshed) {
      res = await rawRequest(path, init);
      return requestFromResponse(res, parse, path);
    }
  }

  return requestFromResponse(res, parse, path);
}

async function requestFromResponse<T>(res: Response, parse: (data: unknown) => T, path: string): Promise<T> {
  if (!res.ok) {
    const body = await parseBody(res);
    const problem = problemDetailsSchema.safeParse(body);
    throw new ApiError(
      res.status,
      problem.success ? problem.data : null,
      problem.success ? problem.data.detail : `Request failed (${res.status})`,
    );
  }
  void path;
  return parse(await parseBody(res));
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
        { method: 'POST', body: JSON.stringify(loginInputSchema.parse(input)) },
        (d) => loginResponseSchema.parse(d),
      );
      if (!result.mfaRequired) {
        setAccessToken(result.accessToken);
      }
      return result;
    },
    /** The limited-purpose token issued at login when MFA is enabled. */
    setMfaChallengeToken: (token: string) => setAccessToken(token),
    refresh: async (): Promise<LoginResponse | null> => {
      try {
        const result = await request(
          '/auth/refresh',
          { method: 'POST' },
          (d) => loginResponseSchema.parse(d),
          true,
        );
        if (result.mfaRequired) {
          // A challenge token cannot serve as a session; treat as anonymous.
          setAccessToken(null);
          return null;
        }
        setAccessToken(result.accessToken);
        return result;
      } catch {
        setAccessToken(null);
        return null;
      }
    },
    me: () =>
      request('/auth/me', { method: 'GET' }, (d) => userSummarySchema.parse(d) as UserSummary),
    logout: async () => {
      await request('/auth/logout', { method: 'POST' }, () => null);
      setAccessToken(null);
    },
    mfaEnroll: () =>
      request('/auth/mfa/enroll', { method: 'POST' }, (d) => mfaEnrollResponseSchema.parse(d)),
    mfaVerify: async (totpCode: string) => {
      const result = await request(
        '/auth/mfa/verify',
        { method: 'POST', body: JSON.stringify({ totpCode }) },
        (d) => mfaVerifyResponseSchema.parse(d),
      );
      setAccessToken(result.accessToken);
      return result;
    },
    stepUp: (totpCode: string) =>
      request(
        '/auth/step-up',
        { method: 'POST', body: JSON.stringify({ totpCode }) },
        (d) => stepUpResponseSchema.parse(d),
      ),
  },

  records: {
    list: (query?: { limit?: number; cursor?: string }) => {
      const params = new URLSearchParams();
      if (query?.limit) params.set('limit', String(query.limit));
      if (query?.cursor) params.set('cursor', query.cursor);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request(`/records${suffix}`, { method: 'GET' }, (d) => recordListSchema.parse(d));
    },
    get: (id: string) =>
      request(`/records/${id}`, { method: 'GET' }, (d) => recordEntitySchema.parse(d)),
    create: (input: CreateRecordInput) =>
      request(
        '/records',
        { method: 'POST', body: JSON.stringify(createRecordSchema.parse(input)) },
        (d) => recordEntitySchema.parse(d),
      ),
    schema: () =>
      request('/records/schema', { method: 'GET' }, (d) => recordFieldSchemaResponse.parse(d)),
    submit: (id: string) =>
      request(`/records/${id}/submit`, { method: 'POST' }, (d) => submitResponseSchema.parse(d)),
    verify: (id: string, versionId: string, stepUpToken: string) =>
      request(
        `/records/${id}/verify`,
        {
          method: 'POST',
          headers: { 'x-step-up-token': stepUpToken },
          body: JSON.stringify({ versionId }),
        },
        (d) => verifyResponseSchema.parse(d),
      ),
    versions: (id: string) =>
      request(`/records/${id}/versions`, { method: 'GET' }, (d) =>
        z.object({ data: z.array(versionSchema) }).parse(d),
      ),
    lineage: (id: string, depth = 2) =>
      request(`/records/${id}/lineage?depth=${depth}`, { method: 'GET' }, (d) =>
        lineageGraphSchema.parse(d),
      ),
    createVersion: (id: string, changeSummary: string) =>
      request(
        `/records/${id}/versions`,
        { method: 'POST', body: JSON.stringify({ changeSummary }) },
        (d) => versionSchema.parse(d),
      ),
  },

  uploads: {
    init: (input: { versionId: string; fileName: string; fileSize: number; mimeType: string }) =>
      request(
        '/uploads/init',
        { method: 'POST', body: JSON.stringify(input) },
        (d) => uploadInitResponseSchema.parse(d),
      ),
    /** PUT one part directly to its signed URL (same-origin through the proxy). */
    putPart: async (url: string, body: Blob): Promise<string> => {
      const res = await fetch(url, { method: 'PUT', body, credentials: 'include' });
      if (!res.ok) {
        throw new ApiError(res.status, null, `Part upload failed (${res.status})`);
      }
      const parsed = z.object({ etag: z.string() }).parse(await parseBody(res));
      return parsed.etag;
    },
    complete: (uploadId: string, parts: Array<{ partNumber: number; etag: string }>) =>
      request(
        `/uploads/${uploadId}/complete`,
        { method: 'POST', body: JSON.stringify({ parts }) },
        (d) => uploadCompleteResponseSchema.parse(d),
      ),
    status: (uploadId: string) =>
      request(`/uploads/${uploadId}/status`, { method: 'GET' }, (d) => uploadStatusSchema.parse(d)),
  },

  tasks: {
    list: (query?: { status?: string }) => {
      const params = new URLSearchParams();
      if (query?.status) params.set('status', query.status);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request(`/tasks${suffix}`, { method: 'GET' }, (d) => taskListSchema.parse(d));
    },
    detail: (taskId: string) =>
      request(`/tasks/${taskId}`, { method: 'GET' }, (d) => taskDetailSchema.parse(d)),
    decide: (
      taskId: string,
      input: { decision: string; comment?: string; requiredActions?: string[] },
    ) =>
      request(
        `/tasks/${taskId}/decision`,
        { method: 'POST', body: JSON.stringify(input) },
        (d) => decisionResponseSchema.parse(d),
      ),
  },

  certificates: {
    issue: (recordId: string, stepUpToken: string) =>
      request(
        `/records/${recordId}/certificate`,
        { method: 'POST', headers: { 'x-step-up-token': stepUpToken }, body: JSON.stringify({}) },
        (d) => certificateSchema.parse(d),
      ),
    revoke: (certificateId: string, reason: string, stepUpToken: string) =>
      request(
        `/certificates/${certificateId}/revoke`,
        {
          method: 'POST',
          headers: { 'x-step-up-token': stepUpToken },
          body: JSON.stringify({ reason }),
        },
        (d) => certificateSchema.parse(d),
      ),
    get: (certificateId: string) =>
      request(`/certificates/${certificateId}`, { method: 'GET' }, (d) =>
        certificateSchema.parse(d),
      ),
    /** Authenticated PDF download — returns bytes for a browser blob save. */
    pdf: async (certificateId: string): Promise<Blob> => {
      const res = await rawRequest(`/certificates/${certificateId}/pdf`, { method: 'GET' });
      if (!res.ok) {
        throw new ApiError(res.status, null, `PDF download failed (${res.status})`);
      }
      return res.blob();
    },
  },

  downloads: {
    /** Authenticated version download — returns bytes for a browser blob save. */
    version: async (recordId: string, versionId: string): Promise<Blob> => {
      const res = await rawRequest(`/records/${recordId}/versions/${versionId}/download`, {
        method: 'GET',
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new ApiError(res.status, null, `Download failed (${res.status})`);
      }
      return res.blob();
    },
  },

  public: {
    verify: (qrToken: string) =>
      request(`/public/verify/${encodeURIComponent(qrToken)}`, { method: 'GET' }, (d) =>
        publicVerificationSchema.parse(d),
      ),
  },

  receipts: {
    parse: (data: unknown): DepositReceipt => depositReceiptSchema.parse(data),
  },
};

const loginInputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});
