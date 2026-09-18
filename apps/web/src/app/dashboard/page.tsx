'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart } from '@/features/charts/bar-chart';
import { countByStatus, countByType } from '@/features/charts/aggregate';
import { api, type RecordEntity } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';
import { toneStyle, type StatusTone } from '@/features/certificates/status-vocabulary';

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

export default function DashboardPage() {
  const { t } = useI18n();
  const { state } = useSession();
  const query = useQuery({
    queryKey: ['records', 'mine'],
    queryFn: () => api.records.list({ limit: 100 }),
    enabled: state.status === 'authenticated',
  });

  const records: RecordEntity[] = query.data?.items ?? [];
  const byStatus = countByStatus(records);
  const byType = countByType(records);

  if (state.status === 'loading') {
    return (
      <main id="main" className="mx-auto max-w-6xl px-6 py-12">
        <p role="status">{t('common.loading')}</p>
      </main>
    );
  }

  if (state.status !== 'authenticated') {
    return (
      <main id="main" className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
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
    <main id="main" className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-ink-muted">{t('dashboard.intro')}</p>
        <p className="text-sm text-ink-muted">{t('common.notYou', { name: state.user.displayName })}</p>
      </header>

      {query.isLoading ? <p role="status">{t('dashboard.loading')}</p> : null}

      {query.isError ? (
        <div role="alert" className="tone-advisory rounded-md border-2 px-4 py-3">
          <p className="font-semibold">⚠ {t('dashboard.error')}</p>
        </div>
      ) : null}

      {!query.isLoading && !query.isError && records.length === 0 ? (
        <p>{t('dashboard.empty')}</p>
      ) : null}

      {records.length > 0 ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarChart title={t('dashboard.byStatus')} buckets={byStatus} />
            <BarChart title={t('dashboard.byType')} buckets={byType} />
          </div>

          <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
            {records.map((record) => {
              const tone = STATUS_TONES[record.status] ?? 'neutral';
              return (
                <li key={record.id}>
                  <Link
                    href={`/my-records/${record.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-subtle"
                  >
                    <span className="font-medium text-ink">{record.title}</span>
                    <span
                      className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                      style={toneStyle(tone)}
                    >
                      {record.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </main>
  );
}
