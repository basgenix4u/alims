'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/i18n/provider';
import { useSession, errorMessage } from '@/features/session/session-provider';
import { StepUpModal } from '@/features/session/step-up-modal';
import { api } from '@/lib/api-client';

/**
 * Member management (api_specification.md §4 "Members", PRD §6.1).
 *
 * Registry and institution administrators list, add, invite, re-role and
 * revoke members. Role changes require a fresh step-up assertion; revoked
 * memberships keep their row and history — never a hard delete.
 */

const ROLES = ['student', 'supervisor', 'dept_admin', 'examiner', 'registry', 'librarian', 'inst_admin'] as const;
const STATUSES = ['active', 'pending', 'revoked'] as const;
type MemberRow = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  departmentId: string | null;
  programmeId: string | null;
  createdAt: string;
};

export default function MembersPage() {
  const { t } = useI18n();
  const { state } = useSession();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<(typeof ROLES)[number]>('student');

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState<(typeof ROLES)[number]>('student');
  const [bulkResults, setBulkResults] = useState<Array<{ email: string; outcome: string }> | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [roleEdit, setRoleEdit] = useState<{ memberId: string; email: string } | null>(null);
  const [roleChoice, setRoleChoice] = useState<(typeof ROLES)[number]>('student');
  const [revokeTarget, setRevokeTarget] = useState<MemberRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const institution = useMemo(() => {
    if (state.status !== 'authenticated') return null;
    return state.user.memberships.find((m) => m.status === 'active') ?? null;
  }, [state]);

  const canManage =
    institution !== null && (institution.role === 'registry' || institution.role === 'inst_admin');

  const query = useQuery({
    queryKey: ['members', institution?.institutionId, roleFilter, statusFilter, search],
    queryFn: () =>
      api.members.list(institution!.institutionId, {
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search.trim() ? { q: search.trim() } : {}),
      }),
    enabled: state.status === 'authenticated' && canManage,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['members'] });
  };

  const addMember = async () => {
    if (!institution) return;
    setAddError(null);
    setAddOk(null);
    try {
      const added = await api.members.add(institution.institutionId, {
        email: newEmail.trim(),
        role: newRole,
      });
      setAddOk(`${added.displayName} (${added.email}) — ${added.role}`);
      setNewEmail('');
      await refresh();
    } catch (err) {
      setAddError(errorMessage(err));
    }
  };

  const bulkInvite = async () => {
    if (!institution) return;
    setBulkError(null);
    setBulkResults(null);
    const invitations = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 500)
      .map((email) => ({ email, role: bulkRole }));
    if (invitations.length === 0) return;
    try {
      const result = await api.members.bulkInvite(institution.institutionId, invitations);
      setBulkResults(result.invitations.map((i) => ({ email: i.email, outcome: i.outcome })));
      setBulkText('');
      await refresh();
    } catch (err) {
      setBulkError(errorMessage(err));
    }
  };

  const onStepUpAsserted = async (stepUpToken: string) => {
    const target = roleEdit;
    setRoleEdit(null);
    if (!target) return;
    setActionError(null);
    setActionOk(null);
    try {
      await api.members.update(target.memberId, { role: roleChoice }, stepUpToken);
      setActionOk(`${target.email} → ${roleChoice}`);
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const revoke = async () => {
    const target = revokeTarget;
    setRevokeTarget(null);
    if (!target) return;
    setActionError(null);
    setActionOk(null);
    try {
      await api.members.revoke(target.id);
      setActionOk(t('members.revoked'));
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  if (state.status !== 'authenticated') {
    return (
      <main id="main" className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-bold">{t('members.title')}</h1>
        <p className="mt-4 text-ink-muted">
          {t('common.signInPrompt')}{' '}
          <Link href="/login" className="text-brand hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      </main>
    );
  }

  if (!canManage) {
    return (
      <main id="main" className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-bold">{t('members.title')}</h1>
        <p role="alert" className="tone-danger mt-4 rounded-md border-2 px-4 py-3">
          {t('review.notYourTask')}
        </p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">{t('members.title')}</h1>
        <p className="text-sm text-ink-muted">{t('members.intro')}</p>
      </header>

      {actionOk ? (
        <p role="status" className="tone-success rounded-md border-2 px-4 py-3 text-sm">
          {actionOk}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="tone-danger rounded-md border-2 px-4 py-3 text-sm">
          {actionError}
        </p>
      ) : null}

      {/* Add + bulk invite */}
      <section className="rounded-lg border border-surface-border bg-surface p-5 space-y-4" aria-labelledby="add-member-title">
        <h2 id="add-member-title" className="text-lg font-bold text-ink">
          {t('members.addTitle')}
        </h2>
        <p className="text-sm text-ink-muted">{t('members.addHelp')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="member-email" className="block text-sm font-semibold text-ink">
              {t('members.email')}
            </label>
            <input
              id="member-email"
              type="email"
              className="input mt-1"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="person@university.edu"
            />
          </div>
          <div>
            <label htmlFor="member-role" className="block text-sm font-semibold text-ink">
              {t('members.role')}
            </label>
            <select
              id="member-role"
              className="input mt-1"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as (typeof ROLES)[number])}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!newEmail.includes('@')}
            onClick={() => void addMember()}
          >
            {t('members.add')}
          </button>
        </div>
        {addOk ? (
          <p role="status" className="tone-success text-sm">
            {t('members.added')} {addOk}
          </p>
        ) : null}
        {addError ? (
          <p role="alert" className="tone-danger text-sm">
            {addError}
          </p>
        ) : null}

        {bulkOpen ? (
          <div className="space-y-2 border-t border-surface-border pt-4">
            <p className="text-sm font-semibold text-ink">{t('members.bulkTitle')}</p>
            <p className="text-sm text-ink-muted">{t('members.bulkHelp')}</p>
            <textarea
              aria-label={t('members.bulkTitle')}
              className="input"
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'one@email.edu\nanother@email.edu'}
            />
            <div className="flex items-end gap-3">
              <div>
                <label htmlFor="bulk-role" className="block text-sm font-semibold text-ink">
                  {t('members.bulkRole')}
                </label>
                <select
                  id="bulk-role"
                  className="input mt-1"
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value as (typeof ROLES)[number])}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => void bulkInvite()}>
                {t('members.bulkGo')}
              </button>
            </div>
            {bulkError ? (
              <p role="alert" className="tone-danger text-sm">
                {bulkError}
              </p>
            ) : null}
            {bulkResults ? (
              <div>
                <p className="text-sm font-semibold text-ink">{t('members.bulkResult')}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {bulkResults.map((r) => (
                    <li key={r.email}>
                      <span className="font-semibold text-ink">{r.email}</span> —{' '}
                      {r.outcome === 'invited'
                        ? t('members.invited')
                        : r.outcome === 'already_member'
                          ? t('members.alreadyMember')
                          : t('members.noAccount')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setBulkOpen(true)}>
            {t('members.bulkTitle')}
          </button>
        )}
      </section>

      {/* Roster */}
      <section className="rounded-lg border border-surface-border bg-surface p-5 space-y-4" aria-labelledby="roster-title">
        <h2 id="roster-title" className="text-lg font-bold text-ink">
          {institution!.institutionName}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="member-search" className="block text-sm font-semibold text-ink">
              {t('members.search')}
            </label>
            <input
              id="member-search"
              className="input mt-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="member-role-filter" className="block text-sm font-semibold text-ink">
              {t('members.role')}
            </label>
            <select
              id="member-role-filter"
              className="input mt-1"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">{t('members.filterAll')}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="member-status-filter" className="block text-sm font-semibold text-ink">
              {t('members.status')}
            </label>
            <select
              id="member-status-filter"
              className="input mt-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{t('members.filterAll')}</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {query.isLoading ? <p role="status">{t('common.loading')}</p> : null}
        {query.isError ? (
          <p role="alert" className="tone-danger rounded-md border-2 px-4 py-3 text-sm">
            {errorMessage(query.error)}
          </p>
        ) : null}

        {query.data && query.data.items.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('members.empty')}</p>
        ) : null}

        {query.data && query.data.items.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="py-2">{t('members.email')}</th>
                <th scope="col" className="py-2">{t('members.role')}</th>
                <th scope="col" className="py-2">{t('members.status')}</th>
                <th scope="col" className="py-2 sr-only">{t('members.changeRole')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((member) => (
                <tr key={member.id} className="border-t border-surface-border">
                  <td className="py-2">
                    <span className="font-semibold text-ink">{member.displayName}</span>
                    <br />
                    <span className="text-ink-muted">{member.email}</span>
                  </td>
                  <td className="py-2">{member.role}</td>
                  <td className="py-2">{member.status}</td>
                  <td className="py-2 text-right">
                    {member.status !== 'revoked' ? (
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={member.userId === state.user.id}
                          title={member.userId === state.user.id ? t('members.selfGuard') : undefined}
                          onClick={() => {
                            setRoleChoice(member.role as (typeof ROLES)[number]);
                            setRoleEdit({ memberId: member.id, email: member.email });
                          }}
                        >
                          {t('members.changeRole')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={member.userId === state.user.id}
                          title={member.userId === state.user.id ? t('members.selfGuard') : undefined}
                          onClick={() => setRevokeTarget(member)}
                        >
                          {t('members.revoke')}
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <StepUpModal
        open={roleEdit !== null}
        actionLabel={`${t('members.changeRole')}: ${roleEdit?.email ?? ''} → ${roleChoice}`}
        onClose={() => setRoleEdit(null)}
        onAsserted={(token) => void onStepUpAsserted(token)}
      />

      {revokeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-confirm-title"
            className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg"
          >
            <h2 id="revoke-confirm-title" className="text-lg font-bold text-ink">
              {t('members.revoke')} — {revokeTarget.email}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{t('members.confirmRevoke')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setRevokeTarget(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void revoke()}>
                {t('members.revoke')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
