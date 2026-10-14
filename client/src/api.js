// API base: same-origin by default (single-process mode). Set VITE_API_URL at
// build time to point the frontend at a separately hosted API (Vercel frontend
// + Render API).
const BASE = (import.meta.env.VITE_API_URL || '') + '/api';
export function getToken() { return localStorage.getItem('alims_token'); }
export function setSession(token, user) { localStorage.setItem('alims_token', token); localStorage.setItem('alims_user', JSON.stringify(user)); }
export function getStoredUser() { try { return JSON.parse(localStorage.getItem('alims_user')); } catch { return null; } }
export function clearSession() { localStorage.removeItem('alims_token'); localStorage.removeItem('alims_user'); }
async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const api = {
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (body) => req('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => req('/auth/me'),
  stats: () => req('/stats'),
  institutions: () => req('/institutions'),
  researchers: () => req('/researchers'),
  records: (params = '') => req('/records' + params),
  record: (id) => req('/records/' + id),
  createRecord: (b) => req('/records', { method: 'POST', body: JSON.stringify(b) }),
  updateRecord: (id, b) => req('/records/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteRecord: (id) => req('/records/' + id, { method: 'DELETE' }),
  submitRecord: (id, note) => req(`/records/${id}/submit`, { method: 'POST', body: JSON.stringify({ note }) }),
  reviewRecord: (id, action, reason) => req(`/records/${id}/review`, { method: 'POST', body: JSON.stringify({ action, reason }) }),
  respondContributor: (id, name, decision, detail) => req(`/records/${id}/contributors/${encodeURIComponent(name)}/respond`, { method: 'POST', body: JSON.stringify({ decision, detail }) }),
  opportunities: () => req('/opportunities'),
  createOpportunity: (b) => req('/opportunities', { method: 'POST', body: JSON.stringify(b) }),
  updateOpportunity: (id, b) => req('/opportunities/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteOpportunity: (id) => req('/opportunities/' + id, { method: 'DELETE' }),
  respondOpportunity: (id) => req(`/opportunities/${id}/respond`, { method: 'POST', body: '{}' }),
  accessRequests: () => req('/access-requests'),
  createAccessRequest: (b) => req('/access-requests', { method: 'POST', body: JSON.stringify(b) }),
  patchAccessRequest: (id, status) => req('/access-requests/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }),
  disputes: () => req('/disputes'),
  createDispute: (b) => req('/disputes', { method: 'POST', body: JSON.stringify(b) }),
  patchDispute: (id, status) => req('/disputes/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }),
  verify: (code) => req('/verify/' + encodeURIComponent(code)),
  lineage: () => req('/lineage'),
  suggestions: () => req('/suggestions'),
};
export const VERIFY_STYLES = {
  'Institutionally Verified': 'green', 'Journal-Verified': 'green', 'Supervisor-Verified': 'teal',
  'Identity-Verified Deposit': 'blue', 'Self-Published': 'blue', 'Submitted': 'amber', 'In Review': 'amber',
  'Draft': 'gray', 'Returned for Revision': 'red', 'Under Dispute': 'red', 'Withdrawn': 'gray', 'Verification Revoked': 'red',
};

export const ops = {
  compliance: () => req('/compliance'),
  nerdSync: (id) => req(`/records/${id}/nerd-sync`, { method: 'POST', body: '{}' }),
  providers: () => req('/providers'),
  insights: () => req('/insights'),
  billing: () => req('/billing'),
  checkout: (plan) => req('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  comms: () => req('/comms'),
  sendComms: (b) => req('/comms', { method: 'POST', body: JSON.stringify(b) }),
  keys: () => req('/developer/keys'),
  createKey: (name) => req('/developer/keys', { method: 'POST', body: JSON.stringify({ name }) }),
  revokeKey: (id) => req('/developer/keys/' + id, { method: 'DELETE' }),
  bulkImport: (items) => req('/bulk-import', { method: 'POST', body: JSON.stringify({ items }) }),
  credential: (id) => req(`/records/${id}/credential`),
  enrich: (id) => fetch(BASE + `/records/${id}/enrich`).then(r => r.json()),
  abstract: (id, lang) => fetch(BASE + `/records/${id}/abstract/${lang}`).then(r => r.json()),
  orcid: (orcid) => req('/me/orcid', { method: 'POST', body: JSON.stringify({ orcid }) }),
  addFile: (id, b) => req(`/records/${id}/files`, { method: 'POST', body: JSON.stringify(b) }),
  runSimilarity: (id) => req(`/records/${id}/similarity/run`, { method: 'POST', body: '{}' }),
  charter: (id) => req(`/opportunities/${id}/charter`),
  acceptCharter: (id) => req(`/opportunities/${id}/charter`, { method: 'POST', body: '{}' }),
};
