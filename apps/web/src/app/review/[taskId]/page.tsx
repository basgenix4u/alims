'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';
import { errorMessage } from '@/features/session/session-provider';
import { StepUpModal } from '@/features/session/step-up-modal';
import { api, type CertificateView } from '@/lib/api-client';

type Decision = 'approve' | 'return_for_revision' | 'request_contribution_correction' | 'escalate_integrity';

/**
 * Similarity panel (spec §7, PRD §6.5): the advisory assessment plus the
 * human integrity-review form. The advisory sentence is always shown —
 * a high score must never read as an accusation — and recording an
 * outcome never changes the record status.
 */
function SimilarityPanel({ recordId, versionId }: { recordId: string; versionId: string }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['similarity', versionId],
    queryFn: () => api.similarity.get(recordId, versionId),
  });
  const assessment = query.data;

  type IntegrityOutcomeChoice =
    | 'no_issue'
    | 'citation_correction_required'
    | 'attribution_correction_required'
    | 'escalated'
    | 'inconclusive';
  const [outcome, setOutcome] = useState<IntegrityOutcomeChoice>('no_issue');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.similarity.review(recordId, versionId, { outcome, reason });
      setReviewed(true);
      await query.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (query.isLoading) return <p role="status">{t('common.loading')}</p>;
  // Authorised reviewers always see the assessment; anything else is a
  // muted no-op so the panel never blocks the decision bench.
  if (query.isError || !assessment) {
    return <p className="text-sm text-ink-muted">{t('review.similarityUnavailable')}</p>;
  }

  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">{t('review.similarityStatus')}</dt>
        <dd>{assessment.status}</dd>
        <dt className="text-ink-muted">{t('review.similarityScore')}</dt>
        <dd>{assessment.score === null ? '—' : `${assessment.score}%`}</dd>
        <dt className="text-ink-muted">{t('review.similarityProvider')}</dt>
        <dd>{assessment.provider}</dd>
      </dl>
      <p className="tone-warning rounded-md border-2 px-4 py-3 text-sm" role="note">
        {assessment.advisoryNotice}
      </p>

      {reviewed ? (
        <p role="status">{t('review.similaritySubmitted')}</p>
      ) : (
        <div className="space-y-2">
          <div>
            <label htmlFor="similarity-outcome" className="block text-sm font-semibold text-ink">
              {t('review.similarityOutcome')}
            </label>
            <select
              id="similarity-outcome"
              className="input mt-1"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as IntegrityOutcomeChoice)}
            >
              <option value="no_issue">No issue</option>
              <option value="citation_correction_required">Citation correction required</option>
              <option value="attribution_correction_required">Attribution correction required</option>
              <option value="escalated">Escalation to formal institutional process</option>
              <option value="inconclusive">Inconclusive</option>
            </select>
          </div>
          <div>
            <label htmlFor="similarity-reason" className="block text-sm font-semibold text-ink">
              {t('review.similarityReason')}
            </label>
            <p className="text-sm text-ink-muted">{t('review.similarityReasonHelp')}</p>
            <textarea
              id="similarity-reason"
              className="input mt-1"
              rows={3}
              minLength={10}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="tone-danger text-sm">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || reason.trim().length < 10}
            onClick={() => void submit()}
          >
            {t('review.similaritySubmit')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Review task detail: the decision bench, verification, and certificates (spec §7–§8). */
export default function ReviewTaskPage() {
  const { t } = useI18n();
  const { state } = useSession();
  const params = useParams<{ taskId: string }>();
  const taskId = params?.taskId;

  const [decision, setDecision] = useState<Decision>('approve');
  const [comment, setComment] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [actionDraft, setActionDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [verification, setVerification] = useState<{ nxrId: string } | null>(null);
  const [certificate, setCertificate] = useState<CertificateView | null>(null);
  const [stepUpFor, setStepUpFor] = useState<'verify' | 'certificate' | null>(null);

  const query = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.tasks.detail(taskId!),
    enabled: state.status === 'authenticated' && Boolean(taskId),
  });
  const task = query.data;

  const isFinalStage = Boolean(task && /verification/i.test(task.stage));

  const decide = async () => {
    if (!taskId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.tasks.decide(taskId, {
        decision,
        ...(decision !== 'approve' ? { comment } : {}),
        ...(decision === 'return_for_revision' || decision === 'request_contribution_correction'
          ? { requiredActions: actions }
          : {}),
      });
      setOutcome(
        result.nextStage
          ? `${t('review.decided')} → ${result.nextStage}`
          : t('review.decided'),
      );
      await query.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onStepUpAsserted = async (stepUpToken: string) => {
    const purpose = stepUpFor;
    setStepUpFor(null);
    if (!task || !purpose) return;
    setBusy(true);
    setError(null);
    try {
      if (purpose === 'verify') {
        const result = await api.records.verify(task.recordId, task.versionId, stepUpToken);
        setVerification({ nxrId: result.nxrId });
        await query.refetch();
      } else {
        const cert = await api.certificates.issue(task.recordId, stepUpToken);
        setCertificate(cert);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!certificate) return;
    const blob = await api.certificates.pdf(certificate.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alims-certificate-${certificate.certificateNo}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (state.status !== 'authenticated') {
    return (
      <main id="main" className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">{t('review.detailTitle')}</h1>
        <p className="mt-4 text-ink-muted">
          {t('common.signInPrompt')}{' '}
          <Link href="/login" className="text-brand hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <p className="text-sm text-ink-muted">
        <Link href="/review" className="text-brand hover:underline">
          ← {t('review.queueTitle')}
        </Link>
      </p>

      {query.isLoading ? <p role="status">{t('common.loading')}</p> : null}
      {query.isError ? (
        <p role="alert" className="tone-danger rounded-md border-2 px-4 py-3">
          {t('review.notYourTask')}
        </p>
      ) : null}

      {task ? (
        <>
          <header className="space-y-2">
            <h1 className="text-2xl font-bold text-ink">{task.recordTitle}</h1>
            <p className="text-sm text-ink-muted">
              {t('common.version')} {task.versionNo} · {t('review.stage')}: {task.stage} ·{' '}
              {t('common.status')}: {task.status}
            </p>
          </header>

          <section className="rounded-lg border border-surface-border bg-surface p-5 space-y-3" aria-labelledby="task-facts">
            <h2 id="task-facts" className="text-lg font-bold text-ink">{t('review.detailTitle')}</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-ink-muted">{t('review.changeSummary')}</dt>
              <dd>{task.changeSummary ?? '—'}</dd>
              <dt className="text-ink-muted">{t('review.file')}</dt>
              <dd>
                {task.fileName ?? '—'} · {t('review.scanStatus')}: {task.scanStatus}
              </dd>
              <dt className="text-ink-muted">{t('common.status')}</dt>
              <dd>{task.recordStatus}</dd>
            </dl>
            {task.contributors.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-ink">{t('review.contributors')}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-ink-muted">
                  {task.contributors.map((c, i) => (
                    <li key={i}>
                      {c.displayName}
                      {c.isSupervision ? ' (supervision)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {task.priorDecisions.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-ink">{t('review.priorDecisions')}</p>
                <ul className="mt-1 space-y-1 text-sm text-ink-muted">
                  {task.priorDecisions.map((d, i) => (
                    <li key={i}>
                      <span className="font-semibold text-ink">{d.decision}</span> — {d.comment} (
                      {d.reviewerName})
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{t('review.noPriorDecisions')}</p>
            )}
          </section>

          <section className="rounded-lg border border-surface-border bg-surface p-5 space-y-3" aria-labelledby="similarity-title">
            <h2 id="similarity-title" className="text-lg font-bold text-ink">
              {t('review.similarityTitle')}
            </h2>
            <SimilarityPanel recordId={task.recordId} versionId={task.versionId} />
          </section>

          {task.status === 'pending' ? (
            <section className="rounded-lg border border-surface-border bg-surface p-5 space-y-4" aria-labelledby="decision-title">
              <h2 id="decision-title" className="text-lg font-bold text-ink">
                {t('review.decisionTitle')}
              </h2>
              <fieldset className="space-y-2">
                <legend className="sr-only">{t('review.decisionTitle')}</legend>
                {(
                  [
                    ['approve', t('review.decisionApprove')],
                    ['return_for_revision', t('review.decisionReturn')],
                    ['request_contribution_correction', t('review.decisionCorrection')],
                    ['escalate_integrity', t('review.decisionEscalate')],
                  ] as Array<[Decision, string]>
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="decision"
                      value={value}
                      checked={decision === value}
                      onChange={() => setDecision(value)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              {decision !== 'approve' ? (
                <div>
                  <label htmlFor="decision-comment" className="block text-sm font-semibold text-ink">
                    {t('review.comment')}
                  </label>
                  <p className="text-sm text-ink-muted">{t('review.commentHelp')}</p>
                  <textarea
                    id="decision-comment"
                    className="input mt-1"
                    rows={3}
                    minLength={10}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              ) : null}

              {decision === 'return_for_revision' || decision === 'request_contribution_correction' ? (
                <div>
                  <label htmlFor="decision-action" className="block text-sm font-semibold text-ink">
                    {t('review.requiredActions')}
                  </label>
                  <p className="text-sm text-ink-muted">{t('review.requiredActionsHelp')}</p>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="decision-action"
                      className="input"
                      value={actionDraft}
                      onChange={(e) => setActionDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (actionDraft.trim()) {
                            setActions((list) => [...list, actionDraft.trim()]);
                            setActionDraft('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        if (actionDraft.trim()) {
                          setActions((list) => [...list, actionDraft.trim()]);
                          setActionDraft('');
                        }
                      }}
                    >
                      {t('review.addAction')}
                    </button>
                  </div>
                  {actions.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc text-sm">
                      {actions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className="btn-primary"
                onClick={() => void decide()}
                disabled={busy || (decision !== 'approve' && comment.trim().length < 10)}
              >
                {busy ? t('review.deciding') : t('review.decide')}
              </button>
            </section>
          ) : null}

          {isFinalStage && task.status === 'pending' ? (
            <section className="rounded-lg border-2 border-brand/40 bg-surface p-5 space-y-3" aria-labelledby="verify-title">
              <h2 id="verify-title" className="text-lg font-bold text-ink">
                {t('review.verifyTitle')}
              </h2>
              <p className="text-sm text-ink-muted">{t('review.verifyIntro')}</p>
              {verification ? (
                <p role="status" className="tone-verified rounded-md border-2 px-3 py-2 text-sm">
                  ✓ {t('review.verified', { nxrId: verification.nxrId })}
                </p>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setStepUpFor('verify')}
                  disabled={busy}
                >
                  {busy ? t('review.verifying') : t('review.verify')}
                </button>
              )}
            </section>
          ) : null}

          {verification && !certificate ? (
            <section className="rounded-lg border border-surface-border bg-surface p-5 space-y-3" aria-labelledby="cert-title">
              <h2 id="cert-title" className="text-lg font-bold text-ink">
                {t('review.issueCertificate')}
              </h2>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStepUpFor('certificate')}
                disabled={busy}
              >
                {busy ? t('review.issuingCertificate') : t('review.issueCertificate')}
              </button>
            </section>
          ) : null}

          {certificate ? (
            <section className="tone-verified rounded-lg border-2 px-5 py-4 space-y-3">
              <p role="status" className="text-sm">
                ✓ {t('review.certificateIssued', { number: certificate.certificateNo })}
              </p>
              <p className="font-mono text-sm">{certificate.nxrId}</p>
              <button type="button" className="btn-secondary" onClick={() => void downloadPdf()}>
                {t('review.downloadPdf')}
              </button>
            </section>
          ) : null}

          {outcome ? (
            <p role="status" className="tone-verified rounded-md border-2 px-3 py-2 text-sm">
              ✓ {outcome}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="tone-danger rounded-md border-2 px-3 py-2 text-sm">
              ✕ {error}
            </p>
          ) : null}
        </>
      ) : null}

      <StepUpModal
        open={stepUpFor !== null}
        actionLabel={
          stepUpFor === 'verify' ? t('review.verifyTitle') : t('review.issueCertificate')
        }
        onClose={() => setStepUpFor(null)}
        onAsserted={(token) => void onStepUpAsserted(token)}
      />
    </main>
  );
}
