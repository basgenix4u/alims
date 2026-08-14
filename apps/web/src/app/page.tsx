import Link from 'next/link';
import { HealthStatus } from '@/components/health-status';
import { translate } from '@/i18n';

export default function HomePage() {
  const t = (key: Parameters<typeof translate>[1]) => translate('en', key);
  return (
    <main id="main" className="mx-auto max-w-6xl px-6 py-12">
      <header className="max-w-3xl space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">{t('brand.name')}</h1>
        <p className="text-lg text-ink-muted">{t('home.heading')}</p>
        <p className="font-medium text-brand">{t('brand.motto')}</p>
        <p className="text-ink-muted">{t('home.lede')}</p>
      </header>

      <section aria-labelledby="status-heading" className="mt-12">
        <h2 id="status-heading" className="text-xl font-semibold">
          {t('home.statusHeading')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('home.statusHelp')}</p>
        <div className="mt-4">
          <HealthStatus />
        </div>
      </section>

      <section aria-labelledby="next-heading" className="mt-12">
        <h2 id="next-heading" className="text-xl font-semibold">
          {t('home.nextHeading')}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li>
            <Link
              className="block rounded-xl border-2 border-surface-border bg-surface p-4 hover:border-brand"
              href="/records/new"
            >
              {t('nav.newRecord')}
            </Link>
          </li>
          <li>
            <Link
              className="block rounded-xl border-2 border-surface-border bg-surface p-4 hover:border-brand"
              href="/dashboard"
            >
              {t('nav.dashboard')}
            </Link>
          </li>
          <li>
            <Link
              className="block rounded-xl border-2 border-surface-border bg-surface p-4 hover:border-brand"
              href="/lineage"
            >
              {t('nav.lineage')}
            </Link>
          </li>
          <li>
            <Link
              className="block rounded-xl border-2 border-surface-border bg-surface p-4 hover:border-brand"
              href="/verify"
            >
              {t('nav.verify')}
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
