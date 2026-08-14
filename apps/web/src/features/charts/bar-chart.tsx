'use client';

import { useI18n } from '@/i18n/provider';
import type { Bucket } from './aggregate';

type Props = {
  title: string;
  buckets: Bucket[];
};

export function BarChart({ title, buckets }: Props) {
  const { t } = useI18n();
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const chartId = title.replace(/\s+/g, '-').toLowerCase();

  return (
    <figure className="space-y-3 rounded-xl border-2 border-surface-border bg-surface p-4">
      <figcaption className="font-semibold text-ink">{title}</figcaption>
      <svg
        role="img"
        aria-labelledby={`${chartId}-title`}
        viewBox={`0 0 400 ${Math.max(80, buckets.length * 28)}`}
        className="w-full"
      >
        <title id={`${chartId}-title`}>{title}</title>
        {buckets.map((bucket, index) => {
          const y = index * 28 + 4;
          const width = (bucket.count / max) * 260;
          return (
            <g key={bucket.key}>
              <text x={0} y={y + 12} className="fill-ink" fontSize="11">
                {bucket.label}
              </text>
              <rect
                x={130}
                y={y}
                width={260}
                height={16}
                fill="var(--color-border-soft, var(--border-soft))"
                rx={2}
              />
              <rect
                x={130}
                y={y}
                width={Math.max(bucket.count > 0 ? 4 : 0, width)}
                height={16}
                fill="var(--color-primary-bg, var(--brand-700))"
              />
              <text x={396} y={y + 12} textAnchor="end" className="fill-ink" fontSize="11">
                {bucket.count}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('dashboard.tableCaption')}</caption>
        <thead>
          <tr className="text-left text-ink-muted">
            <th scope="col">{t('dashboard.category')}</th>
            <th scope="col">{t('dashboard.count')}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key} className="border-t border-surface-border">
              <th scope="row" className="py-1 font-medium">
                {bucket.label}
              </th>
              <td className="py-1">{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
