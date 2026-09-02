'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart } from '@/features/charts/bar-chart';
import { countByStatus, countByType } from '@/features/charts/aggregate';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';

export default function DashboardPage() {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['records', 'mine'],
    queryFn: () => api.records.list({ scope: 'mine', limit: 100 }),
  });

  const records = query.data?.data ?? [];
  const byStatus = countByStatus(records);
  const byType = countByType(records);

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-ink-muted">{t('dashboard.intro')}</p>
      </header>

      {query.isLoading ? <p role="status">{t('dashboard.loading')}</p> : null}

      {query.isError ? (
        <div
          role="alert"
          className="tone-advisory rounded-md border-2 px-4 py-3"
        >
          <p className="font-semibold">⚠ {t('dashboard.error')}</p>
        </div>
      ) : null}

      {!query.isLoading && !query.isError && records.length === 0 ? (
        <p>{t('dashboard.empty')}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <BarChart title={t('dashboard.byStatus')} buckets={byStatus} />
        <BarChart title={t('dashboard.byType')} buckets={byType} />
      </div>
    </main>
  );
}
