'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';
import { api } from '@/lib/api-client';

/** The reviewer's queue (api_specification.md §7). */
export default function ReviewQueuePage() {
  const { t } = useI18n();
  const { state } = useSession();
  const query = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.tasks.list({ status: 'pending' }),
    enabled: state.status === 'authenticated',
  });

  const tasks = query.data?.data ?? [];

  return (
    <main id="main" className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-3xl font-bold">{t('review.queueTitle')}</h1>
        <p className="text-ink-muted">{t('review.queueIntro')}</p>
      </header>

      {state.status !== 'authenticated' ? (
        <p className="text-ink-muted">
          {t('common.signInPrompt')}{' '}
          <Link href="/login" className="text-brand hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      ) : null}

      {query.isLoading ? <p role="status">{t('common.loading')}</p> : null}

      {state.status === 'authenticated' && !query.isLoading && tasks.length === 0 ? (
        <p className="text-ink-muted">{t('review.queueEmpty')}</p>
      ) : null}

      {tasks.length > 0 ? (
        <ol className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <p className="font-semibold text-ink">{task.recordTitle}</p>
                <p className="text-sm text-ink-muted">
                  {t('common.version')} {task.versionNo} · {t('review.stage')}: {task.stage}
                  {task.isOverdue ? (
                    <span className="ms-2 font-semibold" style={{ color: 'var(--color-danger-subtle-fg)' }}>
                      {t('review.overdue')}
                    </span>
                  ) : null}
                </p>
              </div>
              <Link href={`/review/${task.id}`} className="btn-secondary px-3 py-1.5 text-sm">
                {t('review.open')}
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
