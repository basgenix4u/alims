'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';
import { api } from '@/lib/api-client';
import { toneStyle, type StatusTone } from '@/features/certificates/status-vocabulary';
import { DepositStep } from '@/features/wizard/deposit-step';

const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  submitted: 'info',
  in_review: 'info',
  returned_for_revision: 'advisory',
  resubmitted: 'info',
  institutionally_verified: 'verified',
  published: 'verified',
  superseded: 'neutral',
  withdrawn: 'neutral',
  under_dispute: 'dispute',
  verification_revoked: 'danger',
};

/** Private record workspace: status, versions, deposits, submissions. */
export default function MyRecordPage() {
  const { t } = useI18n();
  const { state } = useSession();
  const params = useParams<{ id: string }>();
  const recordId = params?.id;

  const recordQuery = useQuery({
    queryKey: ['record', recordId],
    queryFn: () => api.records.get(recordId!),
    enabled: state.status === 'authenticated' && Boolean(recordId),
  });
  const versionsQuery = useQuery({
    queryKey: ['record', recordId, 'versions'],
    queryFn: () => api.records.versions(recordId!),
    enabled: state.status === 'authenticated' && Boolean(recordId),
  });

  if (state.status !== 'authenticated') {
    return (
      <main id="main" className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-bold">{t('recordDetail.title')}</h1>
        <p className="mt-4 text-ink-muted">
          {t('common.signInPrompt')}{' '}
          <Link href="/login" className="text-brand hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      </main>
    );
  }

  const record = recordQuery.data;
  const versions = versionsQuery.data?.data ?? [];

  return (
    <main id="main" className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      {recordQuery.isLoading ? <p role="status">{t('common.loading')}</p> : null}
      {recordQuery.isError ? (
        <p role="alert" className="tone-danger rounded-md border-2 px-4 py-3">
          {t('recordDetail.notFound')}
        </p>
      ) : null}

      {record ? (
        <>
          <header className="space-y-3">
            <p className="text-sm text-ink-muted">
              <Link href="/dashboard" className="text-brand hover:underline">
                ← {t('nav.dashboard')}
              </Link>
            </p>
            <h1 className="text-3xl font-bold text-ink">{record.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={toneStyle(STATUS_TONES[record.status] ?? 'neutral')}
              >
                {record.status}
              </span>
              {record.nxrId ? (
                <span className="font-mono text-xs text-ink-muted">
                  {t('recordDetail.nxr')}: {record.nxrId}
                </span>
              ) : null}
            </div>
          </header>

          <section className="rounded-lg border border-surface-border bg-surface p-5" aria-labelledby="record-fields-title">
            <h2 id="record-fields-title" className="text-lg font-bold text-ink">
              {t('recordDetail.fields')}
            </h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-ink-muted">{t('wizard.fields.outputType')}</dt>
              <dd>{record.outputType}</dd>
              <dt className="text-ink-muted">{t('wizard.fields.disciplines')}</dt>
              <dd>{record.disciplines.join(', ')}</dd>
              <dt className="text-ink-muted">{t('wizard.fields.keywords')}</dt>
              <dd>{record.keywords.join(', ')}</dd>
              {record.abstract ? (
                <>
                  <dt className="text-ink-muted">{t('wizard.fields.abstract')}</dt>
                  <dd>{record.abstract.slice(0, 400)}{record.abstract.length > 400 ? '…' : ''}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-surface-border bg-surface p-5" aria-labelledby="record-versions-title">
            <h2 id="record-versions-title" className="text-lg font-bold text-ink">
              {t('recordDetail.versions')}
            </h2>
            {versions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">{t('recordDetail.noVersions')}</p>
            ) : (
              <ol className="mt-3 divide-y divide-surface-border">
                {versions.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-ink">
                        {t('common.version')} {version.versionNo}
                        {version.isImmutable ? (
                          <span className="ms-2 rounded-full border border-surface-border px-2 py-0.5 text-xs text-ink-muted">
                            {t('recordDetail.versionSealed')}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-ink-muted">{version.changeSummary}</p>
                      {version.fileName ? (
                        <p className="text-xs text-ink-muted">
                          {version.fileName} · {t('review.scanStatus')}: {version.scanStatus}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      {version.submittedAt ? (
                        <span className="text-xs text-ink-muted">
                          {new Date(version.submittedAt).toLocaleDateString()}
                        </span>
                      ) : null}
                      {version.fileName ? (
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => {
                            void (async () => {
                              const blob = await api.downloads.version(record.id, version.id);
                              const url = URL.createObjectURL(blob);
                              const anchor = document.createElement('a');
                              anchor.href = url;
                              anchor.download = version.fileName ?? 'deposit';
                              anchor.click();
                              URL.revokeObjectURL(url);
                            })().catch(() => undefined);
                          }}
                        >
                          {t('recordDetail.downloadFile')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {record.status === 'draft' || record.status === 'returned_for_revision' ? (
            <section className="rounded-lg border border-surface-border bg-surface p-5">
              <h2 className="text-lg font-bold text-ink">{t('deposit.newVersionTitle')}</h2>
              <p className="mb-4 mt-1 text-sm text-ink-muted">{t('deposit.fileStepIntro')}</p>
              <DepositStep recordId={record.id} />
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
