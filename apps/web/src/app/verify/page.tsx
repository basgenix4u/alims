'use client';

import { CERTIFICATE_DISCLAIMER } from '@alims/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AssetRenderer } from '@/features/assets/asset-renderer';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';

export default function VerifyPage() {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const [submitted, setSubmitted] = useState('');

  const query = useQuery({
    queryKey: ['verify', submitted],
    queryFn: () => api.public.verify(submitted),
    enabled: Boolean(submitted),
  });

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('verify.title')}</h1>
        <p className="text-ink-muted">{t('verify.intro')}</p>
      </header>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(token.trim());
        }}
      >
        <label htmlFor="qr-token" className="sr-only">
          {t('verify.token')}
        </label>
        <input
          id="qr-token"
          className="input max-w-md"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          {t('verify.submit')}
        </button>
      </form>

      {query.isLoading ? <p role="status">{t('verify.loading')}</p> : null}
      {query.isError ? (
        <div
          role="alert"
          className="rounded-md border-2 border-amber-700 bg-amber-50 px-4 py-3 text-amber-950"
        >
          ⚠ {t('verify.notFound')}
        </div>
      ) : null}

      {query.data ? (
        <article className="space-y-4 rounded-xl border-2 border-surface-border bg-surface p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">
            {query.data.status}
          </p>
          <h2 className="text-2xl font-bold">{query.data.title}</h2>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">{t('verify.nxr')}</dt>
              <dd>{query.data.nxrId}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t('lineage.type')}</dt>
              <dd>{query.data.outputType}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t('verify.institution')}</dt>
              <dd>{query.data.institutionName}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t('verify.issued')}</dt>
              <dd>{query.data.issueDate}</dd>
            </div>
          </dl>
          <p>
            <span className="sr-only">{t('verify.researchers')} </span>
            {query.data.researcherNames.join(', ')}
          </p>
          <aside className="rounded-md border border-surface-border bg-surface-subtle p-3 text-sm">
            <p className="font-semibold">{t('verify.disclaimer')}</p>
            <p>{query.data.disclaimer || CERTIFICATE_DISCLAIMER}</p>
          </aside>
          <AssetRenderer title={query.data.title} />
        </article>
      ) : null}
    </main>
  );
}
